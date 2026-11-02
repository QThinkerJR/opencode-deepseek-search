// TUI half of the plugin: renders the DeepSeek status card in the session
// sidebar and toggles the search takeover through the shared RPC contract.
//
// No JSX and no build step: the card is a hand-written element tree built from
// `@opentui/solid`'s `createElement` / `setProp` / `insert`, so this file loads
// through Node's type stripping like the server half.

import { Plugin } from "@opencode/plugin/tui"
import { createElement, insert, setProp, type JSX } from "@opentui/solid"
import type { Renderable } from "@opentui/core"
import { createSignal } from "solid-js"
import { DeepSeekRpc, readModeResult, readStatus, type Language, type SearchStatus } from "../rpc.ts"
import { t } from "../i18n/index.ts"
import { sidebarCard } from "./card.ts"

const REFRESH_MS = 10_000
const ERROR_MAX = 80

export default Plugin.define({
  // Must match the server plugin id: slot keys and the RPC id derive from it.
  id: "deepseek-search",
  async setup(ctx) {
    const rpc = ctx.client.rpc(DeepSeekRpc)
    const [status, setStatus] = createSignal<SearchStatus | undefined>()
    const [error, setError] = createSignal<string | undefined>()

    const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX)

    // One language for every string this half renders. Before the first status
    // arrives there is nothing to read it from, so the first frame is English;
    // the reactive card and the host-re-run keymap factory pick up the real one
    // as soon as the server reports it.
    const language = (): Language => status()?.language ?? "en"

    // `status` takes a required first argument: plain JSON Schema degrades the
    // input type to `unknown`, and the host validates the payload against the
    // method's object schema, so an omitted input is rejected as invalid.
    async function refresh() {
      try {
        const next = readStatus(await rpc.status({}))
        if (next) {
          setStatus(next)
          setError(undefined)
        } else {
          setError(t(language(), "toast.statusMalformed"))
        }
      } catch (e) {
        setError(describeError(e))
      }
      ctx.renderer.requestRender()
    }

    async function applyMode(mode: "deepseek" | "native") {
      try {
        const result = readModeResult(await rpc.setMode({ mode }))
        if (!result) ctx.ui.toast.show({ message: t(language(), "toast.modeMalformed"), variant: "error" })
        else if (!result.ok) ctx.ui.toast.show({ message: result.message, variant: "error" })
      } catch (e) {
        ctx.ui.toast.show({ message: describeError(e), variant: "error" })
      } finally {
        // The `changed` event and the timer also refresh; doing it here keeps
        // the card correct even if event delivery is unavailable.
        await refresh()
      }
    }

    // The card labels the action it can really perform: switching the takeover
    // when a status is known, retrying the read when it is not.
    function toggle() {
      const current = status()
      if (!current || error()) {
        void refresh()
        return
      }
      void applyMode(current.mode === "deepseek" ? "native" : "deepseek")
    }

    // Mouse row on the card is the primary switch; this menu is the fallback
    // entry point that always works (keymap command + `/deepseek` slash).
    async function openMenu() {
      const choice = await ctx.ui.dialog.select<"deepseek" | "native" | "refresh">({
        title: t(language(), "dialog.title"),
        options: [
          { title: t(language(), "dialog.enable"), value: "deepseek", description: t(language(), "dialog.enableDesc") },
          { title: t(language(), "dialog.disable"), value: "native", description: t(language(), "dialog.disableDesc") },
          { title: t(language(), "dialog.refresh"), value: "refresh", description: t(language(), "dialog.refreshDesc") },
        ],
        current: status()?.mode,
      })
      if (choice === undefined) return
      if (choice === "refresh") await refresh()
      else await applyMode(choice)
    }

    // The host calls `render` each time it mounts this slot, so it builds a
    // fresh root and lets `insert` own the reactive child that repaints the card
    // when the signals change. A root created once in setup cannot be mounted
    // by a second render call (the published plugins build per call too).
    // The sidebar's real column count decides whether the card can show the
    // wordy usage rows; the host only reports it after layout, so the first
    // render falls back to the model's own budget and this repaints on resize.
    const [width, setWidth] = createSignal(0)
    const disposeSlot = ctx.ui.slot({
      append: "sidebar.content",
      render: () => {
        // `createElement` is typed as the base class; the laid-out node is a
        // Renderable, whose `width` is what the card needs. One cast here.
        const root = createElement("box") as unknown as Renderable
        setProp(root, "width", "100%")
        setProp(root, "flexDirection", "column")
        setProp(root, "onSizeChange", () => setWidth(root.width))
        insert(root, () =>
          sidebarCard({
            status: status(),
            error: error(),
            language: language(),
            theme: ctx.theme,
            onToggle: toggle,
            maxColumns: width(),
          }),
        )
        // `render` is declared to return JSX.Element while the tree here is a
        // hand-built renderable: cast once, at the single boundary.
        return root as unknown as JSX.Element
      },
    })

    ctx.keymap.layer(() => ({
      commands: [
        {
          id: "deepseek-search.toggle",
          title: t(language(), "command.toggle"),
          slash: { name: "deepseek" },
          run: () => void openMenu(),
        },
      ],
    }))

    // `changed` is the primary refresh path; the timer is the fallback because
    // cross-half event delivery cannot be verified inside this repository.
    const off = rpc.events.on("changed", () => void refresh())
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    void refresh()

    return () => {
      disposeSlot()
      off()
      clearInterval(timer)
    }
  },
})
