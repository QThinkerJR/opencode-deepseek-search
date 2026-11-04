import assert from "node:assert/strict"
import { test } from "node:test"
import { sidebarRows, textColumns } from "../src/status-view.ts"
import type { SidebarRows } from "../src/status-view.ts"
import { cardColumns } from "../src/tui/card.ts"
import type { BalanceStatus, Language, SearchStatus } from "../src/rpc.ts"

// The copy is the user's: `Search` and `Fetch` are words, and the abbreviations
// are only a last resort. These tests lock that ladder, the measured widths,
// and the shared columns that keep the three usage rows aligned.
// A measured sidebar width, wide enough for the words and the amount.
const SIDEBAR_COLUMNS = 40
// What the card assumes before the host has reported a width.
const FIRST_FRAME_COLUMNS = 24
// Mirrors of the card layout facts, used only to measure the header.
const GLYPH_COLUMNS = 2
const ACTION_GAP = 1
// The user's wording: the full product name, then the short one.
const FULL_NAME = "DeepSeek search/fetch"
const SHORT_NAME = "DeepSeek"

const COUNTS = {
  today: { search: 0, fetch: 3, empty: 2, failed: 0, costMicro: 15000 },
  month: { search: 5, fetch: 3, empty: 3, failed: 0, costMicro: 40000 },
  total: { search: 5, fetch: 3, empty: 3, failed: 0, costMicro: 40000 },
}

const STATUS: SearchStatus = {
  mode: "deepseek",
  source: "override",
  patched: true,
  hasKey: true,
  pricePerThousand: 5,
  today: "搜索 0 · 抓取 3 · 空/失 2 · ¥0.0150",
  month: "搜索 5 · 抓取 3 · 空/失 3 · ¥0.0400",
  total: "搜索 5 · 抓取 3 · 空/失 3 · ¥0.0400",
  language: "zh-CN",
  counts: COUNTS,
}

// This file locks the Chinese ladder: the wording below is zh-CN, and the
// language matrix lives in test/i18n-layout.test.ts.

/** A cached balance snapshot, in the shape the server sends it. */
const BALANCE: BalanceStatus = {
  isAvailable: true,
  currency: "CNY",
  totalBalance: "110.00",
  grantedBalance: "0.00",
  toppedUpBalance: "110.00",
  fetchedAt: 1_700_000_000_000,
}

// The widest a balance row gets here: `余额 ¥110.00` is 12 columns.
const BALANCE_COLUMNS = 12

function rowsAt(
  status: SearchStatus | undefined,
  maxColumns = SIDEBAR_COLUMNS,
  error?: string,
  language: Language = "zh-CN",
) {
  return sidebarRows({ status, error, maxColumns, language })
}

/** Width of the title row: the glyph and the title, nothing else. */
function titleColumns(rows: SidebarRows): number {
  return (rows.glyph ? GLYPH_COLUMNS : 0) + textColumns(rows.title)
}

/** Width the whole header needs: inline it is one row, otherwise the wider of the two. */
function headerColumns(rows: SidebarRows): number {
  if (!rows.clickable) return titleColumns(rows)
  const action = textColumns(rows.action)
  if (rows.actionBelow) return Math.max(titleColumns(rows), action)
  return titleColumns(rows) + ACTION_GAP + action
}

/** One title row, the optional action row, the optional hint, then the body. */
function cardRows(rows: SidebarRows): number {
  return (
    1 +
    (rows.actionBelow ? 1 : 0) +
    (rows.hint === undefined ? 0 : 1) +
    rows.lines.length
  )
}

/** Every row must fit the width and never be blank; the card is at most five rows. */
function assertRowsFit(rows: SidebarRows, width = SIDEBAR_COLUMNS) {
  assert.ok(titleColumns(rows) <= width, `title row fits at ${width}: ${rows.title}`)
  if (rows.clickable) {
    assert.ok(textColumns(rows.action) <= width, `action fits at ${width}: ${rows.action}`)
    if (!rows.actionBelow) {
      assert.ok(headerColumns(rows) <= width, `inline header fits at ${width}: ${headerColumns(rows)}`)
    }
  }
  if (rows.hint !== undefined) {
    assert.ok(rows.hint.length > 0, "a hint row is never blank")
    assert.ok(textColumns(rows.hint) <= width, `hint fits at ${width}: ${rows.hint}`)
  }
  for (const line of rows.lines) {
    assert.ok(line.length > 0, "a body row is never blank")
    assert.ok(textColumns(line) <= width, `line fits at ${width}: ${line}`)
  }
  assert.ok(cardRows(rows) <= 5, "the card never exceeds five rows")
}

