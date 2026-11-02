// Pure view model for the sidebar card. No renderer, no runtime dependency:
// the card and the tests both derive their text from here.
import type { SearchStatus, UsageCounts } from "./rpc.ts"

export interface SidebarInput {
  readonly status: SearchStatus | undefined
  readonly error: string | undefined
  /**
   * Columns one row may occupy. Defaults to the narrow sidebar budget; a host
   * that has measured its width may pass it, and the desktop panel passes
   * `Infinity` because it has room for the verbose copy.
   */
  readonly maxColumns?: number
}

export interface SidebarRows {
  /** State headline, e.g. `已启用`; the full name only survives on wide surfaces. */
  readonly title: string
  /**
   * Whether the title row starts with the tone glyph. False only when even the
   * state alone cannot share the row with the action.
   */
  readonly glyph: boolean
  /**
   * Clickable label including its hit-area brackets, e.g. `[停用]`. A state
   * without an action carries its fix copy here instead, where the desktop
   * panel reads it; the terminal renders that copy as `hint`.
   */
  readonly action: string
  /**
   * Whether the action must take a row of its own under the title. True only
   * when the title row cannot hold it: shortening the title is the worse trade,
   * because the full wording is what the user asked for.
   */
  readonly actionBelow: boolean
  /** Non-interactive fix row under the title; only states without an action have one. */
  readonly hint: string | undefined
  /** Whether a click on `action` really performs it (some states have no action). */
  readonly clickable: boolean
  /** Body rows: the three usage rows, or the short error reason. */
  readonly lines: readonly string[]
  /** Drives the state color in card.ts. */
  readonly tone: "on" | "off" | "warn" | "error" | "idle"
}

// The product name in the headline: the user's wording, case included.
const NAME = "DeepSeek search/fetch"
// The narrowest headline that still identifies the card; used when the product
// name above would cost the row too much space.
const SHORT_NAME = "DeepSeek"
// The card renders a glyph and a space before the title.
const TITLE_GLYPH_COLUMNS = 2
// Minimum space between the title and the action so they never touch.
const TITLE_ACTION_GAP = 1
// One card row of the narrowest surface, host padding already subtracted. Also
// the fallback budget before the host has reported a measured width.
export const DEFAULT_COLUMNS = 24

const PERIODS = ["today", "month", "total"] as const
type Period = (typeof PERIODS)[number]
const LABELS: Readonly<Record<Period, string>> = { today: "今日", month: "本月", total: "累计" }

type Counts = NonNullable<SearchStatus["counts"]>

/** Terminal columns of one code point; only CJK-style wide ranges matter here. */
function columns(char: string): number {
  const cp = char.codePointAt(0) ?? 0
  if (cp === 0) return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals … Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2
  }
  return 1
}

/** Terminal columns of a string: the measure every card row must fit. */
export function textColumns(text: string): number {
  let total = 0
  for (const char of text) total += columns(char)
  return total
}

/** Clip to the budget with a single ellipsis; used only as a last resort. */
function clip(text: string, maxColumns: number): string {
  if (maxColumns < 1) return ""
  if (textColumns(text) <= maxColumns) return text
  let out = ""
  let used = 0
  for (const char of text) {
    const width = columns(char)
    if (used + width > maxColumns - 1) return `${out}…`
    out += char
    used += width
  }
  return out
}

/** One short body line: collapse whitespace, then clip to the available columns. */
function shortMessage(message: string, maxColumns: number): string {
  const text = message.replace(/\s+/g, " ").trim()
  return clip(text || "读取失败", maxColumns)
}

/** Micro-currency as `¥0.015`: three decimals, trailing zeros trimmed to cents. */
function money(costMicro: number): string {
  const value = Number.isFinite(costMicro) && costMicro > 0 ? costMicro / 1_000_000 : 0
  let text = value.toFixed(3)
  // `0.040` → `0.04`, `0.015` unchanged; keep two decimals so amounts stay currency-shaped.
  while (text.endsWith("0") && text.length > 4) text = text.slice(0, -1)
  return `¥${text}`
}

interface UsageLayout {
  readonly search: number
  readonly fetch: number
  readonly cost: number
}

/**
 * Column widths shared by the three usage rows. Counting digits is enough:
 * every count is a non-negative integer, so its width is its digit count. The
 * amount is padded too, so all three rows end on the same column.
 */
