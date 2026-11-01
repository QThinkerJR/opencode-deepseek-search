// Desktop half of the plugin: a DeepSeek tab in a session's side region, plus a
// command that opens it.
//
// It reaches the server half only through the shared RPC contract, so the
// numbers and the switch match the TUI sidebar. The host loads it from the
// prebuilt CommonJS bundle `gui-experimental.cjs` (see vite.config.ts).

import { Command, Panel, Plugin, type PanelTab } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { DeepSeekRpc, readModeResult, readStatus, type SearchStatus } from "../rpc.ts"
import { DeepSeekPanel } from "./panel.tsx"

// `Panel.list` must return the same tab object while it is unchanged: a new
// object renders the tab label again.
const TAB: PanelTab = { id: "main", title: "DeepSeek" }

const ERROR_MAX = 80

export default Plugin.define({
  setup(ctx) {
    const rpc = ctx.client.rpc(DeepSeekRpc)
    const [status, setStatus] = createSignal<SearchStatus | undefined>()
    const [error, setError] = createSignal<string | undefined>()
    const [busy, setBusy] = createSignal(false)

    const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX)

    // `status` takes a required first argument: plain JSON Schema degrades the
    // input type to `unknown`, so it must be passed explicitly.
    async function refresh() {
      try {
        const next = readStatus(await rpc.status(undefined))
        if (next) {
          setStatus(next)
          setError(undefined)
        } else {
          setError("状态数据格式不符")
        }
      } catch (e) {
        setError(describeError(e))
      }
    }

    async function applyMode(next: "deepseek" | "native") {
      setBusy(true)
      try {
        const result = readModeResult(await rpc.setMode({ mode: next }))
        if (!result) ctx.toast.show({ title: "DeepSeek", description: "模式切换结果格式不符", variant: "error" })
        else if (!result.ok) ctx.toast.show({ title: "DeepSeek", description: result.message, variant: "error" })
      } catch (e) {
        ctx.toast.show({ title: "DeepSeek", description: describeError(e), variant: "error" })
      } finally {
        await refresh()
        setBusy(false)
      }
    }

    // Mirrors the TUI card: no status or a stale error rereads, otherwise
    // switch. A missing key still allows releasing the takeover (the shared
    // model hides the button only where there is genuinely nothing to do).
    function toggle() {
      const current = status()
      if (!current || error()) {
        void refresh()
        return
      }
      void applyMode(current.mode === "deepseek" ? "native" : "deepseek")
    }

    ctx.add(Panel, {
      id: "main",
      region: "side",
      mobile: { title: "DeepSeek", order: 50, kind: "menu", icon: "globe" },
      list: (input) => (input.open.includes(TAB.id) ? [TAB] : []),
      render: () => (
        <DeepSeekPanel
          status={status()}
          error={error()}
          busy={busy()}
          onToggle={toggle}
          onRefresh={() => void refresh()}
        />
      ),
    })

    ctx.add(Command, {
      id: "open",
      title: "DeepSeek: 打开统计面板",
      run: () => {
        const session = ctx.sessions.current()
        if (!session) {
          ctx.toast.show({ title: "DeepSeek", description: "请先打开一个会话" })
          return
        }
        ctx.layout.open(`${ctx.id}:main`, session)
      },
    })

    // The `changed` event is the primary refresh path; a panel that mounts
    // later renders the latest signals, and its refresh button rereads.
    const off = rpc.events.on("changed", () => void refresh())
    void refresh()

    return off
  },
})
