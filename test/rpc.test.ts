import assert from "node:assert/strict"
import { test } from "node:test"
import { DEEPSEEK_RPC_ID, DeepSeekRpc, readModeResult, readStatus } from "../src/rpc.ts"

const STATUS = {
  mode: "deepseek",
  source: "override",
  patched: true,
  hasKey: true,
  pricePerThousand: 5,
  today: "搜索 0 · 抓取 1 · 空/失 0 · ¥0.0050",
  month: "搜索 1 · 抓取 2 · 空/失 2 · ¥0.0150",
  total: "搜索 3 · 抓取 2 · 空/失 2 · ¥0.0250",
}

test("contract exposes the agreed id, methods and changed event", () => {
  assert.equal(DEEPSEEK_RPC_ID, "deepseek-search")
  assert.equal(DeepSeekRpc.id, DEEPSEEK_RPC_ID)
  assert.deepEqual(Object.keys(DeepSeekRpc.methods).sort(), ["setMode", "status"])
  for (const [name, method] of Object.entries(DeepSeekRpc.methods)) {
    for (const [side, schema] of [
      ["input", method.input],
      ["output", method.output],
    ] as const) {
      assert.equal(typeof schema, "object", `${name}.${side} is an object schema`)
      assert.equal(schema.type, "object", `${name}.${side} declares type "object"`)
    }
  }
  const changed = DeepSeekRpc.events.changed.schema
  assert.equal(changed.type, "object")
  assert.equal(typeof changed.properties, "object")
})

test("readStatus rejects non-objects, wrong types and non-finite numbers", () => {
  for (const raw of [undefined, null, "status", 42, true, [], [STATUS]]) {
    assert.equal(readStatus(raw), undefined)
  }
  assert.equal(readStatus({}), undefined)
  assert.equal(readStatus({ ...STATUS, mode: "auto" }), undefined)
  assert.equal(readStatus({ ...STATUS, source: "file" }), undefined)
  assert.equal(readStatus({ ...STATUS, patched: "yes" }), undefined)
  assert.equal(readStatus({ ...STATUS, hasKey: 1 }), undefined)
  assert.equal(readStatus({ ...STATUS, pricePerThousand: "5" }), undefined)
  assert.equal(readStatus({ ...STATUS, pricePerThousand: Number.NaN }), undefined)
  assert.equal(readStatus({ ...STATUS, pricePerThousand: Number.POSITIVE_INFINITY }), undefined)
  assert.equal(readStatus({ ...STATUS, total: 3 }), undefined)
})

test("readStatus returns a clean copy of a valid payload", () => {
  assert.deepEqual(readStatus(STATUS), STATUS)
  const native = { ...STATUS, mode: "native", source: "config" }
  assert.deepEqual(readStatus(native), native)
  // Unknown extra fields are dropped, never propagated to the caller.
  assert.deepEqual(readStatus({ ...STATUS, extra: true }), STATUS)
})

test("readModeResult narrows the switch result", () => {
  const ok = { ok: true, mode: "deepseek", message: "已持久化：重启 OpenCode 后仍为 deepseek。" }
  assert.deepEqual(readModeResult(ok), ok)
  const failed = { ok: false, mode: "native", message: "未找到内置 websearch 工具，无法在运行时切换。" }
  assert.deepEqual(readModeResult(failed), failed)
  for (const raw of [undefined, null, "ok", 0, [], {}]) {
    assert.equal(readModeResult(raw), undefined)
  }
  assert.equal(readModeResult({ ...ok, ok: "true" }), undefined)
  assert.equal(readModeResult({ ...ok, mode: 1 }), undefined)
  assert.equal(readModeResult({ ...ok, message: undefined }), undefined)
})
