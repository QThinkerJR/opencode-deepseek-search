import assert from "node:assert/strict"
import { test } from "node:test"
import {
  KEEP_DAYS,
  applyTally,
  costPerRequestMicro,
  dayKey,
  emptyLedger,
  formatUsage,
  formatYuan,
  parseLedger,
  usageSummaryLines,
} from "../src/usage.ts"

const DAY = "2026-11-01"

test("successful requests are billed, empty and failed ones are not", () => {
  const ledger = emptyLedger()
  applyTally(ledger, "search", 5, DAY)
  applyTally(ledger, "fetch", 5, DAY)
  applyTally(ledger, "empty", 5, DAY)
  applyTally(ledger, "failed", 5, DAY)
  const day = ledger.days[DAY]
  assert.equal(day?.search, 1)
  assert.equal(day?.fetch, 1)
  assert.equal(day?.empty, 1)
  assert.equal(day?.failed, 1)
  assert.equal(day?.costMicro, 10_000)
  assert.equal(formatYuan(day?.costMicro ?? 0), "¥0.0100")
})

test("cost uses integer micro-yuan so repeated adds do not drift", () => {
  assert.equal(costPerRequestMicro(5), 5000)
  assert.equal(costPerRequestMicro(0), 0)
  const ledger = emptyLedger()
  for (let i = 0; i < 1000; i++) applyTally(ledger, "search", 3.7, DAY)
  assert.equal(ledger.days[DAY]?.costMicro, 3_700_000)
  assert.equal(formatYuan(ledger.days[DAY]?.costMicro ?? 0), "¥3.7000")
})

test("only the newest KEEP_DAYS days are retained", () => {
  const ledger = emptyLedger()
  for (let i = 0; i < KEEP_DAYS + 5; i++) {
    const date = new Date(2026, 0, 1 + i)
    applyTally(ledger, "search", 5, dayKey(date))
  }
  assert.equal(Object.keys(ledger.days).length, KEEP_DAYS)
})

test("parseLedger tolerates missing, legacy and corrupt values", () => {
  assert.deepEqual(parseLedger(undefined), { v: 1, days: {} })
  assert.deepEqual(parseLedger({ days: "nope" }), { v: 1, days: {} })
  assert.deepEqual(parseLedger({ days: { "not-a-day": { search: 3 }, [DAY]: { search: 2 } } }).days, {
    [DAY]: { search: 2, fetch: 0, empty: 0, failed: 0, costMicro: 0 },
  })
  assert.deepEqual(parseLedger({ days: { [DAY]: { search: -5, costMicro: "x" } } }).days[DAY], {
    search: 0,
    fetch: 0,
    empty: 0,
    failed: 0,
    costMicro: 0,
  })
})

test("formatUsage reports today, this month and lifetime totals", () => {
  const ledger = emptyLedger()
  applyTally(ledger, "search", 5, "2026-10-05")
  applyTally(ledger, "search", 5, DAY)
  applyTally(ledger, "fetch", 5, DAY)
  const report = formatUsage(ledger, 5, "deepseek", DAY)
  assert.match(report, /今日 2026-11-01: 搜索 1 · 抓取 1/)
  assert.match(report, /本月 2026-11: 搜索 1 · 抓取 1/)
  assert.match(report, /累计: 搜索 2 · 抓取 1/)
  assert.match(report, /估算 ¥0\.0150/)
  assert.match(report, /当前模式 deepseek/)
  assert.match(report, /账号侧账单为准/)
})

test("usageSummaryLines separates today, this month and lifetime totals", () => {
  const ledger = emptyLedger()
  // Two searches on the last day of the previous month: outside "this month".
  applyTally(ledger, "search", 5, "2026-10-31")
  applyTally(ledger, "search", 5, "2026-10-31")
  applyTally(ledger, "search", 5, DAY)
  applyTally(ledger, "fetch", 5, DAY)
  applyTally(ledger, "empty", 5, DAY)
  applyTally(ledger, "failed", 5, DAY)
  applyTally(ledger, "fetch", 5, "2026-11-02")

  const lines = usageSummaryLines(ledger, "2026-11-02")
  assert.equal(lines.today, "搜索 0 · 抓取 1 · 空/失 0 · ¥0.0050")
  assert.equal(lines.month, "搜索 1 · 抓取 2 · 空/失 2 · ¥0.0150")
  assert.equal(lines.total, "搜索 3 · 抓取 2 · 空/失 2 · ¥0.0250")
})

test("usageSummaryLines reports zeroes for an empty ledger", () => {
  const zero = "搜索 0 · 抓取 0 · 空/失 0 · ¥0.0000"
  assert.deepEqual(usageSummaryLines(emptyLedger(), DAY), { today: zero, month: zero, total: zero })
})