function assertStatusRows(
  status: SearchStatus,
  tone: "on" | "off",
  verb: string,
  width = SIDEBAR_COLUMNS,
) {
  const rows = rowsAt(status, width)
  assert.equal(rows.tone, tone)
  assert.equal(rows.clickable, true)
  assert.equal(rows.hint, undefined)
  assert.ok(rows.action?.includes(verb), `action says ${verb}`)
  assert.ok(rows.title.length > 0, "title is not empty")
  assert.equal(rows.lines.length, 3)
  for (const line of rows.lines) assert.equal(typeof line, "string")
  assert.deepEqual(
    new Set(rows.lines.map((line) => line.slice(0, 2))),
    new Set(["今日", "本月", "累计"]),
  )
  assertRowsFit(rows, width)
  for (const line of rows.lines) {
    assert.ok(!line.includes("空/失"), "diagnostic counters stay out of the card")
    assert.ok(!line.includes("搜") && !line.includes("取"), "Latin units replace the CJK suffixes")
  }
}

test("takeover on renders the enabled card with three usage rows", () => {
  for (const width of [SIDEBAR_COLUMNS, 34, 30, FIRST_FRAME_COLUMNS]) {
    assertStatusRows(STATUS, "on", "停用", width)
  }
})

test("takeover off renders the disabled card with three usage rows", () => {
  for (const width of [SIDEBAR_COLUMNS, 34, 30, FIRST_FRAME_COLUMNS]) {
    assertStatusRows({ ...STATUS, mode: "native", source: "config", patched: false }, "off", "启用", width)
  }
})

test("a requested takeover that did not patch warns and can be released", () => {
  const rows = rowsAt({ ...STATUS, patched: false })
  assert.equal(rows.tone, "warn")
  assert.equal(rows.clickable, true)
  assert.ok(rows.action?.includes("交还"), "action releases the mode")
  assert.equal(rows.hint, undefined)
  assert.equal(rows.lines.length, 3)
  assertRowsFit(rows)
})

test("a missing API key reports the fix on its own row instead of an action", () => {
  const rows = rowsAt({ ...STATUS, hasKey: false })
  assert.equal(rows.tone, "error")
  assert.equal(rows.clickable, false, "there is nothing to click")
  assert.equal(rows.actionBelow, false, "no action, so no action row")
  assert.ok(rows.hint?.includes("KEY"), "hint names the missing key")
  assert.equal(rows.action, rows.hint, "the desktop still reads the fix copy")
  assert.equal(rows.lines.length, 3)
  assert.equal(cardRows(rows), 5, "title, hint, and three usage rows")
  assertRowsFit(rows)
})

test("the desktop keeps the verbose copy and the full key hint", () => {
  const rows = rowsAt(STATUS, Number.POSITIVE_INFINITY)
  assert.ok(rows.lines[0]?.includes(STATUS.today), "verbose usage string is preserved")
  assert.equal(rows.title, `${FULL_NAME} · 已启用`, "wide surfaces keep the full name")
  assert.equal(rows.glyph, true)
  assert.equal(rows.actionBelow, false, "wide surfaces keep the action inline")
  const missingKey = rowsAt({ ...STATUS, hasKey: false }, Number.POSITIVE_INFINITY)
  assert.ok(missingKey.hint?.includes("DEEPSEEK_API_KEY"), "wide surfaces name the env var")
})

test("an error string replaces the body and reports the error tone", () => {
  const rows = rowsAt(undefined, SIDEBAR_COLUMNS, "RPC 不可用")
  assert.equal(rows.tone, "error")
  assert.ok(rows.title.length > 0, "title is not empty")
  assert.ok(rows.action?.includes("重试"), "action retries the read")
  assert.equal(rows.clickable, true)
  assert.equal(rows.lines.length, 1)
  assert.ok(rows.lines[0]?.includes("RPC 不可用"), "error text is shown")
  assertRowsFit(rows)
})

test("before the first read the card is idle", () => {
  const rows = rowsAt(undefined)
  assert.equal(rows.tone, "idle")
  assert.ok(rows.title.length > 0, "title is not empty")
  assert.ok(rows.action?.includes("重试"), "action retries the read")
  assert.equal(rows.clickable, true)
  assert.equal(rows.lines.length, 0)
  assert.equal(rows.hint, undefined)
  assertRowsFit(rows)
})

