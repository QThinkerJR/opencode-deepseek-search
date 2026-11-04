// RPC contract shared by the server plugin (handler side) and the TUI / desktop
// sidebars (client side).
//
// Type-only imports only: this module must stay loadable from all three
// runtimes (Node type-stripping for the server and the TUI, a CJS bundle for
// the desktop app), so it carries no runtime dependency.
//
// The schemas are plain JSON Schema, so `Rpc.Input` / `Rpc.Output` degrade to
// `unknown` on the client. `readStatus` / `readModeResult` narrow that back
// defensively, in the style of `parseLedger` (src/usage.ts).

import type { Rpc } from "@opencode/plugin/rpc"

export const DEEPSEEK_RPC_ID = "deepseek-search"

/**
 * UI languages the plugin ships. The server resolves one of them once and puts
 * it in `status`, so the tools and both sidebars always speak the same language.
 */
export type Language = "en" | "ja" | "zh-CN"
export const LANGUAGE_VALUES = ["en", "ja", "zh-CN"] as const

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "ja" || value === "zh-CN"
}

// Shared by the today/month/total slots of `status.counts`.
const USAGE_COUNTS_SCHEMA = {
  type: "object",
  properties: {
    search: { type: "integer" },
    fetch: { type: "integer" },
    empty: { type: "integer" },
    failed: { type: "integer" },
    costMicro: { type: "integer" },
  },
  required: ["search", "fetch", "empty", "failed", "costMicro"],
  additionalProperties: false,
} as const

// Account balance snapshot in `status.balance`. `currency` deliberately has no
// enum: a value the server could not normalize must not fail the whole payload
// at output-schema validation time.
const BALANCE_SCHEMA = {
  type: "object",
  properties: {
    isAvailable: { type: "boolean" },
    currency: { type: "string" },
    totalBalance: { type: "string" },
    grantedBalance: { type: "string" },
    toppedUpBalance: { type: "string" },
    fetchedAt: { type: "number" },
  },
  required: ["isAvailable", "currency", "totalBalance", "grantedBalance", "toppedUpBalance", "fetchedAt"],
  additionalProperties: false,
} as const

export const DeepSeekRpc = {
  id: DEEPSEEK_RPC_ID,
  methods: {
    status: {
      input: {
        type: "object",
        properties: {
          // Only a manual refresh sends `{ force: true }`; timer paths MUST send
          // `{}`, because older servers reject unknown input properties.
          force: { type: "boolean" },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["deepseek", "native"] },
          source: { type: "string", enum: ["override", "config"] },
          patched: { type: "boolean" },
          hasKey: { type: "boolean" },
          pricePerThousand: { type: "number" },
          today: { type: "string" },
          month: { type: "string" },
          total: { type: "string" },
          // Declared but not required: older servers omit it, and readStatus
          // falls back to English without failing the rest of the payload.
          language: { type: "string", enum: ["en", "ja", "zh-CN"] },
          counts: {
            type: "object",
            properties: {
              today: USAGE_COUNTS_SCHEMA,
              month: USAGE_COUNTS_SCHEMA,
              total: USAGE_COUNTS_SCHEMA,
            },
            required: ["today", "month", "total"],
            additionalProperties: false,
          },
          // Optional like `counts`: absent while the first probe is in flight, on
          // servers without the endpoint, or when the API key is missing.
          balance: BALANCE_SCHEMA,
        },
        required: ["mode", "source", "patched", "hasKey", "pricePerThousand", "today", "month", "total"],
        additionalProperties: false,
      },
    },
    setMode: {
      input: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["deepseek", "native", "config"] },
        },
        required: ["mode"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          mode: { type: "string" },
          message: { type: "string" },
        },
        required: ["ok", "mode", "message"],
        additionalProperties: false,
      },
    },
  },
  events: {
    // Emitted after the ledger or the mode changes.
    changed: { schema: { type: "object" as const, properties: {} } },
  },
} satisfies Rpc.PortableDefinition

export interface UsageCounts {
  search: number
  fetch: number
  empty: number
  failed: number
  costMicro: number
}

/**
 * DeepSeek account balance as reported by `GET /user/balance`.
 *
 * `fetchedAt` is epoch milliseconds attached by the server when it caches the
 * snapshot, so sidebars can show staleness without trusting client clocks.
 */
