import assert from "node:assert/strict"
import { test } from "node:test"
import {
  MAX_QUERY_CHARS,
  MAX_URL_CHARS,
  NO_RESULTS,
  buildSearchBody,
  formatSearchResults,
  httpError,
  mapBalance,
  mapFetchResponse,
  mapSearchResults,
  validateQuery,
  validateUrl,
} from "../src/deepseek.ts"

test("mapSearchResults prefers summary and never exposes full page content", () => {
  const [first] = mapSearchResults({
    results: [
      {
        url: "https://example.com/a",
        title: "Title A",
        snippet: "short",
        summary: "long summary",
        content: "FULL PAGE TEXT THAT MUST NOT LEAK",
        date: "2026-06-01T00:00:00+00:00",
      },
    ],
  })
  assert.equal(first?.content, "long summary")
  assert.equal(first?.title, "Title A")
  assert.equal(first?.time.published, Date.parse("2026-06-01T00:00:00+00:00"))
})

test("mapSearchResults falls back to snippet, then to no content", () => {
  const [a, b] = mapSearchResults({
    results: [
      { url: "https://example.com/a", snippet: "short" },
      { url: "https://example.com/b", snippet: "", summary: "" },
    ],
  })
  assert.equal(a?.content, "short")
  assert.equal(b?.content, undefined)
})

test("mapSearchResults skips rows without a usable url and survives junk input", () => {
  assert.deepEqual(mapSearchResults({ results: [{ title: "no url" }, { url: "" }, null, 42] }), [])
  assert.deepEqual(mapSearchResults({}), [])
  assert.deepEqual(mapSearchResults(null), [])
  assert.deepEqual(mapSearchResults({ results: "nope" }), [])
})

test("mapSearchResults leaves time empty when the date is missing or invalid", () => {
  const [row] = mapSearchResults({ results: [{ url: "https://example.com/x", date: "not a date" }] })
  assert.deepEqual(row?.time, {})
})

test("buildSearchBody never asks for full page content", () => {
  assert.deepEqual(buildSearchBody("q", 5), { query: "q", count: 5 })
})