function usageLayout(counts: Counts): UsageLayout {
  const rows = PERIODS.map((period) => counts[period])
  return {
    search: Math.max(...rows.map((row) => String(row.search).length)),
    fetch: Math.max(...rows.map((row) => String(row.fetch).length)),
    cost: Math.max(...rows.map((row) => money(row.costMicro).length)),
  }
}

/**
 * One usage row, e.g. `今日  Search 0  Fetch 3  ¥0.015` when the surface is
 * wide, otherwise shorter forms down to `今日`. The words are the product's
 * copy, so they survive as long as any shape can hold them: the amount goes
 * first, then the tighter grouping, and only then `0S` / `3F`. Counts are
 * right-aligned in their shared width and every row picks the same form, so
 * the three rows read as a table.
 */
function compactUsageRow(
  period: Period,
  counts: UsageCounts,
  layout: UsageLayout,
  maxColumns: number,
): string {
  const label = LABELS[period]
  const search = String(counts.search).padStart(layout.search, " ")
  const fetch = String(counts.fetch).padStart(layout.fetch, " ")
  const cost = money(counts.costMicro).padStart(layout.cost, " ")
  // Each candidate is a complete row, so nothing is ever left dangling and no
  // number is ever cut from its unit.
  const candidates = [
    `${label}  Search ${search}  Fetch ${fetch}  ${cost}`,
    `${label} Search ${search} Fetch ${fetch} ${cost}`,
    `${label}  Search ${search}  Fetch ${fetch}`,
    `${label} Search ${search} Fetch ${fetch}`,
    `${label}  ${search}S  ${fetch}F  ${cost}`,
    `${label}  ${search}S  ${fetch}F`,
    `${label}  ${search}S`,
  ]
  for (const row of candidates) {
    if (textColumns(row) <= maxColumns) return row
  }
  return textColumns(label) <= maxColumns ? label : clip(label, maxColumns)
}

/**
 * An older server only sends pre-formatted strings. Keep the full string when
 * it fits, otherwise drop its trailing segments whole: the amount and the
 * diagnostic counters go first, then the fetch count.
 */
function legacyUsageRow(period: Period, text: string, maxColumns: number): string {
  const label = LABELS[period]
  const full = `${label} ${text}`
  if (textColumns(full) <= maxColumns) return full
  const stats = text.split(" · ").filter((part) => !part.startsWith("¥") && !part.startsWith("空/失"))
  const candidates = [
    `${label} ${stats.join("  ")}`.trimEnd(),
    `${label} ${stats[0] ?? ""}`.trimEnd(),
    label,
  ]
  for (const row of candidates) {
    if (textColumns(row) <= maxColumns) return row
  }
  return clip(label, maxColumns)
}

function usageLines(status: SearchStatus, maxColumns: number): readonly string[] {
  // The desktop panel lays the original verbose copy out as ` · ` chunks of its
  // own table; only the terminal needs the compact form.
  if (maxColumns === Number.POSITIVE_INFINITY) {
    return [`今日 ${status.today}`, `本月 ${status.month}`, `累计 ${status.total}`]
  }
  const counts = status.counts
  if (counts) {
    const layout = usageLayout(counts)
    return PERIODS.map((period) => compactUsageRow(period, counts[period], layout, maxColumns))
  }
  return PERIODS.map((period) => legacyUsageRow(period, status[period], maxColumns))
}

/**
 * The clickable label, always bracketed: a bare two-character verb is an easy
 * target to miss. At pathological widths the verb is clipped but the brackets
 * stay, so the hit area never turns into plain text.
 */
function fitAction(verb: string, maxColumns: number): string {
  const label = `[${verb}]`
  if (maxColumns === Number.POSITIVE_INFINITY || textColumns(label) <= maxColumns) return label
  const inner = maxColumns - 2
  return inner >= 1 ? `[${clip(verb, inner)}]` : clip(label, maxColumns)
}

interface TitleFit {
  readonly title: string
  readonly glyph: boolean
  /** The action takes its own row, right-aligned, instead of sharing this one. */
  readonly actionBelow: boolean
}

/**
 * The headline and where the action goes. The wording is the user's, so it is
 * only shortened once no placement can hold it: first the title and the action
 * share a row (the preferred layout), then the action moves to a row of its own
 * and the title keeps the full width, and only then do the product name and the
 * wordy state shrink. Within one wording the glyph is the first thing to go,
 * because it costs two columns and the state word is right beside it.
 */
