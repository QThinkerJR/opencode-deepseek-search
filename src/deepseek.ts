// DeepSeek Search / Fetch HTTP core.
//
// Responsibilities: request shaping, retry policy, response mapping and
// user-facing error messages (rendered through the i18n tables). No plugin
// context and no storage here, so every mapper below is unit-testable without
// network access.

import { t } from "./i18n/index.ts"
import type { Language } from "./rpc.ts"

export const API_BASE = "https://api.deepseek.com"
export const SEARCH_PATH = "/v1/tools/search"
export const FETCH_PATH = "/v1/tools/fetch"

export const SEARCH_TIMEOUT_MS = 15_000
export const FETCH_TIMEOUT_MS = 30_000
const RETRY_DELAY_MS = 1_000
const RETRY_DELAY_MAX_MS = 5_000
export const MAX_QUERY_CHARS = 128
export const MAX_URL_CHARS = 8192

// Docs: back off and retry on 408/429/5xx only; other 4xx must not be retried.
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504])

export interface SearchResult {
  url: string
  title?: string
  content?: string
  time: { published?: number }
}

export interface FetchResult {
  markdown: string
  chars: number
  empty: boolean
  truncated: boolean
}

export function missingKeyMessage(language: Language): string {
  return t(language, "error.missingKey")
}

// ---------- abort plumbing: combine the caller signal with a timeout ----------

function mergeAbort(signal: AbortSignal | undefined, timeoutMs: number) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const onAbort = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener("abort", onAbort, { once: true })
  }
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
    },
  }
}

function abortErr(): Error {
  return Object.assign(new Error("Aborted"), { name: "AbortError" })
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortErr())
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortErr())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

// ---------- error mapping ----------

function upstreamMessage(body: string, language: Language): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } }
    const message = parsed?.error?.message
    if (typeof message !== "string" || !message.trim()) return ""
    // The provider text is kept verbatim; only the separator is localized.
    const separator = language === "en" ? ": " : "："
    return `${separator}${message.trim()}`
  } catch {
    return ""
  }
}

export function httpError(status: number, body: string, isFetch: boolean, language: Language): Error {
  const upstream = upstreamMessage(body, language)
  const hint = isFetch ? t(language, "error.http.fetchHint") : ""
  const params = { upstream, hint, status }
  switch (status) {
    case 400:
      return new Error(t(language, "error.http.400", params))
    case 401:
      return new Error(t(language, "error.http.401", params))
    case 402:
      return new Error(t(language, "error.http.402", params))
    case 403:
      return new Error(t(language, "error.http.403", params))
    case 404:
      return new Error(t(language, "error.http.404", params))
    case 408:
      return new Error(t(language, "error.http.408", params))
    case 413:
      return new Error(t(language, "error.http.413", params))
    case 429:
      return new Error(t(language, "error.http.429", params))
    default:
      if (status >= 500) return new Error(t(language, "error.http.5xx", params))
      return new Error(t(language, "error.http.other", params))
  }
}

function retryAfterMs(headers: Headers): number {
  const raw = Number.parseInt(headers.get("retry-after") ?? "", 10)
  if (Number.isFinite(raw)) return Math.min(RETRY_DELAY_MAX_MS, Math.max(0, raw * 1000))
  return RETRY_DELAY_MS
}

// ---------- shared HTTP core: timeout, signal passthrough, single retry ----------

export async function postJson(
  path: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
  language: Language,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!apiKey) throw new Error(missingKeyMessage(language))
  for (let attempt = 1; ; attempt++) {
    const merged = mergeAbort(signal, timeoutMs)
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: merged.signal,
      })
      if (res.ok) {
        const text = await res.text()
        try {
          return JSON.parse(text) as unknown
        } catch {
          throw new Error(t(language, "error.parse", { status: res.status }))
        }
      }
      const text = await res.text().catch(() => "")
      if (attempt < 2 && RETRYABLE.has(res.status)) {
        await sleep(retryAfterMs(res.headers), signal)
        continue
      }
      throw httpError(res.status, text, path === FETCH_PATH, language)
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(
          signal?.aborted
            ? t(language, "error.aborted")
            : t(language, "error.timeout", { seconds: Math.round(timeoutMs / 1000) }),
        )
      }
      // fetch() rejects with TypeError on DNS/TLS/proxy failures.
      if (e instanceof TypeError) {
        throw new Error(t(language, "error.network", { base: API_BASE, message: e.message }))
      }
      throw e
    } finally {
      merged.dispose()
    }
  }
}

