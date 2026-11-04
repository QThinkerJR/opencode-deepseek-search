import assert from "node:assert/strict"
import { test } from "node:test"
import { sidebarRows, textColumns, type SidebarRows } from "../src/status-view.ts"
import type { BalanceStatus, Language, SearchStatus } from "../src/rpc.ts"

// The language matrix: every surface renders from the same `status.language`,
// so each language must fit the measured sidebar on its own terms. The wording
// itself is reviewed by hand; these checks are structural.

const LOCALES: readonly Language[] = ["en", "ja", "zh-CN"]
// The card floor the terminal can actually give the card.
const CARD_FLOOR = 8
const WIDE = 80
const GLYPH_COLUMNS = 2
const ACTION_GAP = 1

const COUNTS = {
  today: { search: 0, fetch: 3, empty: 2, failed: 0, costMicro: 15000 },
  month: { search: 5, fetch: 3, empty: 3, failed: 0, costMicro: 40000 },
  total: { search: 1200, fetch: 34, empty: 8, failed: 2, costMicro: 6_170_000 },
}

const STATUS: SearchStatus = {
  mode: "deepseek",
  source: "override",
  patched: true,
  hasKey: true,
  pricePerThousand: 5,
  today: "搜索 0 · 抓取 3 · 空/失 2 · ¥0.0150",
  month: "搜索 5 · 抓取 3 · 空/失 3 · ¥0.0400",
  total: "搜索 1200 · 抓取 34 · 空/失 10 · ¥6.1700",
  language: "zh-CN",
  counts: COUNTS,
}

/** A cached balance snapshot, in the shape the server sends it. */
const BALANCE: BalanceStatus = {
  isAvailable: true,
  currency: "CNY",
  totalBalance: "110.00",
  grantedBalance: "0.00",
  toppedUpBalance: "110.00",
  fetchedAt: 1_700_000_000_000,
}

const VARIANTS: readonly { name: string; status: SearchStatus | undefined; error?: string }[] = [
  { name: "enabled", status: STATUS },
  { name: "enabled+balance", status: { ...STATUS, balance: BALANCE } },
  { name: "enabled+balance unavailable", status: { ...STATUS, balance: { ...BALANCE, isAvailable: false } } },
  { name: "disabled", status: { ...STATUS, mode: "native", source: "config", patched: false } },
  { name: "unpatched", status: { ...STATUS, patched: false } },
  { name: "missing key", status: { ...STATUS, hasKey: false } },
  { name: "loading", status: undefined },
  { name: "error", status: undefined, error: "rpc failed: connection reset" },
]

/** The widest row the header needs: inline one row, otherwise the wider one. */
function headerColumns(rows: SidebarRows): number {
  const title = (rows.glyph ? GLYPH_COLUMNS : 0) + textColumns(rows.title)
  if (!rows.clickable) return title
  const action = textColumns(rows.action)
  return rows.actionBelow ? Math.max(title, action) : title + ACTION_GAP + action
}

/**
 * Structural checks for one rendered card. `digits` is on for every state that
 * has a body of numbers: a usage row or a balance row without one would say
 * nothing, and the ladder exists to make sure that never happens.
 */
function assertFits(rows: SidebarRows, width: number, label: string, digits = false) {
  assert.ok(headerColumns(rows) <= width, `${label} @${width}: header is ${headerColumns(rows)} cols`)
  assert.ok(textColumns(rows.action) <= width, `${label} @${width}: action is too wide`)
  if (rows.hint !== undefined) {
    assert.ok(rows.hint.length > 0, `${label} @${width}: a hint is never blank`)
    assert.ok(textColumns(rows.hint) <= width, `${label} @${width}: hint is too wide`)
  }
  for (const line of rows.lines) {
    assert.ok(line.length > 0, `${label} @${width}: a body row is never blank`)
    assert.ok(textColumns(line) <= width, `${label} @${width}: line is too wide: ${line}`)
    if (digits) assert.match(line, /\d/u, `${label} @${width}: a body row carries a number: ${line}`)
  }
  // An amount never appears alone on a row that has company: the label is what
  // makes the number mean something. (A collapsed body is a single row and legitimately
  // just the total amount.)
  const amounts = rows.lines.filter((line) => /[¥$]/u.test(line))
  if (amounts.length >= 2) {
    for (const line of amounts) {
      const prefix = line.slice(0, line.search(/[¥$]/u))
      assert.ok(/[^\d\s]/u.test(prefix), `${label} @${width}: amount without its label: ${line}`)
    }
  }
  const height = 1 + (rows.actionBelow ? 1 : 0) + (rows.hint === undefined ? 0 : 1) + rows.lines.length
  assert.ok(height <= 5, `${label} @${width}: card is ${height} rows`)
}

