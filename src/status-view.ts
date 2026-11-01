// Pure view model for the sidebar card. No renderer, no runtime dependency:
// the card and the tests both derive their text from here.
import type { SearchStatus } from "./rpc.ts"

export interface SidebarInput {
  readonly status: SearchStatus | undefined
  readonly error: string | undefined
  /** Columns available for a free-form error row. Defaults to the TUI sidebar width. */
  readonly maxColumns?: number
}

export interface SidebarRows {
  /** State headline, e.g. `DeepSeek 搜索 · 已启用`. */
  readonly title: string
  /** The action, not the state, e.g. `点击停用（交还原生搜索）`. */
  readonly action: string
  /** Whether a click on `action` really performs it (some states have no action). */
  readonly clickable: boolean
  /** Body rows: the three labelled usage rows, or the short error reason. */
  readonly lines: readonly string[]
  /** Drives the state color in card.ts. */
  readonly tone: "on" | "off" | "warn" | "error" | "idle"
}

const NAME = "DeepSeek 搜索"
// One body row has a full line of its own; leave a little room for the host's
// sidebar padding at the narrowest width. Callers with more room (the desktop
// panel wraps instead of clipping) pass their own limit.
const MAX_MESSAGE_COLUMNS = 24

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

/** One body line, never wrapped: clip a free-form error to the available columns. */
function shortMessage(message: string, maxColumns: number): string {
  const text = message.replace(/\s+/g, " ").trim()
  if (!text) return "读取失败"
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

export function sidebarRows(input: SidebarInput): SidebarRows {
  const { status, error } = input
  const lines =
    status === undefined
      ? []
      : [`今日 ${status.today}`, `本月 ${status.month}`, `累计 ${status.total}`]

  // No status yet: the body has no numbers to show, only the reason (or that
  // the first read is still in flight).
  if (status === undefined) {
    return error === undefined || error.trim() === ""
      ? { title: `${NAME} · 正在读取…`, action: "点击重试", clickable: true, lines, tone: "idle" }
      : {
          title: `${NAME} · 读取失败`,
          action: "点击重试",
          clickable: true,
          lines: [shortMessage(error, input.maxColumns ?? MAX_MESSAGE_COLUMNS)],
          tone: "error",
        }
  }

  if (status.patched && status.hasKey) {
    return {
      title: `${NAME} · 已启用`,
      action: "点击停用（交还原生搜索）",
      clickable: true,
      lines,
      tone: "on",
    }
  }
  if (!status.patched && status.mode === "deepseek") {
    // DeepSeek was requested but the built-in tool was not found: nothing is
    // actually taken over, so the only honest action is to release the mode.
    return {
      title: `${NAME} · 未接管内置 websearch`,
      action: "点击交还原生搜索",
      clickable: true,
      lines,
      tone: "warn",
    }
  }
  if (status.mode === "native") {
    return {
      title: `${NAME} · 已停用`,
      action: "点击启用（由 DeepSeek 接管）",
      clickable: true,
      lines,
      tone: "off",
    }
  }
  // A missing key is not something a click can fix, so the row states the fix
  // instead of pretending to be an action.
  return {
    title: `${NAME} · 未配置 API Key`,
    action: "设置 DEEPSEEK_API_KEY 后重启",
    clickable: false,
    lines,
    tone: "error",
  }
}
