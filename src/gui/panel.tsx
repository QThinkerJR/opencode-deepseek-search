// The desktop side-panel tab: the same states and copy as the TUI card
// (status-view.ts), composed for a resizable panel instead of a terminal column.
import type { JSX } from "solid-js"
import { For, Show, createMemo, onCleanup, onMount } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import { t, type Key } from "../i18n/index.ts"
import type { BalanceStatus, Language, SearchStatus } from "../rpc.ts"
import { CURRENCY_SYMBOL, sidebarRows, type SidebarRows } from "../status-view.ts"

export interface DeepSeekPanelProps {
  readonly status: SearchStatus | undefined
  readonly error: string | undefined
  readonly busy: boolean
  readonly onToggle: () => void
  /**
   * `force` re-probes the server's balance cache; only a user action (the
   * refresh button) may set it. The 10s poll timer calls it bare, so the
   * automatic path keeps sending `{}` and never bypasses the server TTL.
   */
  readonly onRefresh: (force?: boolean) => void
}

type Tone = SidebarRows["tone"]

/** Text-presentation symbols, never emoji. */
const GLYPH: Readonly<Record<Tone, string>> = { on: "●", off: "○", warn: "◐", error: "!", idle: "…" }

/**
 * No theme tokens exist on the desktop side, so the tone is a minimal palette
 * per mode; text and rules otherwise inherit the host's color.
 */
const INK = {
  dark: { on: "#63d19a", warn: "#e0ad4f", error: "#ee7b74", off: "#8b9198", idle: "#8b9198", rule: "rgba(255,255,255,0.14)" },
  light: { on: "#1e7a4c", warn: "#8a5f08", error: "#b03931", off: "#6b7076", idle: "#6b7076", rule: "rgba(0,0,0,0.13)" },
} as const

const LABEL_KEY: Readonly<Record<Tone, Key>> = {
  on: "panel.label.on", off: "panel.label.off",
  warn: "panel.label.warn", error: "panel.label.error", idle: "panel.label.idle",
}

const ICON = { on: "arrow-undo-down", off: "globe", warn: "arrow-undo-down", error: "refresh", idle: "refresh" } as const

/** The product name is chrome; the state after ` · ` is the message. */
function headline(title: string, accent: string): JSX.Element {
  const at = title.indexOf(" · ")
  if (at < 0) return <span style={{ color: accent }}>{title}</span>
  return (
    <>
      <span style={{ opacity: 0.6, "font-weight": 400 }}>{title.slice(0, at)}</span>
      <span style={{ opacity: 0.3, "font-weight": 400 }}>{" · "}</span>
      <span style={{ color: accent }}>{title.slice(at + 3)}</span>
    </>
  )
}

/** `今日 搜索 3 · 抓取 5 · …` → its label and ` · ` chunks, so values wrap as whole stats. */
function splitLine(line: string): { readonly label: string; readonly chunks: readonly string[] } {
  const at = line.indexOf(" ")
  return at < 0 ? { label: line, chunks: [] } : { label: line.slice(0, at), chunks: line.slice(at + 1).split(" · ") }
}

/** The fix-it row: the env var name is an identifier, so give it the mono font. */
function help(action: string, mono: string): JSX.Element {
  const key = "DEEPSEEK_API_KEY"
  const at = action.indexOf(key)
  if (at < 0) return <>{action}</>
  return (
    <>
      {action.slice(0, at)}<code style={{ "font-family": mono, "font-size": "0.94em" }}>{key}</code>{action.slice(at + key.length)}
    </>
  )
}

/**
 * The balance tooltip carries the granted/topped-up split, because those are the
 * two numbers behind the total. It is skipped when only one component is
 * non-zero: there it would just restate the total. The currency code rides
 * along only for USD, whose `$` needs no introduction.
 */
function balanceTip(balance: BalanceStatus, language: Language): string | undefined {
  const hasGranted = Number.parseFloat(balance.grantedBalance) > 0
  const hasTopped = Number.parseFloat(balance.toppedUpBalance) > 0
  if (!hasGranted || !hasTopped) return undefined
  const text = t(language, "balance.breakdown", { granted: balance.grantedBalance, topped: balance.toppedUpBalance })
  return balance.currency === "USD" ? `${text} (USD)` : text
}