test("every language fits every variant from the card floor to a wide sidebar", () => {
  for (const language of LOCALES) {
    for (const variant of VARIANTS) {
      for (let width = CARD_FLOOR; width <= WIDE; width += 1) {
        const rows = sidebarRows({
          status: variant.status,
          error: variant.error,
          maxColumns: width,
          language,
        })
        // Only states with a body of numbers must keep a digit on every row.
        assertFits(rows, width, `${language}/${variant.name}`, variant.status !== undefined)
      }
    }
  }
})

test("the usage rows share one form and end on one column in every language", () => {
  for (const language of LOCALES) {
    for (let width = CARD_FLOOR; width <= WIDE; width += 1) {
      const rows = sidebarRows({ status: STATUS, maxColumns: width, language })
      assert.equal(
        new Set(rows.lines.map((line) => textColumns(line))).size,
        1,
        `${language} @${width}: rows end on one column: ${rows.lines.join(" | ")}`,
      )
      for (const line of rows.lines) assert.ok(!line.endsWith(" "), `${language} @${width}: trailing space`)

      // The balance row is not a usage row: it is as wide as its amount makes it,
      // so the shared-column table starts after it.
      const withBalance = sidebarRows({ status: { ...STATUS, balance: BALANCE }, maxColumns: width, language })
      const offset = withBalance.lines.length > rows.lines.length ? 1 : 0
      const usage = withBalance.lines.slice(offset)
      assert.ok(usage.length > 0, `${language} @${width}: the body keeps its usage rows`)
      assert.equal(
        new Set(usage.map((line) => textColumns(line))).size,
        1,
        `${language} @${width}: usage rows end on one column: ${usage.join(" | ")}`,
      )
      for (const line of withBalance.lines) assert.ok(!line.endsWith(" "), `${language} @${width}: trailing space`)
    }
  }
})

test("the balance row appears as soon as it fits, and leads the body", () => {
  // Every label is the same width here except English, which has a verbose form
  // first: the compact `Bal.` form is what a terminal sidebar sees.
  const today = { en: "Today", ja: "今日", "zh-CN": "今日" } as const
  const firstWidth: Record<string, number> = {}
  for (const language of LOCALES) {
    for (let width = CARD_FLOOR; width <= WIDE; width += 1) {
      const rows = sidebarRows({ status: { ...STATUS, balance: BALANCE }, maxColumns: width, language })
      if (rows.lines.length === 4) {
        firstWidth[language] = width
        assert.match(rows.lines[0], /¥110\.00/u, `${language} @${width}: the balance amount`)
        assert.ok(rows.lines[1]?.startsWith(today[language]), `${language} @${width}: usage follows the balance`)
        break
      }
    }
  }
  assert.deepEqual(firstWidth, { en: 12, ja: 12, "zh-CN": 12 })
})

