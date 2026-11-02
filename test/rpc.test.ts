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
  language: "zh-CN",
}

const COUNTS = { search: 3, fetch: 2, empty: 1, failed: 1, costMicro: 25_000 }
const WITH_COUNTS = { ...STATUS, counts: { today: COUNTS, month: COUNTS, total: COUNTS } }

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

test("readStatus falls back to English when language is missing or invalid", () => {
  const { language: _ignored, ...withoutLanguage } = STATUS
  assert.deepEqual(readStatus(withoutLanguage), { ...withoutLanguage, language: "en" })
  for (const language of ["ja-JP", "zh", 42, null] as unknown[]) {
    assert.deepEqual(
      readStatus({ ...STATUS, language }),
      { ...STATUS, language: "en" },
      `language ${String(language)} falls back without losing the payload`,
    )
  }
})

test("readStatus passes every valid language through", () => {
  for (const language of ["en", "ja", "zh-CN"] as const) {
    assert.equal(readStatus({ ...STATUS, language })?.language, language)
  }
})

test("status output schema carries optional structured counts", () => {
  const schema = DeepSeekRpc.methods.status.output
  const counts = (schema.properties as Record<string, any>).counts
  assert.equal(counts.type, "object")
  assert.equal(counts.additionalProperties, false)
  assert.deepEqual(counts.required, ["today", "month", "total"])
  assert.equal((schema.required as readonly string[]).includes("counts"), false)
  for (const period of ["today", "month", "total"]) {
    const bucket = counts.properties[period]
    assert.deepEqual(bucket.required, ["search", "fetch", "empty", "failed", "costMicro"])
    assert.equal(bucket.additionalProperties, false)
    for (const field of bucket.required) assert.equal(bucket.properties[field].type, "integer")
  }
})

test("status output schema carries language as an optional field", () => {
  const schema = DeepSeekRpc.methods.status.output
  const language = (schema.properties as Record<string, any>).language
  assert.equal(language.type, "string")
  assert.deepEqual(language.enum, ["en", "ja", "zh-CN"])
  // Optional on the wire, like `counts`: a strict `required` would fail every
  // older client whose own schema predates the field.
  assert.equal((schema.required as readonly string[]).includes("language"), false)
})

test("readStatus accepts a payload without counts", () => {
  const status = readStatus(STATUS)
  assert.deepEqual(status, STATUS)
  assert.equal("counts" in (status as object), false)
})

test("readStatus keeps a valid counts triple and drops unknown keys inside it", () => {
  assert.deepEqual(readStatus(WITH_COUNTS), WITH_COUNTS)
  const noisy = {
    ...STATUS,
    counts: {
      today: { ...COUNTS, extra: 1 },
      month: { ...COUNTS, extra: 2 },
      total: { ...COUNTS, extra: 3 },
    },
  }
  assert.deepEqual(readStatus(noisy), WITH_COUNTS)
})

test("readStatus drops a malformed counts triple but keeps the rest", () => {
  const broken: unknown[] = [
    null,
    "counts",
    42,
    {},
    { today: COUNTS, month: COUNTS },
    { today: COUNTS, month: COUNTS, total: { ...COUNTS, search: 1.5 } },
    { today: COUNTS, month: COUNTS, total: { ...COUNTS, costMicro: Number.NaN } },
  ]
  for (const counts of broken) {
    assert.deepEqual(readStatus({ ...STATUS, counts }), STATUS)
  }
})

test("readStatus rejects non-integer and non-finite counters inside counts", () => {
  const badCount = [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY, "3", true, undefined]
  for (const value of badCount) {
    for (const field of ["search", "fetch", "empty", "failed"]) {
      const bucket = { ...COUNTS, [field]: value }
      const raw = { ...STATUS, counts: { today: COUNTS, month: bucket, total: COUNTS } }
      assert.deepEqual(readStatus(raw), STATUS, `${field} = ${String(value)} drops counts`)
    }
  }
  const badCost = [-1, Number.NaN, Number.POSITIVE_INFINITY, "25000", true, undefined]
  for (const value of badCost) {
    const raw = { ...STATUS, counts: { today: COUNTS, month: COUNTS, total: { ...COUNTS, costMicro: value } } }
    assert.deepEqual(readStatus(raw), STATUS, `costMicro = ${String(value)} drops counts`)
  }
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
