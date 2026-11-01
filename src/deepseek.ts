// DeepSeek Search / Fetch HTTP core.
//
// Responsibilities: request shaping, retry policy, response mapping and
// user-facing (Chinese) error messages. No plugin context and no storage here,
// so every mapper below is unit-testable without network access.

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

export function missingKeyMessage(): string {
  return (
    "未配置 DeepSeek API Key：请设置环境变量 DEEPSEEK_API_KEY" +
    '（PowerShell: [Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY","sk-...","User")），' +
    '或在插件 options 中写 "apiKey": "{env:DEEPSEEK_API_KEY}"，然后重启 opencode。'
  )
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

function upstreamMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } }
    const message = parsed?.error?.message
    return typeof message === "string" && message.trim() ? `：${message.trim()}` : ""
  } catch {
    return ""
  }
}

export function httpError(status: number, body: string, isFetch: boolean): Error {
  const upstream = upstreamMessage(body)
  const fetchHint = isFetch ? " 可改用内置 webfetch 工具抓取该页面。" : ""
  switch (status) {
    case 400:
      return new Error(`DeepSeek 请求参数无效（400）${upstream}。搜索词需 1~128 字符；Fetch 的 URL 需为合法的 http(s) 绝对地址。`)
    case 401:
      return new Error(`DeepSeek API Key 无效（401）${upstream}。请检查 DEEPSEEK_API_KEY 环境变量或 options.apiKey。`)
    case 402:
      return new Error("DeepSeek 账户余额不足（402），失败请求不计费。请充值后重试。")
    case 403:
      return new Error(`DeepSeek Fetch 被目标站点安全策略拒绝（403）${upstream}。${fetchHint}`)
    case 404:
      return new Error(`DeepSeek 无法提取该链接的正文（404）${upstream}。请确认链接可访问。${fetchHint}`)
    case 408:
      return new Error("DeepSeek 请求超时（408），已退避重试一次仍失败。请稍后重试。")
    case 413:
      return new Error("DeepSeek 请求体过大（413）。请缩短输入。")
    case 429:
      return new Error("DeepSeek 触发限速（429，账号级 Search 100 QPS / Fetch 25 QPS），已退避重试一次仍失败。请稍后再试。")
    default:
      if (status >= 500)
        return new Error(
          `DeepSeek 服务端错误（${status}），已退避重试一次仍失败。可把插件 options.mode 改为 "native" 暂用原生搜索。`,
        )
      return new Error(`DeepSeek 请求失败（HTTP ${status}）${upstream}`)
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
  signal?: AbortSignal,
): Promise<unknown> {
  if (!apiKey) throw new Error(missingKeyMessage())
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
          throw new Error(`DeepSeek 返回了无法解析的响应（HTTP ${res.status}）。请稍后重试。`)
        }
      }
      const text = await res.text().catch(() => "")
      if (attempt < 2 && RETRYABLE.has(res.status)) {
        await sleep(retryAfterMs(res.headers), signal)
        continue
      }
      throw httpError(res.status, text, path === FETCH_PATH)
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(
          signal?.aborted
            ? "DeepSeek 请求已取消。"
            : `DeepSeek 请求超时（${Math.round(timeoutMs / 1000)} 秒），请重试。`,
        )
      }
      // fetch() rejects with TypeError on DNS/TLS/proxy failures.
      if (e instanceof TypeError) {
        throw new Error(`无法连接 ${API_BASE}（网络错误：${e.message}）。请检查网络或代理设置。`)
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
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const data = await postJson(SEARCH_PATH, buildSearchBody(query, count), apiKey, SEARCH_TIMEOUT_MS, signal)
  return mapSearchResults(data)
}

// ---------- DeepSeek Fetch -> Markdown with truncation ----------

export function mapFetchResponse(data: unknown, url: string, maxChars: number): FetchResult {
  const title = typeof (data as { title?: unknown })?.title === "string" ? (data as { title: string }).title : ""
  const raw = typeof (data as { content?: unknown })?.content === "string" ? (data as { content: string }).content : ""
  const truncated = raw.length > maxChars
  let body = truncated ? raw.slice(0, maxChars) : raw
  if (truncated) {
    body += `\n\n[DeepSeek Fetch 截断提示] 原文共 ${raw.length} 字符，超出上限 ${maxChars}，此处仅保留前 ${maxChars} 字符。`
  }
  return {
    markdown: `# ${title || url}\n来源: ${url}\n\n${body}`,
    chars: raw.length,
    empty: raw.length === 0,
    truncated,
  }
}

export function validateUrl(url: string): string | undefined {
  if (!/^https?:\/\//i.test(url)) return `无效 URL：「${url}」。DeepSeek Fetch 仅支持 http/https 绝对地址。`
  if (url.length > MAX_URL_CHARS) return `URL 过长（${url.length} > ${MAX_URL_CHARS} 字符）。`
  try {
    const parsed = new URL(url)
    if (!parsed.host) return `URL 缺少主机名：「${url}」。`
    if (parsed.username || parsed.password) return "URL 不能包含用户名/密码（userinfo）。"
  } catch {
    return `无法解析 URL：「${url}」。`
  }
  return undefined
}

export async function deepseekFetch(
  url: string,
  apiKey: string,
  maxChars: number,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const data = await postJson(FETCH_PATH, { url }, apiKey, FETCH_TIMEOUT_MS, signal)
  return mapFetchResponse(data, url, maxChars)
}

export function validateQuery(query: string): string | undefined {
  if (query.length === 0) return "搜索词为空：DeepSeek Search 需要非空 query（1~128 字符）。"
  if (query.length > MAX_QUERY_CHARS) return `搜索词过长（${query.length} 字符，上限 ${MAX_QUERY_CHARS}），请精简后重试。`
  return undefined
}
