import assert from "node:assert/strict"
import { test } from "node:test"
import { sidebarRows, textColumns } from "../src/status-view.ts"
import type { SidebarRows } from "../src/status-view.ts"
import { cardColumns } from "../src/tui/card.ts"
import type { SearchStatus } from "../src/rpc.ts"

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

function rowsAt(status: SearchStatus | undefined, maxColumns = SIDEBAR_COLUMNS, error?: string) {
  return sidebarRows({ status, error, maxColumns })
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
// `¥0.04`: all three rows end on the same column.
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
  [26, ["今日  Search 0  Fetch 3", "本月  Search 5  Fetch 3", "累计  Search 5  Fetch 3"]],
  [22, ["今日 Search 0 Fetch 3", "本月 Search 5 Fetch 3", "累计 Search 5 Fetch 3"]],
  [18, ["今日  0S  3F", "本月  5S  3F", "累计  5S  3F"]],
]

test("the wording ladder keeps the words and drops the amount first", () => {
  for (const [width, expected] of LADDER) {
    assert.deepEqual(rowsAt(STATUS, width).lines, expected, `rows at ${width} columns`)
    for (const line of expected) assert.ok(textColumns(line) <= width, `${width}: ${line}`)
  }
})

test("the amount goes before the words are abbreviated", () => {
  // The words alone need 23 columns; the short units need 20 with the amount.
  const wordsOnly = rowsAt(STATUS, 23)
  for (const line of wordsOnly.lines) {
    assert.ok(line.includes("Search") && line.includes("Fetch"), `words at 23: ${line}`)
    assert.ok(!line.includes("¥"), `amount dropped at 23: ${line}`)
    assert.ok(!line.includes("0S"), `no abbreviation while the words fit: ${line}`)
  }

  const short = rowsAt(STATUS, 20)
  for (const line of short.lines) {
    assert.ok(!line.includes("Search") && !line.includes("Fetch"), `abbreviated at 20: ${line}`)
    assert.ok(line.includes("¥"), `amount kept once the words are gone: ${line}`)
  }
})

/** Which rung of the ladder a rendered row sits on. */
type Shape = "words+amount" | "words" | "short+amount" | "short" | "short-search" | "label"

function shapeOf(line: string): Shape {
  if (line.includes("Search")) {
    assert.ok(line.includes("Fetch"), `Search never appears without Fetch: ${line}`)
    return line.includes("¥") ? "words+amount" : "words"
  }
  if (/\dS/.test(line)) {
    if (!/\dF/.test(line)) return "short-search"
    return line.includes("¥") ? "short+amount" : "short"
  }
  return "label"
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
      if (shape === "words+amount" || shape === "words") {
        assert.match(line, /Search \d+|Fetch \d+/, `${width}: words keep numbers: ${line}`)
      }
      if (shape === "short+amount" || shape === "short") {
        assert.match(line, /\d+S/, `${width}: S keeps its number: ${line}`)
        assert.match(line, /\d+F/, `${width}: F keeps its number: ${line}`)
      }
    }
    // The unit column and the number column are shared by all three rows.
    const markers =
      shape === "words+amount" || shape === "words"
        ? ["Search", "Fetch"]
        : shape === "short-search"
          ? ["S"]
          : ["S", "F"]
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
    assert.ok(shapeOf(line) !== "label", `a count still shows: ${line}`)
    if (/\d\s*[SF]/.test(line)) {
      assert.match(line, /\d+\s*[SF]/, `every unit keeps its number: ${line}`)
    }
  }
  assertRowsFit(wide)
})

test("below the card floor the label is the last thing to go", () => {
  for (const width of [7, 6, 5]) {
    const rows = rowsAt(STATUS, width)
    assert.deepEqual(rows.lines, ["今日", "本月", "累计"], `labels only at ${width}`)
    assertRowsFit(rows, width)
  }
  const clipped = rowsAt(STATUS, 3)
  assert.equal(clipped.lines[0], "今…", "the label itself is clipped when nothing fits")
  assert.equal(textColumns(clipped.lines[0]), 3)
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
    sidebarRows({ status: STATUS, error: undefined }),
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