test("the card never exceeds five rows", () => {
  const cases: readonly (readonly [string, SearchStatus | undefined, string | undefined])[] = [
    ["on", STATUS, undefined],
    ["on with balance", { ...STATUS, balance: BALANCE }, undefined],
    ["off", { ...STATUS, mode: "native", source: "config", patched: false }, undefined],
    ["warn", { ...STATUS, patched: false }, undefined],
    ["no key", { ...STATUS, hasKey: false }, undefined],
    ["idle", undefined, undefined],
    ["error", undefined, "RPC 不可用"],
  ]
  for (const width of [8, 12, 16, 20, 24, 30, 34, 40]) {
    for (const [name, status, error] of cases) {
      const rows = rowsAt(status, width, error)
      assert.ok(cardRows(rows) <= 5, `${name} at ${width}: ${cardRows(rows)} rows`)
    }
  }
})

test("the headline names the plugin with the user's wording", () => {
  const wide = rowsAt(STATUS, SIDEBAR_COLUMNS)
  assert.equal(wide.title, `${FULL_NAME} · 已启用`)
  assert.ok(!wide.title.includes("搜索"), "the old name is gone")
  assert.ok(wide.title.startsWith("DeepSeek"), "DeepSeek stays capitalized")

  const missingKey = rowsAt({ ...STATUS, hasKey: false }, SIDEBAR_COLUMNS)
  assert.equal(missingKey.title, `${FULL_NAME} · 未配置 API Key`)
  assert.equal(titleColumns(missingKey), SIDEBAR_COLUMNS, "name and state fill 40 columns")
})

test("the action leaves the title row before the wording is shortened", () => {
  // The full name plus the action needs 39 columns; below that the action gets
  // its own row rather than costing the user the wording they asked for.
  const inline = rowsAt(STATUS, 39)
  assert.equal(inline.actionBelow, false)
  assert.equal(inline.title, `${FULL_NAME} · 已启用`)
  assert.equal(inline.glyph, true)
  assert.equal(headerColumns(inline), 39)

  for (const width of [34, 32]) {
    const rows = rowsAt(STATUS, width)
    assert.equal(rows.actionBelow, true, `action below at ${width}`)
    assert.equal(rows.title, `${FULL_NAME} · 已启用`, `full title at ${width}`)
    assert.equal(rows.glyph, true, `glyph survives at ${width}`)
    assert.ok(titleColumns(rows) <= width, `title row fits at ${width}`)
    assert.ok(textColumns(rows.action) <= width, `action row fits at ${width}`)
  }

  // 31 and 30 cannot hold the glyph as well: the glyph goes, the wording stays.
  for (const width of [31, 30]) {
    const rows = rowsAt(STATUS, width)
    assert.equal(rows.actionBelow, true, `action below at ${width}`)
    assert.equal(rows.title, `${FULL_NAME} · 已启用`, `full title at ${width}`)
    assert.equal(rows.glyph, false, `glyph dropped at ${width}`)
    assert.ok(titleColumns(rows) <= width, `title row fits at ${width}`)
  }

  // 30 is the exact width of the title alone.
  assert.equal(titleColumns(rowsAt(STATUS, 30)), 30)
})

test("the short name is preferred over dropping the product entirely", () => {
  const at28 = rowsAt(STATUS, 28)
  assert.equal(at28.title, `${SHORT_NAME} · 已启用`)
  assert.equal(at28.actionBelow, false, "the short title shares the row again")
  assert.equal(at28.glyph, true)
  assert.equal(headerColumns(at28), 26)

  const at26 = rowsAt(STATUS, 26)
  assert.equal(at26.title, `${SHORT_NAME} · 已启用`)
  assert.equal(at26.actionBelow, false)
  assert.equal(headerColumns(at26), 26, "the row is exactly the width")

  const at24 = rowsAt(STATUS, 24)
  assert.equal(at24.title, `${SHORT_NAME} · 已启用`)
  assert.equal(at24.glyph, false, "the glyph goes before the name does")
  assert.equal(headerColumns(at24), 24)

  const at23 = rowsAt(STATUS, 23)
  assert.equal(at23.title, `${SHORT_NAME} · 已启用`)
  assert.equal(at23.actionBelow, true, "below 24 the action needs its own row again")
  assert.equal(at23.glyph, true)
  assert.equal(titleColumns(at23), 19)
})