function fitTitle(
  state: string,
  shortState: string,
  maxColumns: number,
  actionColumns: number | undefined,
): TitleFit {
  const budget = (glyph: boolean, actionBelow: boolean): number => {
    if (maxColumns === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
    const prefix = glyph ? TITLE_GLYPH_COLUMNS : 0
    const tail = actionColumns === undefined || actionBelow ? 0 : actionColumns + TITLE_ACTION_GAP
    return Math.max(0, maxColumns - prefix - tail)
  }
  const candidates = [
    `${NAME} · ${state}`,
    `${SHORT_NAME} · ${state}`,
    `${SHORT_NAME} · ${shortState}`,
    state,
    shortState,
  ]
  // Inline first, then the action below it; a wording is never traded for a
  // shorter one that happens to fit inline, because the wording is the point.
  const placements = actionColumns === undefined ? [false] : [false, true]
  for (const candidate of candidates) {
    for (const actionBelow of placements) {
      for (const glyph of [true, false]) {
        if (textColumns(candidate) <= budget(glyph, actionBelow)) {
          return { title: candidate, glyph, actionBelow }
        }
      }
    }
  }
  // Nothing fits whole at a pathological width: clip the state and give the
  // action its own row so the hit area never disappears.
  const actionBelow = actionColumns !== undefined
  return { title: clip(shortState, budget(false, actionBelow)), glyph: false, actionBelow }
}

/** The fix hint for a missing key; it gets its own row because no click can fix it. */
function fitHint(maxColumns: number): string {
  const candidates = [
    "设置 DEEPSEEK_API_KEY 后重启",
    "设置 API KEY 后重启",
    "设置 API KEY",
    "设置 KEY",
  ]
  if (maxColumns === Number.POSITIVE_INFINITY) return candidates[0]
  for (const candidate of candidates) {
    if (textColumns(candidate) <= maxColumns) return candidate
  }
  return clip(candidates[candidates.length - 1], maxColumns)
}

interface ActionRows extends TitleFit {
  readonly action: string
}

/** Fit the action first: the title can only use the columns it leaves over. */
function actionRows(state: string, shortState: string, verb: string, maxColumns: number): ActionRows {
  const action = fitAction(verb, maxColumns)
  return { ...fitTitle(state, shortState, maxColumns, textColumns(action)), action }
}

export function sidebarRows(input: SidebarInput): SidebarRows {
  const { status, error } = input
  const maxColumns = input.maxColumns ?? DEFAULT_COLUMNS
  const lines = status === undefined ? [] : usageLines(status, maxColumns)

  // No status yet: the body has no numbers to show, only the reason (or that
  // the first read is still in flight).
  if (status === undefined) {
    return error === undefined || error.trim() === ""
      ? {
          ...actionRows("正在读取…", "正在读取…", "重试", maxColumns),
          hint: undefined,
          clickable: true,
          lines,
          tone: "idle",
        }
      : {
          ...actionRows("读取失败", "读取失败", "重试", maxColumns),
          hint: undefined,
          clickable: true,
          lines: [shortMessage(error, maxColumns)],
          tone: "error",
        }
  }

  if (status.patched && status.hasKey) {
    return {
      ...actionRows("已启用", "已启用", "停用", maxColumns),
      hint: undefined,
      clickable: true,
      lines,
      tone: "on",
    }
  }
  if (!status.patched && status.mode === "deepseek") {
    // DeepSeek was requested but the built-in tool was not found: nothing is
    // actually taken over, so the only honest action is to release the mode.
    return {
      ...actionRows("未接管内置 websearch", "未接管", "交还", maxColumns),
      hint: undefined,
      clickable: true,
      lines,
      tone: "warn",
    }
  }
  if (status.mode === "native") {
    return {
      ...actionRows("已停用", "已停用", "启用", maxColumns),
      hint: undefined,
      clickable: true,
      lines,
      tone: "off",
    }
  }
  // A missing key is not something a click can fix, so the title row stands
  // alone and the hint gets its own row directly under it. The env var name
  // only survives on surfaces wide enough for it.
  const hint = fitHint(maxColumns)
  return {
    ...fitTitle("未配置 API Key", "缺 API Key", maxColumns, undefined),
    action: hint,
    hint,
    clickable: false,
    lines,
    tone: "error",
  }
}
