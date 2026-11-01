// RPC contract shared by the server plugin (handler side) and the TUI / desktop
// sidebars (client side).
//
// Type-only imports only: this module must stay loadable from all three
// runtimes (Node type-stripping for the server and the TUI, a CJS bundle for
// the desktop app), so it carries no runtime dependency.
//
// The schemas are plain JSON Schema, so `Rpc.Input` / `Rpc.Output` degrade to
// `unknown` on the client. `readStatus` / `readModeResult` narrow that back
// defensively, in the style of `parseLedger` (src/usage.ts).

import type { Rpc } from "@opencode/plugin/rpc"

export const DEEPSEEK_RPC_ID = "deepseek-search"

export const DeepSeekRpc = {
  id: DEEPSEEK_RPC_ID,
  methods: {
    status: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["deepseek", "native"] },
          source: { type: "string", enum: ["override", "config"] },
          patched: { type: "boolean" },
          hasKey: { type: "boolean" },
          pricePerThousand: { type: "number" },
          today: { type: "string" },
          month: { type: "string" },
          total: { type: "string" },
        },
        required: ["mode", "source", "patched", "hasKey", "pricePerThousand", "today", "month", "total"],
        additionalProperties: false,
      },
    },
    setMode: {
      input: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["deepseek", "native", "config"] },
        },
        required: ["mode"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          mode: { type: "string" },
          message: { type: "string" },
        },
        required: ["ok", "mode", "message"],
        additionalProperties: false,
      },
    },
  },
  events: {
    // Emitted after the ledger or the mode changes.
    changed: { schema: { type: "object" as const, properties: {} } },
  },
} satisfies Rpc.PortableDefinition

export interface SearchStatus {
  mode: "deepseek" | "native"
  source: "override" | "config"
  patched: boolean
  hasKey: boolean
  pricePerThousand: number
  today: string
  month: string
  total: string
}

export interface ModeSwitchResult {
  ok: boolean
  mode: string
  message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isMode(value: unknown): value is SearchStatus["mode"] {
  return value === "deepseek" || value === "native"
}

/** Defensive read of an RPC `status` result. Never throws. */
export function readStatus(raw: unknown): SearchStatus | undefined {
  if (!isRecord(raw)) return undefined
  const { mode, source, patched, hasKey, pricePerThousand, today, month, total } = raw
  if (!isMode(mode)) return undefined
  if (source !== "override" && source !== "config") return undefined
  if (typeof patched !== "boolean" || typeof hasKey !== "boolean") return undefined
  if (typeof pricePerThousand !== "number" || !Number.isFinite(pricePerThousand)) return undefined
  if (typeof today !== "string" || typeof month !== "string" || typeof total !== "string") return undefined
  return { mode, source, patched, hasKey, pricePerThousand, today, month, total }
}

/** Defensive read of an RPC `setMode` result. Never throws. */
export function readModeResult(raw: unknown): ModeSwitchResult | undefined {
  if (!isRecord(raw)) return undefined
  const { ok, mode, message } = raw
  if (typeof ok !== "boolean" || typeof mode !== "string" || typeof message !== "string") return undefined
  return { ok, mode, message }
}
