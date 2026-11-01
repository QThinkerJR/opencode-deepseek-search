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
import type { Result as ToolResult, ToolContext } from "@opencode/plugin/promise/tool"
import {
  deepseekFetch,
  deepseekSearch,
  formatSearchResults,
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
const MODE_TOOL = "deepseek_mode"
// Host storage is global to the installation and survives restarts, so the
// `deepseek_mode` switch outlives the process without touching the config file.
const MODE_KEY = "mode/v1"

type Mode = "deepseek" | "native"
type ModeAction = "status" | Mode | "config"

const SEARCH_TOOL_DESCRIPTION =
  "Search the web using DeepSeek Search. Use this for current information beyond knowledge cutoff." +
  `\n\nThe current year is ${new Date().getFullYear()}. Use this year when searching for recent information or current events.`

function readModeAction(input: unknown): ModeAction {
  const raw = (input as { mode?: unknown } | undefined)?.mode
  if (raw === undefined || raw === null || raw === "") return "status"
  if (raw === "status" || raw === "deepseek" || raw === "native" || raw === "config") return raw
  throw new Error(`mode 只能是 status / deepseek / native / config，收到：${String(raw)}`)
}


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

// Search results are rendered by `formatSearchResults`; nothing else of the
// built-in tool's behaviour is duplicated here.

export default Plugin.define({
  id: "deepseek-search",
  async setup(ctx) {
    const opt = (ctx.options ?? {}) as Record<string, unknown>
    const configMode: Mode = str(opt.mode) === "native" ? "native" : "deepseek"
    // Precedence: a persisted `deepseek_mode` switch wins over the config file
    // until it is cleared with `mode: "config"`.
    let overrideMode: Mode | undefined
    try {
      const stored = str(await ctx.storage.get(MODE_KEY))
      if (stored === "deepseek" || stored === "native") overrideMode = stored
    } catch {
      /* storage unavailable: fall back to the config file */
    }
    let mode: Mode = overrideMode ?? configMode
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

    // ---------- built-in websearch: patch / restore ----------
    // `pristine` is refreshed on every state rebuild, before any patch, so a
    // restore always uses the host's current implementation (never a stale
    // closure captured from a previous rebuild).
    let pristine:
      | { execute: (input: unknown, context: ToolContext) => Promise<ToolResult>; description: string }
      | undefined
    let searchToolPatched = false

    const deepseekSearchExecute = async (input: unknown, context: ToolContext): Promise<ToolResult> => {
      const query = readQuery(input)
      const problem = validateQuery(query)
      if (problem) throw new Error(problem)
      await ctx.permission.assert({
        sessionID: context.sessionID,
        agent: context.agent,
        action: SEARCH_TOOL,
        resources: [query],
        save: ["*"],
        metadata: { query },
        source: { type: "tool", messageID: context.messageID, id: context.id },
      })
      // Mirror the built-in tool's progress update so long searches are not silent.
      await context.progress({ provider: PROVIDER_ID })
      const results = await runSearch(query, context.signal)
      return {
        output: { provider: PROVIDER_ID, results },
        content: formatSearchResults(results),
        metadata: { provider: PROVIDER_ID },
      }
    }

    // Registers one more transform that repaints the built-in tool. Transforms
    // replay in registration order on every rebuild, so the newest switch wins.
    const applySearchMode = async (next: Mode): Promise<boolean> => {
      if (!pristine) return false
      await ctx.tool.transform((editor) => {
        editor.update(SEARCH_TOOL, (tool) => {
          if (next === "deepseek") {
            tool.description = SEARCH_TOOL_DESCRIPTION
            tool.execute = deepseekSearchExecute
          } else {
            tool.description = pristine!.description
            tool.execute = pristine!.execute
          }
        })
      })
      mode = next
      searchToolPatched = next === "deepseek"
      return true
    }

    const describeMode = (): string =>
      `当前搜索后端: ${mode}（来源: ${overrideMode ? "deepseek_mode 开关，已持久化" : "配置文件 options.mode"}）` +
      (mode === "deepseek"
        ? searchToolPatched
          ? " · 内置 websearch 已由 DeepSeek 接管"
          : " · 未找到内置 websearch 工具，实际未能接管"
        : " · 内置 websearch 保持原生")

    // ---------- tools ----------
    await ctx.tool.transform((editor) => {
      const builtin = editor.get(SEARCH_TOOL)
      if (builtin) pristine = { execute: builtin.execute, description: builtin.description }

      // Patch the built-in tool (it is registered before plugins). In native
      // mode it is left untouched so the configured/built-in provider serves it.
      // The patch keeps the built-in permission check and the declared output
      // shape, so the tool behaves identically apart from the backend.
      if (mode === "deepseek" && builtin) {
        editor.update(SEARCH_TOOL, (tool) => {
          tool.description = SEARCH_TOOL_DESCRIPTION
          tool.execute = deepseekSearchExecute
        })
        searchToolPatched = true
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

      editor.add({
        name: MODE_TOOL,
        description:
          "Show or change which backend serves the built-in websearch tool. " +
          'mode "deepseek" routes search to DeepSeek, "native" leaves the built-in backend alone, ' +
          '"config" clears the stored override so the config file decides again, ' +
          '"status" (default) only reports the current backend. ' +
          "A deepseek/native switch is stored locally and survives restarts.",
        input: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["status", "deepseek", "native", "config"],
              description: "status (default) | deepseek | native | config",
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const action = readModeAction(input)
          if (action === "status") return { content: describeMode() }
          if (!pristine) {
            return {
              content:
                `未找到内置 ${SEARCH_TOOL} 工具，无法在运行时切换。` +
                `请改用配置文件把 options.mode 设为 "${action === "config" ? configMode : action}"。`,
            }
          }
          if (action === "config") {
            await ctx.storage.remove(MODE_KEY)
            overrideMode = undefined
            await applySearchMode(configMode)
            return { content: `${describeMode()}\n\n已清除持久化开关，回到配置文件设置（${configMode}）。` }
          }
          await ctx.storage.set(MODE_KEY, action)
          overrideMode = action
          await applySearchMode(action)
          return {
            content:
              `${describeMode()}\n\n已持久化：重启 OpenCode 后仍为 ${action}。` +
              '要恢复配置文件设置，调用 deepseek_mode 并传 mode: "config"。',
          }
        },
      })
    })

    // Load marker for diagnostics; never logs the key itself.
    console.error(
      `[deepseek-search] loaded: mode=${mode} source=${overrideMode ? "override" : "config"} ` +
        `apiKey=${apiKey ? "present" : "MISSING"} count=${count} ` +
        `searchTool=${searchToolPatched ? "deepseek" : "untouched"}`,
    )
    if (!apiKey) console.error(`[deepseek-search] ${missingKeyMessage()}`)
    if (overrideMode && overrideMode !== configMode)
      console.error(
        `[deepseek-search] 注意：存在持久化开关 mode=${overrideMode}，已覆盖配置文件里的 ${configMode}；` +
          `调用 deepseek_mode 传 "config" 可清除。`,
      )
    if (mode === "deepseek" && !searchToolPatched)
      console.error(
        `[deepseek-search] 警告：未找到内置 ${SEARCH_TOOL} 工具，搜索仍走内置后端。` +
          `可在 opencode.jsonc 设置 "websearch": { "provider": "${PROVIDER_ID}" } 强制路由。`,
      )
  },
})
