import assert from "node:assert/strict"
import { test } from "node:test"
import { sidebarRows } from "../src/status-view.ts"
import type { SearchStatus } from "../src/rpc.ts"

// Copy is still being tuned by the view lane, so assertions stay structural:
// tone, row count, and the three usage labels are the stable contract.
const STATUS: SearchStatus = {
  mode: "deepseek",
  source: "override",
  patched: true,
  hasKey: true,
  pricePerThousand: 5,
  today: "搜索 1 · 抓取 1 · 空/失 0 · ¥0.0100",
  month: "搜索 2 · 抓取 1 · 空/失 0 · ¥0.0150",
  total: "搜索 3 · 抓取 1 · 空/失 0 · ¥0.0200",
}

function assertStatusRows(status: SearchStatus, tone: "on" | "off") {
  const rows = sidebarRows({ status, error: undefined })
  assert.equal(rows.tone, tone)
  assert.ok(rows.title.length > 0, "title is not empty")
  assert.ok(rows.action.length > 0, "action is not empty")
  assert.equal(rows.clickable, true)
  assert.equal(rows.lines.length, 3)
  for (const line of rows.lines) assert.equal(typeof line, "string")
  assert.deepEqual(
    new Set(rows.lines.map((line) => line.slice(0, 2))),
    new Set(["今日", "本月", "累计"]),
  )
}

test("takeover on renders the enabled card with three usage rows", () => {
  assertStatusRows(STATUS, "on")
})

test("takeover off renders the disabled card with three usage rows", () => {
  assertStatusRows({ ...STATUS, mode: "native", source: "config", patched: false }, "off")
})

test("a missing API key reports the fix instead of an action", () => {
  const rows = sidebarRows({ status: { ...STATUS, hasKey: false }, error: undefined })
  assert.equal(rows.tone, "error")
  assert.equal(rows.clickable, false)
  assert.ok(rows.action.includes("DEEPSEEK_API_KEY"), "action names the missing key")
  assert.equal(rows.lines.length, 3)
})

test("a requested takeover that did not patch warns and can be released", () => {
  const rows = sidebarRows({ status: { ...STATUS, patched: false }, error: undefined })
  assert.equal(rows.tone, "warn")
  assert.equal(rows.clickable, true)
  assert.equal(rows.lines.length, 3)
})

test("an error string replaces the body and reports the error tone", () => {
  const rows = sidebarRows({ status: undefined, error: "RPC 不可用" })
  assert.equal(rows.tone, "error")
  assert.ok(rows.title.length > 0, "title is not empty")
  assert.ok(rows.action.length > 0, "action is not empty")
  assert.equal(rows.clickable, true)
  assert.equal(rows.lines.length, 1)
  assert.ok(rows.lines[0]?.includes("RPC 不可用"), "error text is shown")
})

test("before the first read the card is idle", () => {
  const rows = sidebarRows({ status: undefined, error: undefined })
  assert.equal(rows.tone, "idle")
  assert.ok(rows.title.length > 0, "title is not empty")
  assert.ok(rows.action.length > 0, "action is not empty")
  assert.equal(rows.clickable, true)
  assert.equal(rows.lines.length, 0)
})
