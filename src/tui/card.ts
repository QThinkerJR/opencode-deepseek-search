// The `sidebar.content` card: no frame of its own (the host sidebar already has
// one), one column, full width, and only the action label is interactive.
import type { JSX } from "@opentui/solid"
import type { ResolvedTheme } from "@opencode/theme/tui"
import { createElement, insert, setProp } from "@opentui/solid"
import type { Language, SearchStatus } from "../rpc.ts"
import { DEFAULT_COLUMNS, sidebarRows } from "../status-view.ts"
import type { SidebarRows } from "../status-view.ts"

/** A measured width under this cannot show even the usage label; treat it as unmeasured. */
const MIN_CARD_COLUMNS = 8
/** Body rows are inset this far from the title, so the card reads as one block. */
const INDENT = "  "
/** Under this many columns the indent costs more than it explains. */
const INDENT_MIN_COLUMNS = 16

/**
 * Columns the card may use. Before the first layout pass the host reports 0 (or
 * nothing at all), so both — and any other unusable value — fall back to the
 * narrow default: the first frame is a whole card rather than a one-column
 * strip, and the next measurement replaces it.
 */
export function cardColumns(measured: number | undefined): number {
  if (measured === undefined || !Number.isFinite(measured) || measured < MIN_CARD_COLUMNS) {
    return DEFAULT_COLUMNS
  }
  return Math.floor(measured)
}

type Node = ReturnType<typeof createElement>
type Child = string | Node
type Props = Readonly<Record<string, unknown>>
type Color = ResolvedTheme["text"]["base"]
type Tone = SidebarRows["tone"]

/** Text-presentation symbols, never emoji. */
const GLYPH: Readonly<Record<Tone, string>> = {
  on: "●",
  off: "○",
  warn: "◐",
  error: "!",
  idle: "…",
}

function toneColor(theme: ResolvedTheme, tone: Tone): Color {
  switch (tone) {
    case "on":
      return theme.text.feedback.success.base
    case "warn":
      return theme.text.feedback.warning.base
    case "error":
      return theme.text.feedback.error.base
    case "off":
      return theme.text.muted
    case "idle":
      return theme.text.faint
  }
}

/**
 * JSX-free element builder. Children go in one `insert` call: a second call
 * would replace the first, because Solid tracks no anchor between calls.
 */
function element(tag: string, props: Props | undefined, children: readonly Child[] = []): Node {
  const node = createElement(tag)
  if (props) {
    for (const key of Object.keys(props)) {
      const value = props[key]
      if (value !== undefined) setProp(node, key, value)
    }
  }
  if (children.length > 0) insert(node, children)
  return node
}

/** The amount at the end of a row, e.g. `¥0.015` / `$6.17`; it gets its own color. */
const MONEY_TAIL = /([¥$][\d.,]+)$/u

/**
 * One body row split into the three tiers the card colors. The view model emits
 * plain strings — one row per line, deliberately not structured — so the row is
 * split here: the leading label reads faint, the counters in the middle muted,
 * and the amount at the end is the number the user came for, so it gets full
 * contrast.
 */
interface BodyParts {
  readonly label: string
  readonly middle: string
  readonly amount: string
  /** The row starts with `!`: the balance could not be read. */
  readonly unavailable: boolean
}

function bodyParts(line: string): BodyParts {
  // `!` is the only unavailable marker in the row text and is consumed here as a
  // color directive: it is never drawn. The label and the amount still are.
  const unavailable = line.startsWith("!")
  const text = unavailable ? line.slice(1) : line
  const amount = MONEY_TAIL.exec(text)?.[1] ?? ""
  const head = amount === "" ? text : text.slice(0, text.length - amount.length)
  const gap = head.indexOf(" ")
  return {
    label: gap < 0 ? head : head.slice(0, gap),
    middle: gap < 0 ? "" : head.slice(gap),
    amount,
    unavailable,
  }
}