test("the wordy state shrinks to the short state before the name is lost", () => {
  const rows = rowsAt({ ...STATUS, patched: false }, 30)
  assert.equal(rows.title, `${SHORT_NAME} · 未接管`)
  assert.equal(rows.actionBelow, false)
  assert.equal(rows.glyph, true)
  assert.equal(headerColumns(rows), 26)

  // Wide enough for the wordy state, the name keeps it.
  const wide = rowsAt({ ...STATUS, patched: false }, SIDEBAR_COLUMNS)
  assert.equal(wide.title, `${SHORT_NAME} · 未接管内置 websearch`)
  assert.equal(wide.actionBelow, false)
  assert.equal(headerColumns(wide), SIDEBAR_COLUMNS, "the header uses the whole width")
})

test("below the title ladder only the state is left", () => {
  const at16 = rowsAt(STATUS, 16)
  assert.equal(at16.title, "已启用")
  assert.equal(at16.glyph, true)
  assert.equal(at16.actionBelow, false)
  assert.equal(headerColumns(at16), 15)

  const at12 = rowsAt(STATUS, 12)
  assert.equal(at12.title, "已启用")
  assert.equal(at12.glyph, true)
  assert.equal(at12.actionBelow, true, "the action keeps its row")
  assert.equal(titleColumns(at12), 8)

  const at8 = rowsAt(STATUS, 8)
  assert.equal(at8.title, "已启用")
  assert.equal(at8.glyph, true)
  assert.equal(titleColumns(at8), 8, "the card floor still holds the state and its glyph")
  assertRowsFit(at8, 8)

  const at5 = rowsAt(STATUS, 5)
  assert.equal(at5.actionBelow, true)
  assert.ok(at5.title.endsWith("…"), "the last resort is a clipped state")
  assertRowsFit(at5, 5)
})

// The acceptance table: each width renders the first wording that fits. The
// padded amount is why the month and total rows carry three spaces before
// `¥0.04`: all three rows end on the same column. The order is by value:
// words+amount, then short units+amount, then the counters, then the amount
// alone, then a lone search count.
const LADDER: readonly (readonly [number, readonly string[]])[] = [
  [
    SIDEBAR_COLUMNS,
    [
      "今日  Search 0  Fetch 3  ¥0.015",
      "本月  Search 5  Fetch 3   ¥0.04",
      "累计  Search 5  Fetch 3   ¥0.04",
    ],
  ],
  [
    34,
    [
      "今日  Search 0  Fetch 3  ¥0.015",
      "本月  Search 5  Fetch 3   ¥0.04",
      "累计  Search 5  Fetch 3   ¥0.04",
    ],
  ],
  [
    30,
    [
      "今日 Search 0 Fetch 3 ¥0.015",
      "本月 Search 5 Fetch 3  ¥0.04",
      "累计 Search 5 Fetch 3  ¥0.04",
    ],
  ],
  [28, ["今日 Search 0 Fetch 3 ¥0.015", "本月 Search 5 Fetch 3  ¥0.04", "累计 Search 5 Fetch 3  ¥0.04"]],
  // Below 28 the words no longer fit, but the amount stays: it outranks them.
  [26, ["今日  0S  3F  ¥0.015", "本月  5S  3F   ¥0.04", "累计  5S  3F   ¥0.04"]],
  [22, ["今日  0S  3F  ¥0.015", "本月  5S  3F   ¥0.04", "累计  5S  3F   ¥0.04"]],
  [18, ["今日  0S  3F", "本月  5S  3F", "累计  5S  3F"]],
  [12, ["今日  0S  3F", "本月  5S  3F", "累计  5S  3F"]],
  // The amount comes back once it is the only number that still fits.
  [11, ["今日 ¥0.015", "本月  ¥0.04", "累计  ¥0.04"]],
  [8, ["今日 0S", "本月 5S", "累计 5S"]],
]

test("the wording ladder keeps the most valuable row at every width", () => {
  for (const [width, expected] of LADDER) {
    assert.deepEqual(rowsAt(STATUS, width).lines, expected, `rows at ${width} columns`)
    for (const line of expected) assert.ok(textColumns(line) <= width, `${width}: ${line}`)
  }
})

