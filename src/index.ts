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
import type { RpcRegistration } from "@opencode/plugin/promise/rpc"
import {
  deepseekBalance,
  deepseekFetch,
  deepseekSearch,
  formatSearchResults,
  MAX_ORI_CHARS,
  missingKeyMessage,
  validateQuery,
  validateUrl,
  type SearchExtras,
  type SearchResult,
} from "./deepseek.ts"
import { resolveLanguage, t } from "./i18n/index.ts"
import { DeepSeekRpc, type BalanceRead, type ModeSwitchResult, type SearchStatus } from "./rpc.ts"
import {
  USAGE_KEY,
  applyTally,
  dayKey,
  emptyDay,
  emptyLedger,
  formatUsage,
  formatYuan,
  parseLedger,
  sumDays,
  usageSummaryLines,
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
  `\n\nThe current year is ${new Date().getFullYear()}. Use this year when searching for recent information or current events.` +
  "\n\nThe query supports search operators (they count toward the 128-character limit): " +
  "site:github.com limits results to a site (combine with OR, e.g. site:github.com OR site:npmjs.com); " +
  '-site:example.com excludes a site; bare word or -"quoted phrase" excludes matches; ' +
  '"exact phrase" matches exactly; lang:zh,en limits languages; ' +
  "after:2025-01-01 and before:2026 limit by publish date. Combine several operators in one query."

// Pure parser: the caller decides how to surface an invalid value (tool error
// vs. RPC result), so the message can be localized at that call site.
function readModeAction(input: unknown): { action: ModeAction } | { invalid: string } {
  const raw = (input as { mode?: unknown } | undefined)?.mode
  if (raw === undefined || raw === null || raw === "") return { action: "status" }
  if (raw === "status" || raw === "deepseek" || raw === "native" || raw === "config") return { action: raw }
  return { invalid: String(raw) }
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
    // Resolved once per setup: every tool output and the RPC status payload use
    // this single language, so surfaces can never disagree.
    const pick = resolveLanguage(opt.language, {
      LC_ALL: readEnvValue("LC_ALL"),
      LANG: readEnvValue("LANG"),
    })
    const language = pick.language
    if (pick.problem !== undefined)
      console.error(
        `[deepseek-search] invalid language option ${JSON.stringify(pick.problem)}; ` +
          `valid values: en / ja / zh-CN. Using ${language}.`,
      )
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
    const localization = str(opt.localization)

    // ctx.storage offers no compare-and-swap, so every read-modify-write goes
    // through this single in-process chain. Stats must never break a search, so
    // the chain swallows failures.
    let chain: Promise<unknown> = Promise.resolve()
    const withLedger = <T>(fn: (ledger: UsageLedger) => Promise<T> | T): Promise<T> => {
      const run = chain.then(async () => fn(parseLedger(await ctx.storage.get(USAGE_KEY))))
      chain = run.catch(() => {})
      return run
    }
    // Filled in after the tool transforms are registered; `tally` can run before
    // that, so this stays optional. `changed` tells the sidebars to re-read `status`.
    let rpcRegistration: RpcRegistration<typeof DeepSeekRpc> | undefined
    // Nested `changed` events are cheap, but they are also not worth failing a
    // search or a mode switch over, so every caller ignores the outcome.
    const notifyChanged = (): void => {
      void rpcRegistration?.events.emit("changed", {}).catch(() => {})
    }
    const tally = (kind: Tally): void => {
      void withLedger(async (ledger) => {
        applyTally(ledger, kind, pricePerThousand)
        await ctx.storage.set(USAGE_KEY, ledger)
        notifyChanged()
        const today = ledger.days[dayKey()] ?? emptyDay()
        console.error(
          `[deepseek-search] usage: today search=${today.search} fetch=${today.fetch} ${formatYuan(today.costMicro)}`,
        )
      }).catch(() => {})
    }

    // Best-effort capture of each session's most recent user prompt, sent as the
    // DeepSeek `ori_question` intent hint. Clamped here at capture time so long
    // pasted prompts cannot inflate the cache; empty prompts never overwrite a
    // stored value. The map is capped, and JS Map re-assignment keeps insertion
    // order, so eviction drops the oldest session.
    const ORI_SESSION_CAP = 64
    const oriBySession = new Map<string, string>()
    let promptHook: { dispose: () => Promise<void> } | undefined
    try {
      promptHook = await ctx.session.hook("prompt", (p) => {
        const text = p.prompt?.text?.trim()
        if (!text) return
        if (oriBySession.size >= ORI_SESSION_CAP && !oriBySession.has(p.sessionID)) {
          const oldest = oriBySession.keys().next().value
          if (oldest !== undefined) oriBySession.delete(oldest)
        }
        oriBySession.set(p.sessionID, text.slice(0, MAX_ORI_CHARS))
      })
    } catch (e) {
      console.error(
        `[deepseek-search] prompt hook unavailable; ori_question will be omitted ` +
          `(${e instanceof Error ? e.message : String(e)})`,
      )
    }

    const runSearch = async (
      query: string,
      signal: AbortSignal,
      extras?: SearchExtras,
    ): Promise<SearchResult[]> => {
      const problem = validateQuery(query, language)
      if (problem) throw new Error(problem)
      try {
        const results = await deepseekSearch(query, apiKey, count, language, signal, extras)
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
        execute: async (input, context) => {
          // This provider-fallback context carries no sessionID, so `ori_question`
          // is omitted here by design (see plan D2).
          return runSearch(input?.query ?? "", context.signal, { localization })
        },
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
      const problem = validateQuery(query, language)
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
      const oriQuestion = oriBySession.get(context.sessionID)
      const results = await runSearch(query, context.signal, { oriQuestion, localization })
      return {
        output: {
          provider: PROVIDER_ID,
          // Project back to the built-in tool's declared result shape: internal
          // quality fields (authority/rerankScore) stay out of the tool output.
          results: results.map((r) => ({ url: r.url, title: r.title, content: r.content, time: r.time })),
        },
        // Rendered from the full objects: the [authoritative] marker needs authority.
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

    const describeMode = (): string => {
      const source = overrideMode ? t(language, "mode.source.override") : t(language, "mode.source.config")
      const suffix =
        mode === "deepseek"
          ? searchToolPatched
            ? t(language, "mode.suffix.patched")
            : t(language, "mode.suffix.notPatched")
          : t(language, "mode.suffix.native")
      return t(language, "mode.report", { mode, source, suffix })
    }

    // Shared by the `deepseek_mode` tool and the RPC `setMode` method. The
    // returned strings are the tool's documented output, word for word.
    const switchMode = async (action: Exclude<ModeAction, "status">): Promise<string> => {
      if (!pristine) {
        return t(language, "mode.notFound", {
          tool: SEARCH_TOOL,
          mode: action === "config" ? configMode : action,
        })
      }
      if (action === "config") {
        await ctx.storage.remove(MODE_KEY)
        overrideMode = undefined
        await applySearchMode(configMode)
        notifyChanged()
        return `${describeMode()}\n\n${t(language, "mode.configCleared", { mode: configMode })}`
      }
      await ctx.storage.set(MODE_KEY, action)
      overrideMode = action
      await applySearchMode(action)
      notifyChanged()
      return `${describeMode()}\n\n${t(language, "mode.persisted", { mode: action })}`
    }

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
          const problem = validateUrl(url, language)
          if (problem) throw new Error(problem)
          try {
            await context.progress({ status: t(language, "progress.fetch", { url }) })
            const result = await deepseekFetch(url, apiKey, fetchMaxChars, language, context.signal)
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
            const text = formatUsage(ledger, pricePerThousand, mode, language)
            if (!reset) return text
            await ctx.storage.set(USAGE_KEY, emptyLedger())
            return `${text}\n\n${t(language, "usage.reset")}`
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
          const parsed = readModeAction(input)
          if ("invalid" in parsed) throw new Error(t(language, "mode.invalid", { raw: parsed.invalid }))
          const action = parsed.action
          if (action === "status") return { content: describeMode() }
          return { content: await switchMode(action) }
        },
      })
    })

    // ---------- account balance cache ----------
    // The sidebars poll `status`, so the balance is cached for a minute: at most
    // one upstream probe per TTL, shared by every caller. Failures keep the last
    // good snapshot and back off instead of retrying on every poll.
    const BALANCE_TTL_MS = 60_000
    let balanceCache: { value: BalanceRead; at: number } | undefined
    let balanceInFlight: Promise<void> | undefined
    let lastBalanceAttemptAt = 0
    // Never rejects: the balance is decoration on `status`, not a feature that
    // may break it, so every failure is swallowed here.
    const refreshBalance = (force: boolean): Promise<void> => {
      if (!apiKey) return Promise.resolve()
      if (balanceInFlight) return balanceInFlight
      const startedAt = Date.now()
      if (!force) {
        if (balanceCache && startedAt - balanceCache.at < BALANCE_TTL_MS) return Promise.resolve()
        if (startedAt - lastBalanceAttemptAt < BALANCE_TTL_MS) return Promise.resolve()
      }
      lastBalanceAttemptAt = startedAt
      const run = (async (): Promise<void> => {
        try {
          const value = await deepseekBalance(apiKey, language)
          balanceCache = { value, at: Date.now() }
          notifyChanged()
        } catch {
          /* keep the previous snapshot */
        } finally {
          balanceInFlight = undefined
        }
      })()
      balanceInFlight = run
      return run
    }

    // ---------- RPC contract (TUI / desktop sidebars) ----------
    // Both sidebars read `status` and call `setMode`; nothing else crosses the
    // process boundary, so the plugin's state stays the single source of truth.
    rpcRegistration = await ctx.rpc.register(DeepSeekRpc, {
      // Reads through `withLedger` so it observes the same serialized chain.
      status: async (input: unknown): Promise<SearchStatus> => {
        // A manual refresh (the sidebar's refresh button) may ask for a fresh
        // probe; timer paths send `{}` so old servers still accept the input.
        const force = (input as { force?: unknown } | undefined)?.force === true
        // Kicked, not awaited: `status` must stay fast even when the probe hangs.
        void refreshBalance(force)
        return withLedger((ledger): SearchStatus => {
          const todayKey = dayKey()
          return {
            mode,
            source: overrideMode ? "override" : "config",
            patched: searchToolPatched,
            hasKey: Boolean(apiKey),
            pricePerThousand,
            language,
            ...usageSummaryLines(ledger, language, todayKey),
            // Same ledger read as the strings above, exposed as numbers so the
            // sidebars can lay them out for their own width.
            counts: {
              today: sumDays(ledger, (k) => k === todayKey),
              month: sumDays(ledger, (k) => k.startsWith(todayKey.slice(0, 7))),
              total: sumDays(ledger, () => true),
            },
            // Absent until the first successful probe; `fetchedAt` is stamped by
            // the cache, so clients can render staleness.
            balance: balanceCache ? { ...balanceCache.value, fetchedAt: balanceCache.at } : undefined,
          }
        })
      },
      // The input is plain JSON Schema, hence `unknown`: report, never throw.
      setMode: async (input: unknown): Promise<ModeSwitchResult> => {
        const parsed = readModeAction(input)
        if ("invalid" in parsed) {
          return { ok: false, mode, message: t(language, "mode.invalid", { raw: parsed.invalid }) }
        }
        const action = parsed.action
        if (action === "status") return { ok: false, mode, message: t(language, "mode.statusOnly") }
        const message = await switchMode(action)
        // `!pristine` means switchMode could not apply the change; its message says why.
        return { ok: Boolean(pristine), mode, message }
      },
    })

    // Load marker for diagnostics; never logs the key itself.
    console.error(
      `[deepseek-search] loaded: mode=${mode} source=${overrideMode ? "override" : "config"} ` +
        `apiKey=${apiKey ? "present" : "MISSING"} count=${count} ` +
        `searchTool=${searchToolPatched ? "deepseek" : "untouched"}` +
        ` localization=${localization ? "set" : "unset"}`,
    )
    if (!apiKey) console.error(`[deepseek-search] ${missingKeyMessage("en")}`)
    if (overrideMode && overrideMode !== configMode)
      console.error(
        `[deepseek-search] note: a persisted mode=${overrideMode} overrides the config file's ${configMode}; ` +
          `call deepseek_mode with "config" to clear it.`,
      )
    if (mode === "deepseek" && !searchToolPatched)
      console.error(
        `[deepseek-search] warning: built-in ${SEARCH_TOOL} tool not found; search still uses the built-in backend. ` +
          `Set "websearch": { "provider": "${PROVIDER_ID}" } in opencode.jsonc to force the route.`,
      )

    return async () => {
      await promptHook?.dispose()
    }
  },
})
