// DeepSeek Search / Fetch plugin for OpenCode V2.
//
// Search: registers a `deepseek` websearch provider AND, in deepseek mode,
// patches the built-in `websearch` tool so the model keeps calling one tool
// with zero prompt changes. (`editor.default.set()` alone does not re-route
// the built-in tool on 2.2.5 — verified — so the tool is patched through
// `editor.update`; the provider registration stays as the fallback and as the
// target for `providerID: "deepseek"` / config `websearch.provider`.)
//
// Fetch: `deepseek_fetch` returns clean Markdown, truncated with a notice.
// Usage: `deepseek_usage` reports local counts and an estimated cost.
//
// Options: mode, apiKey, count, fetchMaxChars, pricePerThousand.

import { Plugin } from "@opencode/plugin"
import {
  deepseekFetch,
  deepseekSearch,
  missingKeyMessage,
  validateQuery,
  validateUrl,
  type SearchResult,
} from "./deepseek.ts"
import {
  USAGE_KEY,
  applyTally,
  dayKey,
  emptyDay,
  emptyLedger,
  formatUsage,
  formatYuan,
  parseLedger,
  type Tally,
  type UsageLedger,
} from "./usage.ts"

const PROVIDER_ID = "deepseek"
const SEARCH_TOOL = "websearch"
const FETCH_TOOL = "deepseek_fetch"
const USAGE_TOOL = "deepseek_usage"

// ---------- defensive option readers (ctx.options values are untyped) ----------

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function readEnvValue(name: string): string | undefined {
  // The plugin sandbox is not guaranteed to expose process; guard the access.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return str(proc?.env?.[name])
}

function readQuery(input: unknown): string {
  return typeof (input as { query?: unknown } | undefined)?.query === "string"
    ? (input as { query: string }).query.trim()
    : ""
}

// Search results are rendered as plain Markdown: `summary` is already written
// for models, so no full page text and no JSON wrapper.
export function formatSearchResults(results: readonly SearchResult[]): string {
  if (results.length === 0) return "DeepSeek Search 没有返回结果。可改写搜索词，或放宽 site:/after: 等限定。"
  return results
    .map((r, i) => {
      const body = r.content ? `\n${r.content}` : ""
      return `${i + 1}. ${r.title ?? "(无标题)"}\n${r.url}${body}`
    })
    .join("\n\n")
}