test("the amount outranks the words and the counters", () => {
  // The words plus the amount need 28 columns. The old ladder answered that with
  // a wider words-only row; the amount is why the card is opened, so it stays
  // and the wording shrinks instead.
  for (const line of rowsAt(STATUS, 26).lines) {
    assert.ok(!line.includes("Search") && !line.includes("Fetch"), `words are gone at 26: ${line}`)
    assert.ok(line.includes("¥"), `the amount survives at 26: ${line}`)
    assert.match(line, /\d+S/, `the counters survive at 26: ${line}`)
  }
  // Under the short-units rung the counters are the only numbers left; the
  // amount returns below that, alone, because a card with no number is useless.
  const counters = rowsAt(STATUS, 17)
  for (const line of counters.lines) {
    assert.match(line, /\d+S/, `counters at 17: ${line}`)
    assert.ok(!line.includes("¥"), `no amount at 17: ${line}`)
  }
  const amount = rowsAt(STATUS, 11)
  for (const line of amount.lines) {
    assert.ok(line.includes("¥"), `the amount at 11: ${line}`)
    assert.ok(!line.includes("Search") && !line.includes("S"), `no counters at 11: ${line}`)
  }
})

/** Which rung of the ladder a rendered row sits on. */
type Shape =
  | "words+amount"
  | "short+amount"
  | "short"
  | "label+search"
  | "label+amount"
  | "amount"

function shapeOf(line: string): Shape {
  if (line.includes("Search")) {
    assert.ok(line.includes("Fetch"), `Search never appears without Fetch: ${line}`)
    // The amount is never traded for the words: the richer rung always has both.
    assert.ok(line.includes("¥"), `the words always come with the amount: ${line}`)
    return "words+amount"
  }
  if (/\dS/.test(line)) {
    if (!/\dF/.test(line)) return "label+search"
    return line.includes("¥") ? "short+amount" : "short"
  }
  if (/[¥$]/.test(line)) return line.trimStart().startsWith("¥") ? "amount" : "label+amount"
  assert.fail(`a body row always carries a number or an amount: ${line}`)
}

test("every width from the card floor up stays inside the budget and aligned", () => {
  for (let width = 8; width <= 50; width += 1) {
    const rows = rowsAt(STATUS, width)
    assertRowsFit(rows, width)

    const shape = shapeOf(rows.lines[0])
    for (const line of rows.lines) {
      assert.equal(shapeOf(line), shape, `${width}: rows use one shape`)
      // A number never leaves its unit behind, so no row ever ends mid-column.
      assert.ok(!line.endsWith(" "), `${width}: no row has trailing space`)
      if (line.includes("¥")) {
        assert.match(line, /¥\d+\.\d{2,3}$/, `${width}: amount is bare currency: ${line}`)
      }
      if (shape === "words+amount") {
        assert.match(line, /Search \d+|Fetch \d+/, `${width}: words keep numbers: ${line}`)
      }
      if (shape === "short+amount" || shape === "short") {
        assert.match(line, /\d+S/, `${width}: S keeps its number: ${line}`)
        assert.match(line, /\d+F/, `${width}: F keeps its number: ${line}`)
      }
    }
    // The unit column and the number column are shared by all three rows.
    const markers =
      shape === "words+amount"
        ? ["Search", "Fetch"]
        : shape === "short+amount" || shape === "short"
          ? ["S", "F"]
          : shape === "label+search"
            ? ["S"]
            : []
    for (const marker of markers) {
      if (!rows.lines[0].includes(marker)) continue
      assert.equal(
        new Set(rows.lines.map((line) => line.indexOf(marker))).size,
        1,
        `${width}: ${marker} column aligns`,
      )
    }
    assert.equal(
      new Set(rows.lines.map((line) => textColumns(line))).size,
      1,
      `${width}: rows end on one column`,
    )
  }
})