test("mapFetchResponse assembles markdown and marks truncation", () => {
  const short = mapFetchResponse({ title: "Example", content: "hello" }, "https://example.com", 100, "zh-CN")
  assert.equal(short.markdown, "# Example\n来源: https://example.com\n\nhello")
  assert.equal(short.truncated, false)
  assert.equal(short.empty, false)
  assert.equal(short.chars, 5)

  const long = mapFetchResponse({ title: "", content: "x".repeat(50) }, "https://example.com", 10, "zh-CN")
  assert.equal(long.truncated, true)
  assert.equal(long.chars, 50)
  assert.match(long.markdown, /^# https:\/\/example\.com/)
  assert.match(long.markdown, /\[DeepSeek Fetch 截断提示\] 原文共 50 字符，超出上限 10/)
})

test("mapFetchResponse treats an empty body as empty", () => {
  const empty = mapFetchResponse({}, "https://example.com", 100, "zh-CN")
  assert.equal(empty.empty, true)
  assert.equal(empty.truncated, false)
})

test("validateUrl accepts normal http(s) urls", () => {
  assert.equal(validateUrl("https://example.com/a?b=1", "zh-CN"), undefined)
  assert.equal(validateUrl("http://localhost:3000", "zh-CN"), undefined)
})

test("validateUrl rejects non-http, userinfo, oversized and unparsable input", () => {
  assert.match(validateUrl("ftp://example.com", "zh-CN") ?? "", /仅支持 http\/https/)
  assert.match(validateUrl("example.com", "zh-CN") ?? "", /仅支持 http\/https/)
  assert.match(validateUrl("https://user:pass@example.com", "zh-CN") ?? "", /userinfo/)
  assert.match(validateUrl(`https://example.com/${"a".repeat(MAX_URL_CHARS)}`, "zh-CN") ?? "", /URL 过长/)
  assert.match(validateUrl("https://", "zh-CN") ?? "", /无法解析 URL/)
})

test("validateQuery enforces 1..128 characters", () => {
  assert.equal(validateQuery("open source", "zh-CN"), undefined)
  assert.match(validateQuery("", "zh-CN") ?? "", /搜索词为空/)
  assert.match(validateQuery("a".repeat(MAX_QUERY_CHARS + 1), "zh-CN") ?? "", /搜索词过长/)
})

test("formatSearchResults matches the built-in tool rendering", () => {
  assert.equal(formatSearchResults([]), NO_RESULTS)
  const text = formatSearchResults([
    { url: "https://a.example", title: "A", content: "summary A", time: { published: 1_793_000_000_000 } },
    { url: "https://b.example", time: {} },
  ])
  assert.equal(
    text,
    "## [A](https://a.example)\nPublished: 2026-10-26T07:33:20.000Z\n\nsummary A\n\n## [https://b.example](https://b.example)",
  )
})

test("httpError maps billing-sensitive statuses to actionable Chinese messages", () => {
  assert.match(httpError(401, "", false, "zh-CN").message, /API Key 无效/)
  assert.match(httpError(402, "", false, "zh-CN").message, /余额不足/)
  assert.match(httpError(403, "", true, "zh-CN").message, /webfetch/)
  assert.match(httpError(404, "", true, "zh-CN").message, /无法提取/)
  assert.match(httpError(429, "", false, "zh-CN").message, /限速/)
  assert.match(httpError(500, "", false, "zh-CN").message, /服务端错误/)
})

test("httpError surfaces the upstream message when the body carries one", () => {
  const body = JSON.stringify({ error: { message: "'count' must be between 1 and 50" } })
  assert.match(httpError(400, body, false, "zh-CN").message, /'count' must be between 1 and 50/)
  // A non-JSON body must not break error construction.
  assert.match(httpError(400, "<html>oops</html>", false, "zh-CN").message, /请求参数无效/)
})

test("httpError localizes the copy and the upstream separator", () => {
  assert.match(httpError(401, "", false, "en").message, /DEEPSEEK_API_KEY/)
  assert.match(httpError(401, "", false, "en").message, /Invalid DeepSeek API key \(401\)/)
  assert.match(httpError(402, "", false, "ja").message, /残高が不足/)
  assert.match(httpError(403, "", true, "en").message, /webfetch/)
  // English keeps ": ", Chinese and Japanese keep the full-width colon.
  const body = JSON.stringify({ error: { message: "boom" } })
  assert.match(httpError(400, body, false, "en").message, /\(400\): boom/)
  assert.match(httpError(400, body, false, "zh-CN").message, /（400）：boom/)
  assert.match(httpError(400, body, false, "ja").message, /（400）：boom/)
})

test("validators render in English and Japanese", () => {
  assert.match(validateQuery("", "en") ?? "", /Empty query/)
  assert.match(validateUrl("ftp://example.com", "en") ?? "", /only supports absolute http\/https/)
  const ja = validateQuery("", "ja") ?? ""
  assert.ok(ja.length > 0)
  assert.notEqual(ja, validateQuery("", "zh-CN"))
  assert.match(validateUrl("https://user:pass@example.com", "ja") ?? "", /userinfo/)
})

test("mapFetchResponse localizes the truncation notice", () => {
  const en = mapFetchResponse({ content: "x".repeat(50) }, "https://example.com", 10, "en")
  assert.match(en.markdown, /\[DeepSeek Fetch truncated\]/)
  const ja = mapFetchResponse({ content: "x".repeat(50) }, "https://example.com", 10, "ja")
  assert.match(ja.markdown, /\[DeepSeek Fetch 切り詰め\]/)
})

test("mapBalance prefers the CNY entry over other currencies", () => {
  const balance = mapBalance({
    is_available: true,
    balance_infos: [
      { currency: "USD", total_balance: "15.00", granted_balance: "5.00", topped_up_balance: "10.00" },
      { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    ],
  })
  assert.deepEqual(balance, {
    isAvailable: true,
    currency: "CNY",
    totalBalance: "110.00",
    grantedBalance: "10.00",
    toppedUpBalance: "100.00",
  })
})

test("mapBalance falls back to the first entry when no CNY entry exists", () => {
  const balance = mapBalance({
    is_available: false,
    balance_infos: [
      { currency: "USD", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" },
      { currency: "EUR", total_balance: "1.00", granted_balance: "1.00", topped_up_balance: "1.00" },
    ],
  })
  assert.equal(balance?.currency, "USD")
  assert.equal(balance?.isAvailable, false)
})

test("mapBalance returns undefined for a missing or non-boolean is_available", () => {
  const infos = [{ currency: "CNY", total_balance: "1", granted_balance: "1", topped_up_balance: "0" }]
  assert.equal(mapBalance({ balance_infos: infos }), undefined)
  assert.equal(mapBalance({ is_available: "true", balance_infos: infos }), undefined)
})

test("mapBalance returns undefined without a usable balance_infos list", () => {
  assert.equal(mapBalance({ is_available: true, balance_infos: [] }), undefined)
  assert.equal(mapBalance({ is_available: true, balance_infos: "CNY" }), undefined)
  assert.equal(mapBalance({ is_available: true }), undefined)
  assert.equal(mapBalance(null), undefined)
})

test("mapBalance returns undefined when a balance field is not a non-empty string", () => {
  const build = (total: unknown) => ({
    is_available: true,
    balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "1.00", topped_up_balance: "2.00" }],
  })
  assert.equal(mapBalance(build(110)), undefined)
  assert.equal(mapBalance(build("")), undefined)
  assert.equal(mapBalance(build(undefined)), undefined)
})

test("mapBalance returns undefined for an unsupported currency", () => {
  const balance = mapBalance({
    is_available: true,
    balance_infos: [{ currency: "EUR", total_balance: "1.00", granted_balance: "1.00", topped_up_balance: "0.00" }],
  })
  assert.equal(balance, undefined)
})