export default Plugin.define({
  id: "deepseek-search",
  async setup(ctx) {
    const opt = (ctx.options ?? {}) as Record<string, unknown>
    const mode = str(opt.mode) === "native" ? "native" : "deepseek"
    // Order: options.apiKey (already {env:...}-substituted by the host) > DEEPSEEK_API_KEY.
    // The env fallback is what makes a bare `plugins: ["<package>"]` entry usable.
    const apiKey = str(opt.apiKey) ?? readEnvValue("DEEPSEEK_API_KEY") ?? ""
    const count = int(opt.count, 5, 1, 50)
    const fetchMaxChars = int(opt.fetchMaxChars, 30_000, 500, 200_000)
    const pricePerThousand = int(opt.pricePerThousand, 5, 0, 10_000)

    // ctx.storage offers no compare-and-swap, so every read-modify-write goes
    // through this single in-process chain. Stats must never break a search, so
    // the chain swallows failures.
    let chain: Promise<unknown> = Promise.resolve()
    const withLedger = <T>(fn: (ledger: UsageLedger) => Promise<T> | T): Promise<T> => {
      const run = chain.then(async () => fn(parseLedger(await ctx.storage.get(USAGE_KEY))))
      chain = run.catch(() => {})
      return run
    }
    const tally = (kind: Tally): void => {
      void withLedger(async (ledger) => {
        applyTally(ledger, kind, pricePerThousand)
        await ctx.storage.set(USAGE_KEY, ledger)
        const today = ledger.days[dayKey()] ?? emptyDay()
        console.error(
          `[deepseek-search] usage: today search=${today.search} fetch=${today.fetch} ${formatYuan(today.costMicro)}`,
        )
      }).catch(() => {})
    }

    const runSearch = async (query: string, signal: AbortSignal): Promise<SearchResult[]> => {
      const problem = validateQuery(query)
      if (problem) throw new Error(problem)
      try {
        const results = await deepseekSearch(query, apiKey, count, signal)
        tally(results.length > 0 ? "search" : "empty")
        return results
      } catch (e) {
        tally("failed")
        throw e
      }
    }

    // ---------- websearch provider (fallback + explicit selection) ----------
    await ctx.websearch.transform((editor) => {
      editor.add({
        id: PROVIDER_ID,
        name: "DeepSeek Search",
        execute: async (input, context) => runSearch(input?.query ?? "", context.signal),
      })
      if (mode === "deepseek") editor.default.set(PROVIDER_ID)
    })

    // ---------- tools ----------
    let patchedSearchTool = false
    await ctx.tool.transform((editor) => {
      // Patch the built-in tool (it is registered before plugins). In native
      // mode it is left untouched so the configured/built-in provider serves it.
      if (mode === "deepseek" && editor.get(SEARCH_TOOL)) {
        editor.update(SEARCH_TOOL, (tool) => {
          tool.execute = async (input, context) => ({
            content: formatSearchResults(await runSearch(readQuery(input), context.signal)),
            metadata: { provider: PROVIDER_ID },
          })
        })
        patchedSearchTool = true
      }

      // The built-in webfetch is deliberately NOT overridden: a losing override
      // would break fetching entirely, while `deepseek_fetch` next to it is safe.
      editor.add({
        name: FETCH_TOOL,
        description:
          "Fetch a web page and return clean Markdown using the DeepSeek Fetch API. " +
          "Use it when the builtin webfetch tool fails or returns noisy HTML. " +
          "Very long pages are truncated with an explicit notice.",
        input: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Absolute http(s) URL to fetch (no userinfo, at most 8192 characters)",
            },
          },
          required: ["url"],
          additionalProperties: false,
        },
        execute: async (input, context) => {
          const url = String((input as { url?: unknown } | undefined)?.url ?? "").trim()
          const problem = validateUrl(url)
          if (problem) throw new Error(problem)
          try {
            await context.progress({ status: `DeepSeek Fetch 抓取中: ${url}` })
            const result = await deepseekFetch(url, apiKey, fetchMaxChars, context.signal)
            tally(result.empty ? "empty" : "fetch")
            return {
              content: result.markdown,
              metadata: { url, backend: PROVIDER_ID, chars: result.chars, truncated: result.truncated },
            }
          } catch (e) {
            tally("failed")
            throw e instanceof Error ? e : new Error(String(e))
          }
        },
      })

      editor.add({
        name: USAGE_TOOL,
        description:
          "Report local DeepSeek Search/Fetch usage counts and estimated cost. " +
          "Use it when the user asks how many searches were made or how much they cost. " +
          "Pass reset=true to clear the local ledger after reporting.",
        input: {
          type: "object",
          properties: {
            reset: { type: "boolean", description: "Reset the local ledger after reporting" },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const reset = Boolean((input as { reset?: unknown } | undefined)?.reset)
          const report = await withLedger(async (ledger) => {
            const text = formatUsage(ledger, pricePerThousand, mode)
            if (!reset) return text
            await ctx.storage.set(USAGE_KEY, emptyLedger())
            return `${text}\n\n已清零本地统计。`
          })
          return { content: report }
        },
      })
    })

    // Load marker for diagnostics; never logs the key itself.
    console.error(
      `[deepseek-search] loaded: mode=${mode} apiKey=${apiKey ? "present" : "MISSING"} count=${count} ` +
        `searchTool=${patchedSearchTool ? "deepseek" : "untouched"}`,
    )
    if (!apiKey) console.error(`[deepseek-search] ${missingKeyMessage()}`)
    if (mode === "deepseek" && !patchedSearchTool)
      console.error(
        `[deepseek-search] 警告：未找到内置 ${SEARCH_TOOL} 工具，搜索仍走内置后端。` +
          `可在 opencode.jsonc 设置 "websearch": { "provider": "${PROVIDER_ID}" } 强制路由。`,
      )
  },
})