test("usage counters are padded so the columns line up", () => {
  const rows = rowsAt(
    {
      ...STATUS,
      counts: {
        today: { search: 2, fetch: 1, empty: 0, failed: 0, costMicro: 1000 },
        month: { search: 20, fetch: 3, empty: 0, failed: 0, costMicro: 25000 },
        total: { search: 100, fetch: 3, empty: 0, failed: 0, costMicro: 100000 },
      },
    },
    SIDEBAR_COLUMNS,
  )
  assert.equal(rows.lines.length, 3)
  // Count fields are right-aligned in their shared width, so the unit column
  // and every following column start at the same index on all three rows.
  for (const marker of ["Search", "Fetch"]) {
    assert.equal(
      new Set(rows.lines.map((line) => line.indexOf(marker))).size,
      1,
      `${marker} column aligns across rows`,
    )
  }
  // Right-alignment: each count ends just before its unit word.
  for (const unit of ["Search", "Fetch"]) {
    const ends = rows.lines.map((line) => line.indexOf(unit) - 1)
    assert.equal(new Set(ends).size, 1, `${unit} numbers end on one column`)
  }
  assert.equal(new Set(rows.lines.map((line) => textColumns(line))).size, 1, "rows end together")
  assert.ok(rows.lines[2]?.includes("100"), "the three-digit count survives")
  assertRowsFit(rows)
})

test("oversized numbers keep their unit instead of being cut", () => {
  const wide = rowsAt(
    {
      ...STATUS,
      counts: {
        today: { search: 0, fetch: 0, empty: 0, failed: 0, costMicro: 0 },
        month: { search: 1_234_567, fetch: 89, empty: 0, failed: 0, costMicro: 999_999_000 },
        total: { search: 1_234_567, fetch: 89, empty: 0, failed: 0, costMicro: 999_999_000 },
      },
    },
    SIDEBAR_COLUMNS,
  )
  for (const line of wide.lines) {
    assert.ok(!line.includes("…"), `numbers are never clipped: ${line}`)
    assert.ok(/[¥$]/.test(line), `the amount still shows: ${line}`)
    if (/\d\s*[SF]/.test(line)) {
      assert.match(line, /\d+\s*[SF]/, `every unit keeps its number: ${line}`)
    }
  }
  assertRowsFit(wide)
})

test("below the shortest rung the three rows collapse into one numbered row", () => {
  // Seven columns is the narrowest complete usage row here (`今日 0S`); under it
  // no row can carry a number, and three rows without one would say nothing.
  assert.deepEqual(rowsAt(STATUS, 7).lines, ["今日 0S", "本月 5S", "累计 5S"])

  for (const width of [6, 5]) {
    const rows = rowsAt(STATUS, width)
    assert.deepEqual(rows.lines, ["¥0.04"], `the total amount alone at ${width}`)
    assertRowsFit(rows, width)
  }
  // Even a clipped amount keeps a digit: the row is never a bare label.
  const clipped = rowsAt(STATUS, 4)
  assert.equal(clipped.lines.length, 1, "one body row, not three")
  assert.ok(textColumns(clipped.lines[0]) <= 4, `the collapsed row fits: ${clipped.lines[0]}`)
  assert.ok(clipped.lines[0].startsWith("¥"), `the amount is what survives: ${clipped.lines[0]}`)
})

