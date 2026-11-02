// Pure view model for the sidebar card. No renderer, no runtime dependency:
// the card and the tests both derive their text from here.
import { format, pack, t } from "./i18n/index.ts"
import type { SearchStatus, UsageCounts, Language } from "./rpc.ts"

export interface SidebarInput {
  readonly status: SearchStatus | undefined
  /** The last read failure, if any; undefined while the first read is in flight. */
  readonly error?: string | undefined
  /**
   * Columns one row may occupy. Defaults to the narrow sidebar budget; a host
   * that has measured its width may pass it, and the desktop panel passes
   * `Infinity` because it has room for the verbose copy.
   */
  readonly maxColumns?: number
  /** Resolved by the server and carried in `status`; both sidebars read it there. */
  readonly language: Language
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
const LABEL_KEY = {
  today: "usage.label.today",
  month: "usage.label.month",
  total: "usage.label.total",
} as const

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
function shortMessage(message: string, maxColumns: number, language: Language): string {
  const text = message.replace(/\s+/g, " ").trim()
  return clip(text || t(language, "state.failed"), maxColumns)
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
 * wide, otherwise shorter forms down to `今日`. The ladder is per language:
 * each locale owns the shapes that read well at its widths, so no language is
 * squeezed into another one's budget. Counts are right-aligned in their shared
 * width and every row picks the same form, so the three rows read as a table.
 */
function compactUsageRow(
  period: Period,
  counts: UsageCounts,
  layout: UsageLayout,
  maxColumns: number,
  language: Language,
): string {
  const label = t(language, LABEL_KEY[period])
  const search = String(counts.search).padStart(layout.search, " ")
  const fetch = String(counts.fetch).padStart(layout.fetch, " ")
  const cost = money(counts.costMicro).padStart(layout.cost, " ")
  const params = { label, search, fetch, cost }
  // Each candidate is a complete row, so nothing is ever left dangling and no
  // number is ever cut from its unit.
  for (const form of pack(language).usageForms) {
    const row = format(form, params)
    if (textColumns(row) <= maxColumns) return row
  }
  return textColumns(label) <= maxColumns ? label : clip(label, maxColumns)
}

/**
 * An older server only sends pre-formatted strings, and those are always the
 * Chinese ones this plugin used to send: the filter below is deliberately
 * Chinese-only and stays correct while the UI language changes. Keep the full
 * string when it fits, otherwise drop its trailing segments whole: the amount
 * and the diagnostic counters go first, then the fetch count.
 */
function legacyUsageRow(period: Period, text: string, maxColumns: number, language: Language): string {
  const label = t(language, LABEL_KEY[period])
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

function usageLines(status: SearchStatus, maxColumns: number, language: Language): readonly string[] {
  // The desktop panel lays the original verbose copy out as ` · ` chunks of its
  // own table; only the terminal needs the compact form.
  if (maxColumns === Number.POSITIVE_INFINITY) {
    return [
      `${t(language, "usage.label.today")} ${status.today}`,
      `${t(language, "usage.label.month")} ${status.month}`,
      `${t(language, "usage.label.total")} ${status.total}`,
    ]
  }
  const counts = status.counts
  if (counts) {
    const layout = usageLayout(counts)
    return PERIODS.map((period) => compactUsageRow(period, counts[period], layout, maxColumns, language))
  }
  return PERIODS.map((period) => legacyUsageRow(period, status[period], maxColumns, language))
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
function fitHint(maxColumns: number, language: Language): string {
  const forms = pack(language).hintForms
  if (maxColumns === Number.POSITIVE_INFINITY) return forms[0] ?? ""
  for (const form of forms) {
    if (textColumns(form) <= maxColumns) return form
  }
  return clip(forms[forms.length - 1] ?? "", maxColumns)
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
  const { status, error, language } = input
  const maxColumns = input.maxColumns ?? DEFAULT_COLUMNS
  const lines = status === undefined ? [] : usageLines(status, maxColumns, language)

  // No status yet: the body has no numbers to show, only the reason (or that
  // the first read is still in flight).
  if (status === undefined) {
    const retry = t(language, "action.retry")
    return error === undefined || error.trim() === ""
      ? {
          ...actionRows(t(language, "state.loading"), t(language, "state.loadingShort"), retry, maxColumns),
          hint: undefined,
          clickable: true,
          lines,
          tone: "idle",
        }
      : {
          ...actionRows(t(language, "state.failed"), t(language, "state.failedShort"), retry, maxColumns),
          hint: undefined,
          clickable: true,
          lines: [shortMessage(error, maxColumns, language)],
          tone: "error",
        }
  }

  if (status.patched && status.hasKey) {
    return {
      ...actionRows(t(language, "state.enabled"), t(language, "state.enabledShort"), t(language, "action.disable"), maxColumns),
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
      ...actionRows(
        t(language, "state.unpatched"),
        t(language, "state.unpatchedShort"),
        t(language, "action.release"),
        maxColumns,
      ),
      hint: undefined,
      clickable: true,
      lines,
      tone: "warn",
    }
  }
  if (status.mode === "native") {
    return {
      ...actionRows(t(language, "state.disabled"), t(language, "state.disabledShort"), t(language, "action.enable"), maxColumns),
      hint: undefined,
      clickable: true,
      lines,
      tone: "off",
    }
  }
  // A missing key is not something a click can fix, so the title row stands
  // alone and the hint gets its own row directly under it. The env var name
  // only survives on surfaces wide enough for it.
  const hint = fitHint(maxColumns, language)
  return {
    ...fitTitle(t(language, "state.missingKey"), t(language, "state.missingKeyShort"), maxColumns, undefined),
    action: hint,
    hint,
    clickable: false,
    lines,
    tone: "error",
  }
}
