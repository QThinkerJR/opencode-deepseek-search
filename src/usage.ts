// Local usage ledger.
//
// Mirrors DeepSeek's billing rule: Search and Fetch are billed per successful
// request that produced a result, regardless of `count`. Costs accumulate in
// integer micro-yuan (1e-6 CNY) so repeated additions never drift.
//
// Everything here is pure; persistence is the caller's job (ctx.storage).

import { t } from "./i18n/index.ts"
import type { Language } from "./rpc.ts"

export const USAGE_KEY = "usage/v1"
export const KEEP_DAYS = 60
export const MICRO = 1_000_000

export type Tally = "search" | "fetch" | "empty" | "failed"

// Index signatures keep both shapes assignable to the host's JSON type:
// ctx.storage only accepts JSON-serialisable values.
export interface UsageDay {
  [key: string]: number
  search: number
  fetch: number
  empty: number
  failed: number
  costMicro: number
}

export interface UsageLedger {
  [key: string]: number | Record<string, UsageDay>
  v: 1
  days: Record<string, UsageDay>
}

export function emptyDay(): UsageDay {
  return { search: 0, fetch: 0, empty: 0, failed: 0, costMicro: 0 }
}

export function emptyLedger(): UsageLedger {
  return { v: 1, days: {} }
}

/** Local-timezone day key, e.g. `2026-11-01`. */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0
}

function coerceDay(value: unknown): UsageDay {
  const v = (value ?? {}) as Record<string, unknown>
  return {
    search: num(v.search),
    fetch: num(v.fetch),
    empty: num(v.empty),
    failed: num(v.failed),
    costMicro: num(v.costMicro),
  }
}

/** Defensive read: stored JSON may predate the current shape. */
export function parseLedger(value: unknown): UsageLedger {
  const raw = (value ?? {}) as { days?: unknown }
  const ledger = emptyLedger()
  if (!raw.days || typeof raw.days !== "object") return ledger
  for (const [key, day] of Object.entries(raw.days as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    ledger.days[key] = coerceDay(day)
  }
  return ledger
}

export function costPerRequestMicro(pricePerThousand: number): number {
  return Math.round((pricePerThousand / 1000) * MICRO)
}

/** Mutates `ledger` in place: one tally + pruning beyond KEEP_DAYS. */
export function applyTally(ledger: UsageLedger, kind: Tally, pricePerThousand: number, today = dayKey()): void {
  const day = ledger.days[today] ?? emptyDay()
  day[kind] += 1
  // Only successful requests that returned payload are billed (docs).
  if (kind === "search" || kind === "fetch") day.costMicro += costPerRequestMicro(pricePerThousand)
  ledger.days[today] = day
  const keys = Object.keys(ledger.days).sort()
  for (const stale of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete ledger.days[stale]
}

export function sumDays(ledger: UsageLedger, pick: (key: string) => boolean): UsageDay {
  const total = emptyDay()
  for (const [key, day] of Object.entries(ledger.days)) {
    if (!pick(key)) continue
    total.search += day.search
    total.fetch += day.fetch
    total.empty += day.empty
    total.failed += day.failed
    total.costMicro += day.costMicro
  }
  return total
}

export function formatYuan(costMicro: number): string {
  return `¥${(costMicro / MICRO).toFixed(4)}`
}

export function formatUsage(
  ledger: UsageLedger,
  pricePerThousand: number,
  mode: string,
  language: Language,
  today = dayKey(),
): string {
  const month = today.slice(0, 7)
  const line = (label: string, d: UsageDay) =>
    t(language, "usage.report.line", {
      label,
      search: d.search,
      fetch: d.fetch,
      skipped: d.empty + d.failed,
      empty: d.empty,
      failed: d.failed,
      cost: formatYuan(d.costMicro),
    })
  return [
    t(language, "usage.report.title", { mode, price: pricePerThousand }),
    line(`${t(language, "usage.label.today")} ${today}`, sumDays(ledger, (k) => k === today)),
    line(`${t(language, "usage.label.month")} ${month}`, sumDays(ledger, (k) => k.startsWith(month))),
    line(t(language, "usage.label.total"), sumDays(ledger, () => true)),
    t(language, "usage.report.note"),
  ].join("\n")
}

/**
 * Compact one-line summaries for a status display, keyed by period. Callers add
 * the 今日/本月/累计 labels themselves. Costs are read from the ledger, which
 * already accumulated them at tally time.
 */
export function usageSummaryLines(
  ledger: UsageLedger,
  language: Language,
  today = dayKey(),
): { today: string; month: string; total: string } {
  const month = today.slice(0, 7)
  const line = (d: UsageDay) =>
    t(language, "usage.summary.line", {
      search: d.search,
      fetch: d.fetch,
      skipped: d.empty + d.failed,
      cost: formatYuan(d.costMicro),
    })
  return {
    today: line(sumDays(ledger, (k) => k === today)),
    month: line(sumDays(ledger, (k) => k.startsWith(month))),
    total: line(sumDays(ledger, () => true)),
  }
}