export function DeepSeekPanel(props: DeepSeekPanelProps): JSX.Element {
  const ctx = usePlugin()
  // The desktop plugin has no forced locale: the server resolves one and carries
  // it in `status`. The first frame has no status and renders the loader, so the
  // fallback only ever shows that.
  const language = () => props.status?.language ?? "en"
  const rows = createMemo(() => sidebarRows({ status: props.status, error: props.error, maxColumns: Infinity, language: language() }))
  const ink = createMemo(() => INK[ctx.appearance.mode()])
  const mono = () => ctx.appearance.font("mono")

  /**
   * The account block mirrors the view model's own emit condition (enabled or
   * native mode), so `rows().lines[0]` is the balance row exactly when this is
   * defined and the usage table must skip it. The block renders from the
   * structured payload, not from re-parsing the line.
   */
  const balance = createMemo<BalanceStatus | undefined>(() => {
    const account = props.status?.balance
    if (account === undefined || (rows().tone !== "on" && rows().tone !== "off")) return undefined
    return account
  })

  // Cross-half `changed` delivery is the one runtime behaviour this repo cannot
  // verify, so the panel rereads on its own timer while it is mounted — the same
  // fallback the TUI sidebar uses.
  onMount(() => {
    const timer = setInterval(() => props.onRefresh(), 10_000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <div
      aria-busy={props.busy || undefined}
      style={{
        display: "flex", "flex-direction": "column", height: "100%", "min-width": 0,
        "box-sizing": "border-box", padding: "16px 16px 24px", "overflow-y": "auto", "overflow-x": "hidden",
      }}
    >
      <header style={{ display: "flex", "align-items": "flex-start", gap: "8px" }}>
        <span aria-hidden="true" style={{ "flex-shrink": 0, "font-size": "12px", "line-height": "20px", width: "12px", "text-align": "center", "font-weight": 700, color: ink()[rows().tone] }}>
          {GLYPH[rows().tone]}
        </span>
        <h2 aria-live="polite" style={{ flex: 1, "min-width": 0, margin: 0, "font-size": "13px", "font-weight": 600, "line-height": "20px", "overflow-wrap": "anywhere" }}>
          {headline(rows().title, ink()[rows().tone])}
        </h2>
        <ctx.ui.Tooltip value={t(language(), "panel.tooltip.refresh")} placement="bottom">
          <ctx.ui.IconButton icon="refresh" label={t(language(), "panel.tooltip.refresh")} size="small" onClick={() => props.onRefresh(true)} />
        </ctx.ui.Tooltip>
      </header>

      {props.status === undefined ? (
        rows().lines.length > 0 ? (
          <p style={{ margin: "14px 0 0", "font-size": "12px", "line-height": 1.6, opacity: 0.7, "overflow-wrap": "anywhere" }}>{rows().lines[0]}</p>
        ) : (
          <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-top": "14px", opacity: 0.7 }}>
            <ctx.ui.Loader size="small" />
            <span style={{ "font-size": "12px" }}>{t(language(), "panel.loading")}</span>
          </div>
        )
      ) : (
        <dl style={{ margin: "16px 0 0", "border-top": `1px solid ${ink().rule}`, "border-bottom": `1px solid ${ink().rule}` }}>
          {/* The account block leads the table: the balance is authoritative and
              the usage rows below are local estimates, so they read as two
              blocks separated by a little more air. */}
          <Show when={balance()} keyed>
            {(account) => {
              const label = t(language(), "balance.label")
              const tip = balanceTip(account, language())
              const amount = (
                <dd style={{
                  margin: 0, "margin-left": "auto", "font-family": mono(), "font-size": "14px", "line-height": "1.55",
                  "font-variant-numeric": "tabular-nums", "text-align": "right", "font-weight": 500, "flex-shrink": 0,
                  color: account.isAvailable ? undefined : ink().warn,
                }}>
                  {CURRENCY_SYMBOL[account.currency] ?? ""}{account.totalBalance}
                </dd>
              )
              return (
                <div style={{ display: "flex", "align-items": "baseline", gap: "12px", padding: "4px 0 10px" }}>
                  <dt style={{ "flex-shrink": 0, "font-size": "11px", "letter-spacing": /^[\x20-\x7E]+$/.test(label) ? "0.08em" : undefined, "line-height": "1.9", opacity: 0.62 }}>
                    {label}
                  </dt>
                  {tip !== undefined ? (
                    <ctx.ui.Tooltip value={tip} placement="bottom">{amount}</ctx.ui.Tooltip>
                  ) : (
                    amount
                  )}
                </div>
              )
            }}
          </Show>
          <For each={balance() !== undefined ? rows().lines.slice(1) : rows().lines}>
            {(line, index) => {
              const parts = splitLine(line)
              return (
                <div style={{ display: "flex", "align-items": "baseline", gap: "12px", padding: "10px 0", "border-top": index() > 0 ? `1px solid ${ink().rule}` : undefined }}>
                  <dt style={{ "flex-shrink": 0, "font-size": "11px", "letter-spacing": /^[\x20-\x7E]+$/.test(parts.label) ? "0.08em" : undefined, "line-height": "1.9", opacity: 0.62 }}>
                    {parts.label}
                  </dt>
                  <dd style={{
                    margin: 0, "margin-left": "auto", "min-width": 0, display: "flex", "flex-wrap": "wrap", "justify-content": "flex-end",
                    "column-gap": "10px", "row-gap": "2px", "font-family": mono(), "font-size": "13px", "line-height": "1.55",
                    "font-variant-numeric": "tabular-nums", "text-align": "right",
                  }}>
                    <For each={parts.chunks}>
                      {(chunk) => {
                        // A money chunk must never wrap apart from its digits, and
                        // it is the only chunk that reads at full weight.
                        const money = /^[¥$]/.test(chunk)
                        return (
                          <span style={{ "min-width": 0, "overflow-wrap": "anywhere", "font-weight": money ? 500 : 400, opacity: money ? 1 : 0.8, "flex-shrink": money ? 0 : undefined }}>
                            {chunk}
                          </span>
                        )
                      }}
                    </For>
                  </dd>
                </div>
              )
            }}
          </For>
        </dl>
      )}

      <Show when={!rows().clickable}>
        <p style={{ margin: "16px 0 0", "font-size": "12px", "line-height": 1.6, opacity: 0.68, "overflow-wrap": "anywhere" }}>{help(rows().action, mono())}</p>
      </Show>
      <Show when={rows().clickable && rows().tone !== "idle"}>
        <div style={{ "margin-top": "18px" }}>
          <ctx.ui.Button variant={rows().tone === "off" || rows().tone === "error" ? "contrast" : "neutral"} icon={ICON[rows().tone]} disabled={props.busy} busy={props.busy} onClick={props.onToggle}>
            {t(language(), LABEL_KEY[rows().tone])}
          </ctx.ui.Button>
        </div>
      </Show>
    </div>
  )
}