test("the card ignores a width it cannot use and keeps the narrow budget", () => {
  // 0 and a few columns are what a slot reports before its first layout pass;
  // NaN and Infinity must not reach the row builder from the terminal either.
  for (const broken of [0, 4, 7, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(cardColumns(broken), FIRST_FRAME_COLUMNS, `fallback for ${broken}`)
  }
  assert.equal(cardColumns(undefined), FIRST_FRAME_COLUMNS)
  // A real measurement is used as-is, and a fractional one can only hold whole columns.
  assert.equal(cardColumns(30), 30)
  assert.equal(cardColumns(41.7), 41)
  assert.equal(cardColumns(8), 8)

  // The view model's own default matches that fallback, so the first frame and
  // an explicit 24-column measurement render the same card.
  assert.deepEqual(
    sidebarRows({ status: STATUS, error: undefined, language: "zh-CN" }),
    rowsAt(STATUS, FIRST_FRAME_COLUMNS),
  )
})

test("an older server without counts still fits the sidebar", () => {
  const legacy: SearchStatus = { ...STATUS }
  delete legacy.counts
  for (const width of [SIDEBAR_COLUMNS, FIRST_FRAME_COLUMNS]) {
    const rows = rowsAt(legacy, width)
    assert.equal(rows.lines.length, 3)
    assertRowsFit(rows, width)
    assert.deepEqual(
      new Set(rows.lines.map((line) => line.slice(0, 2))),
      new Set(["今日", "本月", "累计"]),
    )
  }
})

// ---------- the account balance row ----------

test("the balance row leads the body of both interactive states", () => {
  const cases: readonly (readonly [SearchStatus, "on" | "off", string])[] = [
    [{ ...STATUS, balance: BALANCE }, "on", "停用"],
    [{ ...STATUS, mode: "native", source: "config", patched: false, balance: BALANCE }, "off", "启用"],
  ]
  for (const [status, tone, verb] of cases) {
    const rows = rowsAt(status, SIDEBAR_COLUMNS)
    assert.equal(rows.tone, tone)
    assert.ok(rows.action.includes(verb))
    assert.equal(rows.lines.length, 4, `balance plus three usage rows (${tone})`)
    assert.equal(rows.lines[0], "余额 ¥110.00", "the balance is the first body row")
    assert.deepEqual(
      rows.lines.slice(1).map((line) => line.slice(0, 2)),
      ["今日", "本月", "累计"],
      "the usage rows follow unchanged",
    )
    assertRowsFit(rows, SIDEBAR_COLUMNS)
    assert.equal(cardRows(rows), 5, "four body rows still fit the card")
  }
})

test("only a live takeover or native mode shows a balance row", () => {
  // Nothing is being taken over here, so the account is not the card's business.
  for (const status of [
    { ...STATUS, patched: false, balance: BALANCE },
    { ...STATUS, hasKey: false, balance: BALANCE },
  ]) {
    const rows = rowsAt(status, SIDEBAR_COLUMNS)
    assert.equal(rows.lines.length, 3, "usage rows only")
    for (const line of rows.lines) assert.ok(!line.includes("余额"), `no balance row: ${line}`)
  }
  const failed = rowsAt(undefined, SIDEBAR_COLUMNS, "RPC 不可用")
  assert.equal(failed.lines.length, 1, "an error keeps its single reason row")
})

test("an unavailable balance is marked with a leading ! and keeps its amount", () => {
  const rows = rowsAt({ ...STATUS, balance: { ...BALANCE, isAvailable: false } }, SIDEBAR_COLUMNS)
  assert.equal(rows.lines.length, 4)
  assert.equal(rows.lines[0], "!余额 ¥110.00", "the marker prefixes the localized label")
  assert.match(rows.lines[0], /!\D+¥\d/u, "the marker is followed by the label, then the amount")
  assertRowsFit(rows, SIDEBAR_COLUMNS)
})

test("the ! marker costs one column, so it drops the row one column earlier", () => {
  const plain = rowsAt({ ...STATUS, balance: BALANCE }, BALANCE_COLUMNS)
  assert.equal(plain.lines[0], "余额 ¥110.00")
  assert.equal(plain.lines.length, 4)

  const marked = rowsAt({ ...STATUS, balance: { ...BALANCE, isAvailable: false } }, BALANCE_COLUMNS)
  assert.equal(marked.lines.length, 3, "one column short: the row is dropped, not clipped")
  for (const line of marked.lines) assert.ok(!line.startsWith("!"), `no half a balance row: ${line}`)
})

test("a balance row that cannot fit is dropped, never squeezed", () => {
  for (const width of [8, 10, BALANCE_COLUMNS - 1]) {
    const rows = rowsAt({ ...STATUS, balance: BALANCE }, width)
    assert.ok(rows.lines.length <= 3, `usage only at ${width}`)
    for (const line of rows.lines) assert.ok(!line.includes("¥110.00"), `no truncated balance: ${line}`)
    assertRowsFit(rows, width)
  }
})

test("the balance row keeps the action on the title row", () => {
  // Four body rows leave no room for a second header row: the card would pass
  // five rows at every width, so the action is forced inline instead.
  for (let width = BALANCE_COLUMNS; width <= 60; width += 1) {
    const rows = rowsAt({ ...STATUS, balance: BALANCE }, width)
    assert.equal(rows.lines.length, 4, `balance shown at ${width}`)
    assert.equal(rows.actionBelow, false, `action stays inline at ${width}`)
    assertRowsFit(rows, width)
  }
})

test("a USD balance renders the dollar sign the server reported", () => {
  const rows = rowsAt({ ...STATUS, balance: { ...BALANCE, currency: "USD", totalBalance: "57.30" } }, 40)
  assert.equal(rows.lines[0], "余额 $57.30")
})

test("a server amount is shown verbatim, never re-rounded", () => {
  const rows = rowsAt({ ...STATUS, balance: { ...BALANCE, totalBalance: "0.00" } }, 40)
  assert.equal(rows.lines[0], "余额 ¥0.00")
})