// ---------- DeepSeek Search -> WebSearch.Result[] ----------

interface SearchRow {
  url?: unknown
  title?: unknown
  snippet?: unknown
  summary?: unknown
  date?: unknown
}

export function mapSearchResults(data: unknown): SearchResult[] {
  const rows = (data as { results?: unknown })?.results
  if (!Array.isArray(rows)) return []
  const out: SearchResult[] = []
  for (const row of rows) {
    const r = (row ?? {}) as SearchRow
    if (typeof r.url !== "string" || r.url.length === 0) continue
    // `summary` (600-800 chars) is written for models; `content` is full page
    // text and must never enter search results (context safety).
    const content =
      typeof r.summary === "string" && r.summary.length > 0
        ? r.summary
        : typeof r.snippet === "string" && r.snippet.length > 0
          ? r.snippet
          : undefined
    const published = typeof r.date === "string" ? Date.parse(r.date) : Number.NaN
    out.push({
      url: r.url,
      title: typeof r.title === "string" && r.title.length > 0 ? r.title : undefined,
      content,
      time: Number.isFinite(published) ? { published } : {},
    })
  }
  return out
}

export function buildSearchBody(query: string, count: number): { query: string; count: number } {
  // need_content stays false: full page text must never enter search results.
  return { query, count }
}

export async function deepseekSearch(
  query: string,
  apiKey: string,
  count: number,
  language: Language,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const data = await postJson(
    SEARCH_PATH,
    buildSearchBody(query, count),
    apiKey,
    SEARCH_TIMEOUT_MS,
    language,
    signal,
  )
  return mapSearchResults(data)
}

// ---------- DeepSeek Fetch -> Markdown with truncation ----------

export function mapFetchResponse(
  data: unknown,
  url: string,
  maxChars: number,
  language: Language,
): FetchResult {
  const title = typeof (data as { title?: unknown })?.title === "string" ? (data as { title: string }).title : ""
  const raw = typeof (data as { content?: unknown })?.content === "string" ? (data as { content: string }).content : ""
  const truncated = raw.length > maxChars
  let body = truncated ? raw.slice(0, maxChars) : raw
  if (truncated) {
    body += `\n\n${t(language, "error.fetch.truncated", { raw: raw.length, max: maxChars })}`
  }
  return {
    markdown: `# ${title || url}\n${t(language, "fetch.source", { url })}\n\n${body}`,
    chars: raw.length,
    empty: raw.length === 0,
    truncated,
  }
}

export function validateUrl(url: string, language: Language): string | undefined {
  if (!/^https?:\/\//i.test(url)) return t(language, "error.validate.urlScheme", { url })
  if (url.length > MAX_URL_CHARS)
    return t(language, "error.validate.urlLong", { length: url.length, max: MAX_URL_CHARS })
  try {
    const parsed = new URL(url)
    if (!parsed.host) return t(language, "error.validate.urlHost", { url })
    if (parsed.username || parsed.password) return t(language, "error.validate.urlUserinfo")
  } catch {
    return t(language, "error.validate.urlParse", { url })
  }
  return undefined
}

export async function deepseekFetch(
  url: string,
  apiKey: string,
  maxChars: number,
  language: Language,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const data = await postJson(FETCH_PATH, { url }, apiKey, FETCH_TIMEOUT_MS, language, signal)
  return mapFetchResponse(data, url, maxChars, language)
}

export function validateQuery(query: string, language: Language): string | undefined {
  if (query.length === 0) return t(language, "error.validate.queryEmpty")
  if (query.length > MAX_QUERY_CHARS)
    return t(language, "error.validate.queryLong", { length: query.length, max: MAX_QUERY_CHARS })
  return undefined
}

// Rendered exactly like the built-in websearch tool: one `## [title](url)` block
// per result, `summary` as the body, no JSON wrapper.
export const NO_RESULTS = "No search results found. Please try a different query."

export function formatSearchResults(results: readonly SearchResult[]): string {
  if (results.length === 0) return NO_RESULTS
  return results
    .map((result) => {
      const title = result.title ?? result.url
      const published = result.time.published
        ? `\nPublished: ${new Date(result.time.published).toISOString()}`
        : ""
      return `## [${title}](${result.url})${published}${result.content ? `\n\n${result.content}` : ""}`
    })
    .join("\n\n")
}