export function sidebarCard(input: {
  readonly status: SearchStatus | undefined
  readonly error: string | undefined
  /** UI language resolved by the server; the card never picks one itself. */
  readonly language: Language
  readonly theme: ResolvedTheme
  readonly onToggle: () => void
  /**
   * Columns the sidebar really gives the card, measured by the host. Optional
   * so the slot still builds before that measurement exists; the fallback in
   * `cardColumns` covers 0 and any unusable value.
   */
  readonly maxColumns?: number
}): JSX.Element {
  // The terminal sidebar is the surface this ladder is tuned for: the measured
  // width, not a guessed constant, decides whether the words fit.
  const columns = cardColumns(input.maxColumns)
  // The indent is part of the drawn row, so it is subtracted from the budget the
  // model composes against: every row still ends inside the measured width.
  const indent = columns >= INDENT_MIN_COLUMNS ? INDENT : ""
  const rows = sidebarRows({
    status: input.status,
    error: input.error,
    maxColumns: columns - indent.length,
    language: input.language,
  })
  const theme = input.theme
  const state = toneColor(theme, rows.tone)

  const onAction = (event: { preventDefault(): void }) => {
    event.preventDefault()
    input.onToggle()
  }

  // The title row is a flex row so the action sits at the card's right edge
  // instead of trailing the title. `space-between` is what guarantees that: the
  // title grows into the gap, and if the host ever ignores `flexGrow` the action
  // is still pushed to the far edge. The title is measured by the view model and
  // never wraps; the action keeps its own width and owns the only click handler,
  // so a click can never toggle twice.
  //
  // The state word carries the tone color, so a narrow sidebar that has to drop
  // the glyph still shows the state at a glance (the desktop panel does the same).
  // When the glyph is gone the word also goes bold — the emphasis has to live
  // somewhere. Bold rides in `style`, because the reconciler ignores an
  // `attributes` prop on text nodes and only maps `style` (fg/bg/attributes).
  const stateStyle = rows.glyph ? { fg: state } : { fg: state, bold: true }
  const separator = rows.title.indexOf(" · ")
  const titleSpans: Child[] =
    separator < 0
      ? [element("span", { style: stateStyle }, [rows.title])]
      : [
          element("span", { style: { fg: theme.text.base } }, [rows.title.slice(0, separator)]),
          element("span", { style: { fg: theme.text.faint } }, [" · "]),
          element("span", { style: stateStyle }, [rows.title.slice(separator + 3)]),
        ]
  if (rows.glyph) {
    titleSpans.unshift(element("span", { style: { fg: state } }, [`${GLYPH[rows.tone]} `]))
  }
  const title = element(
    "text",
    { selectable: false, wrapMode: "none", flexGrow: 1, flexShrink: 1 },
    titleSpans,
  )
  // A state without an action (a missing key) keeps the title row to itself;
  // its fix copy is rendered as the hint row instead.
  const action =
    rows.clickable && rows.action.length > 0
      ? element(
          "text",
          {
            selectable: false,
            wrapMode: "none",
            flexShrink: 0,
            onMouseUp: onAction,
          },
          [element("span", { style: { fg: theme.text.muted } }, [rows.action])],
        )
      : undefined
  // The model decides whether the action can share the title row. When it
  // cannot, the action gets a row of its own but keeps the same right edge: the
  // title is never shortened just to squeeze the action in beside it.
  const titleRow = element(
    "box",
    { flexDirection: "row", justifyContent: "space-between", flexShrink: 0, width: "100%" },
    action === undefined || rows.actionBelow ? [title] : [title, action],
  )
  const actionRow =
    action === undefined || !rows.actionBelow
      ? undefined
      : element(
          "box",
          { flexDirection: "row", justifyContent: "flex-end", flexShrink: 0, width: "100%" },
          [action],
        )

  // The model already composed every row to fit the sidebar, so each body row is
  // one text node: the host must never get the chance to wrap it. The row's own
  // text is split into colored spans, so the label, the counters and the amount
  // each read at their own weight without a second row or a box per line.
  const body = rows.lines.map((line) => {
    const parts = bodyParts(line)
    const spans: Child[] = []
    if (indent !== "") spans.push(element("span", { style: { fg: theme.text.faint } }, [indent]))
    if (parts.label !== "") {
      spans.push(element("span", { style: { fg: theme.text.faint } }, [parts.label]))
    }
    if (parts.middle !== "") {
      spans.push(element("span", { style: { fg: theme.text.muted } }, [parts.middle]))
    }
    if (parts.amount !== "") {
      // An unavailable balance is the one thing on the card that must not look
      // like an ordinary amount: it is the reason the next call will fail.
      const fg = parts.unavailable ? theme.text.feedback.warning.base : theme.text.base
      spans.push(element("span", { style: { fg } }, [parts.amount]))
    }
    return element("text", { selectable: false, wrapMode: "none", width: "100%" }, spans)
  })
  // A missing key has no action, so the fix hint gets the row right under the
  // title. It is plain text: there is nothing to click.
  const hint =
    rows.hint === undefined
      ? []
      : [
          element("text", {
            content: rows.hint,
            fg: theme.text.muted,
            wrapMode: "none",
            width: "100%",
          }),
        ]

  const root = element("box", { flexDirection: "column", flexShrink: 0, width: "100%" }, [
    titleRow,
    ...(actionRow === undefined ? [] : [actionRow]),
    ...hint,
    ...body,
  ])

  // createElement returns a renderable; the slot API is typed with Solid's
  // DOM-flavoured JSX.Element. This is the one boundary between the two.
  return root as unknown as JSX.Element
}