test("only the states that point at the account show a balance row", () => {
  const cases = [
    { name: "unpatched", status: { ...STATUS, patched: false, balance: BALANCE }, lines: 3 },
    { name: "missing key", status: { ...STATUS, hasKey: false, balance: BALANCE }, lines: 3 },
    { name: "disabled", status: { ...STATUS, mode: "native" as const, source: "config" as const, patched: false, balance: BALANCE }, lines: 4 },
  ]
  for (const language of LOCALES) {
    for (const item of cases) {
      const rows = sidebarRows({ status: item.status, maxColumns: 40, language })
      assert.equal(rows.lines.length, item.lines, `${language}/${item.name}: body height`)
      const balanceRows = rows.lines.filter((line) => line.includes("110.00"))
      assert.equal(balanceRows.length, item.lines === 4 ? 1 : 0, `${language}/${item.name}: balance rows`)
    }
    const failed = sidebarRows({ status: undefined, error: "rpc failed", maxColumns: 40, language })
    assert.equal(failed.lines.length, 1, `${language}: an error shows its reason alone`)
  }
})

test("each language renders its own state wording and action verb", () => {
  const expected = {
    en: { on: "Enabled", off: "Disabled", warn: "not taken over", verbOn: "Disable", verbOff: "Enable", verbWarn: "Release" },
    ja: { on: "有効", off: "無効", warn: "未引き継ぎ", verbOn: "停止", verbOff: "有効化", verbWarn: "返上" },
    "zh-CN": { on: "已启用", off: "已停用", warn: "未接管", verbOn: "停用", verbOff: "启用", verbWarn: "交还" },
  } as const

  for (const language of LOCALES) {
    const words = expected[language]
    const on = sidebarRows({ status: STATUS, maxColumns: 60, language })
    assert.match(on.title, new RegExp(words.on), `${language}: enabled title`)
    assert.match(on.action, new RegExp(words.verbOn), `${language}: disable verb`)

    const off = sidebarRows({ status: { ...STATUS, mode: "native", patched: false }, maxColumns: 60, language })
    assert.match(off.title, new RegExp(words.off), `${language}: disabled title`)
    assert.match(off.action, new RegExp(words.verbOff), `${language}: enable verb`)

    const warn = sidebarRows({ status: { ...STATUS, patched: false }, maxColumns: 60, language })
    assert.match(warn.title, new RegExp(words.warn), `${language}: unpatched title`)
    assert.match(warn.action, new RegExp(words.verbWarn), `${language}: release verb`)
  }
})

test("a missing key names the environment variable in every language when it fits", () => {
  for (const language of LOCALES) {
    const wide = sidebarRows({ status: { ...STATUS, hasKey: false }, maxColumns: 80, language })
    assert.equal(wide.clickable, false, `${language}: nothing to click`)
    assert.ok(wide.hint?.includes("DEEPSEEK_API_KEY"), `${language}: wide hint names the variable: ${wide.hint}`)
    assert.equal(wide.action, wide.hint, `${language}: the desktop reads the fix copy`)

    const narrow = sidebarRows({ status: { ...STATUS, hasKey: false }, maxColumns: 10, language })
    assert.ok((narrow.hint?.length ?? 0) > 0, `${language}: even the narrowest hint is not blank`)
  }
})

test("the desktop's verbose rows use the localized period labels", () => {
  const labels = { en: "Today", ja: "今日", "zh-CN": "今日" } as const
  for (const language of LOCALES) {
    const rows = sidebarRows({ status: STATUS, maxColumns: Number.POSITIVE_INFINITY, language })
    assert.ok(rows.lines[0]?.startsWith(labels[language]), `${language}: ${rows.lines[0]}`)
    assert.ok(rows.lines[0]?.includes(STATUS.today), `${language}: the server string is preserved`)
  }
})

test("an older server without counts still renders in every language", () => {
  const { counts: _ignored, ...legacy } = STATUS
  for (const language of LOCALES) {
    const rows = sidebarRows({ status: legacy, maxColumns: 60, language })
    assert.equal(rows.lines.length, 3)
    for (const line of rows.lines) {
      assert.ok(line.length > 0)
      assert.ok(textColumns(line) <= 60, `${language}: ${line}`)
    }
    assert.ok(rows.lines[0]?.includes("¥"), `${language}: the legacy amount survives at 60 columns`)
  }
})
