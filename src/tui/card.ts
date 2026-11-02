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
  const rows = sidebarRows({
    status: input.status,
    error: input.error,
    maxColumns: cardColumns(input.maxColumns),
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
  const separator = rows.title.indexOf(" · ")
  const titleSpans: Child[] =
    separator < 0
      ? [element("span", { style: { fg: state } }, [rows.title])]
      : [
          element("span", { style: { fg: theme.text.base } }, [rows.title.slice(0, separator)]),
          element("span", { style: { fg: theme.text.faint } }, [" · "]),
          element("span", { style: { fg: state } }, [rows.title.slice(separator + 3)]),
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

  // The model already composed every row to fit the sidebar, so each body row
  // is one text node: the host must never get the chance to wrap it.
  const body = rows.lines.map((line) =>
    element("text", { content: line, fg: theme.text.muted, wrapMode: "none", width: "100%" }),
  )
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