export interface BalanceStatus {
  isAvailable: boolean
  currency: string
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
  fetchedAt: number
}

/** The wire shape of a balance probe, before the cache stamps `fetchedAt`. */
export type BalanceRead = Omit<BalanceStatus, "fetchedAt">

export interface SearchStatus {
  mode: "deepseek" | "native"
  source: "override" | "config"
  patched: boolean
  hasKey: boolean
  pricePerThousand: number
  today: string
  month: string
  total: string
  /**
   * UI language resolved by the server. Required by this interface: `readStatus`
   * always fills it (English when the server is older or sends garbage), so
   * every surface has one value to render with.
   */
  language: Language
  /** Structured counters, so each surface can format for its own width. Optional for older servers. */
  counts?: { today: UsageCounts; month: UsageCounts; total: UsageCounts }
  /** Last cached balance probe. Absent until the first successful fetch. */
  balance?: BalanceStatus
}

export interface ModeSwitchResult {
  ok: boolean
  mode: string
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMode(value: unknown): value is SearchStatus["mode"] {
  return value === "deepseek" || value === "native"
}

/** Strict read of one counter bucket: all five fields, integers ≥ 0, finite cost. */
function readUsageCounts(value: unknown): UsageCounts | undefined {
  if (!isRecord(value)) return undefined
  const { search, fetch, empty, failed, costMicro } = value
  for (const count of [search, fetch, empty, failed]) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return undefined
  }
  if (typeof costMicro !== "number" || !Number.isFinite(costMicro) || costMicro < 0) return undefined
  return { search, fetch, empty, failed, costMicro } as UsageCounts
}

/** Strict read of a cached balance snapshot: all six fields, currency normalized. */
function readBalance(value: unknown): BalanceStatus | undefined {
  if (!isRecord(value)) return undefined
  const { isAvailable, currency, totalBalance, grantedBalance, toppedUpBalance, fetchedAt } = value
  if (typeof isAvailable !== "boolean") return undefined
  if (currency !== "CNY" && currency !== "USD") return undefined
  for (const text of [totalBalance, grantedBalance, toppedUpBalance]) {
    if (typeof text !== "string" || text.length === 0) return undefined
  }
  if (typeof fetchedAt !== "number" || !Number.isFinite(fetchedAt) || fetchedAt < 0) return undefined
  return { isAvailable, currency, totalBalance, grantedBalance, toppedUpBalance, fetchedAt } as BalanceStatus
}

/** Defensive read of an RPC `status` result. Never throws. */
export function readStatus(raw: unknown): SearchStatus | undefined {
  if (!isRecord(raw)) return undefined
  const { mode, source, patched, hasKey, pricePerThousand, today, month, total, language, counts, balance } = raw
  if (!isMode(mode)) return undefined
  if (source !== "override" && source !== "config") return undefined
  if (typeof patched !== "boolean" || typeof hasKey !== "boolean") return undefined
  if (typeof pricePerThousand !== "number" || !Number.isFinite(pricePerThousand)) return undefined
  if (typeof today !== "string" || typeof month !== "string" || typeof total !== "string") return undefined
  const status: SearchStatus = {
    mode,
    source,
    patched,
    hasKey,
    pricePerThousand,
    today,
    month,
    total,
    // An older server has no language; a malformed one is not worth failing the
    // whole payload over. Both fall back to English.
    language: isLanguage(language) ? language : "en",
  }
  // Old servers omit `counts`; a malformed triple is dropped without failing the rest.
  if (isRecord(counts)) {
    const todayCounts = readUsageCounts(counts.today)
    const monthCounts = readUsageCounts(counts.month)
    const totalCounts = readUsageCounts(counts.total)
    if (todayCounts && monthCounts && totalCounts) status.counts = { today: todayCounts, month: monthCounts, total: totalCounts }
  }
  // A missing balance stays absent (no probe yet, no key, older server); a
  // malformed one is dropped without failing the rest of the payload.
  const balanceStatus = readBalance(balance)
  if (balanceStatus) status.balance = balanceStatus
  return status
}

/** Defensive read of an RPC `setMode` result. Never throws. */
export function readModeResult(raw: unknown): ModeSwitchResult | undefined {
  if (!isRecord(raw)) return undefined
  const { ok, mode, message } = raw
  if (typeof ok !== "boolean" || typeof mode !== "string" || typeof message !== "string") return undefined
  return { ok, mode, message }
}
