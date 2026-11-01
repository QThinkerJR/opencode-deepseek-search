// The `sidebar.content` card: no frame of its own (the host sidebar already has
// one), one column, full width, and only the last row is interactive.
import type { JSX } from "@opentui/solid"
import type { ResolvedTheme } from "@opencode/theme/tui"
import { createElement, insert, setProp } from "@opentui/solid"
import type { SearchStatus } from "../rpc.ts"
import { sidebarRows } from "../status-view.ts"
import type { SidebarRows } from "../status-view.ts"

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
  readonly theme: ResolvedTheme
  readonly onToggle: () => void
}): JSX.Element {
  const rows = sidebarRows({ status: input.status, error: input.error })
  const theme = input.theme
  const state = toneColor(theme, rows.tone)

  // A usage line is ~40 columns including its label, so it cannot stay on one
  // line in a narrow sidebar. Break only at the existing ` · ` boundaries so
  // each number stays next to its label instead of splitting `空/失 0`. A short
  // error row has no separator and passes through as a single chunk.
  const body = rows.lines.map((line) => {
    const at = line.indexOf(" ")
    const head = at < 0 ? "" : line.slice(0, at + 1)
    const parts = (at < 0 ? line : line.slice(at + 1)).split(" · ")
    const chunks = [`${head}${parts[0] ?? ""}`, ...parts.slice(1).map((part) => ` · ${part}`)]
    return element(
      "box",
      { flexDirection: "row", flexWrap: "wrap", width: "100%" },
      chunks.map((chunk) =>
        element("text", { content: chunk, fg: theme.text.muted, flexShrink: 0 }),
      ),
    )
  })

  const root = element("box", { flexDirection: "column", flexShrink: 0, width: "100%", marginTop: 1 }, [
    // The tone colors only the glyph: the state is already spelled out, and a
    // fully tinted headline would shout inside someone else's sidebar.
    element("text", { selectable: false, wrapMode: "word", width: "100%" }, [
      element("span", { style: { fg: state } }, [`${GLYPH[rows.tone]} `]),
      element("span", { style: { fg: theme.text.base } }, [rows.title]),
    ]),
    ...body,
    // The affordance is a muted glyph plus label, not a fake button. One blank
    // row keeps it from reading as a fourth stat. States with nothing to do
    // (a missing key) render the same row without a handler.
    element(
      "text",
      {
        selectable: false,
        wrapMode: "word",
        width: "100%",
        marginTop: 1,
        onMouseUp: rows.clickable
          ? (event: { preventDefault(): void }) => {
              event.preventDefault()
              input.onToggle()
            }
          : undefined,
      },
      [
        element("span", { style: { fg: theme.text.faint } }, ["› "]),
        element("span", { style: { fg: theme.text.muted } }, [rows.action]),
      ],
    ),
  ])

  // createElement returns a renderable; the slot API is typed with Solid's
  // DOM-flavoured JSX.Element. This is the one boundary between the two.
  return root as unknown as JSX.Element
}
