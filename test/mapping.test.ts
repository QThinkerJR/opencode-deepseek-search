import assert from "node:assert/strict"
import { test } from "node:test"
import {
  MAX_QUERY_CHARS,
  MAX_URL_CHARS,
  NO_RESULTS,
  buildSearchBody,
  formatSearchResults,
  httpError,
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
  const short = mapFetchResponse({ title: "Example", content: "hello" }, "https://example.com", 100)
  assert.equal(short.markdown, "# Example\n来源: https://example.com\n\nhello")
  assert.equal(short.truncated, false)
  assert.equal(short.empty, false)
  assert.equal(short.chars, 5)

  const long = mapFetchResponse({ title: "", content: "x".repeat(50) }, "https://example.com", 10)
  assert.equal(long.truncated, true)
  assert.equal(long.chars, 50)
  assert.match(long.markdown, /^# https:\/\/example\.com/)
  assert.match(long.markdown, /\[DeepSeek Fetch 截断提示\] 原文共 50 字符，超出上限 10/)
})

test("mapFetchResponse treats an empty body as empty", () => {
  const empty = mapFetchResponse({}, "https://example.com", 100)
  assert.equal(empty.empty, true)
  assert.equal(empty.truncated, false)
})

test("validateUrl accepts normal http(s) urls", () => {
  assert.equal(validateUrl("https://example.com/a?b=1"), undefined)
  assert.equal(validateUrl("http://localhost:3000"), undefined)
})

test("validateUrl rejects non-http, userinfo, oversized and unparsable input", () => {
  assert.match(validateUrl("ftp://example.com") ?? "", /仅支持 http\/https/)
  assert.match(validateUrl("example.com") ?? "", /仅支持 http\/https/)
  assert.match(validateUrl("https://user:pass@example.com") ?? "", /userinfo/)
  assert.match(validateUrl(`https://example.com/${"a".repeat(MAX_URL_CHARS)}`) ?? "", /URL 过长/)
  assert.match(validateUrl("https://") ?? "", /无法解析 URL/)
})

test("validateQuery enforces 1..128 characters", () => {
  assert.equal(validateQuery("open source"), undefined)
  assert.match(validateQuery("") ?? "", /搜索词为空/)
  assert.match(validateQuery("a".repeat(MAX_QUERY_CHARS + 1)) ?? "", /搜索词过长/)
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
  assert.match(httpError(401, "", false).message, /API Key 无效/)
  assert.match(httpError(402, "", false).message, /余额不足/)
  assert.match(httpError(403, "", true).message, /webfetch/)
  assert.match(httpError(404, "", true).message, /无法提取/)
  assert.match(httpError(429, "", false).message, /限速/)
  assert.match(httpError(500, "", false).message, /服务端错误/)
})

test("httpError surfaces the upstream message when the body carries one", () => {
  const body = JSON.stringify({ error: { message: "'count' must be between 1 and 50" } })
  assert.match(httpError(400, body, false).message, /'count' must be between 1 and 50/)
  // A non-JSON body must not break error construction.
  assert.match(httpError(400, "<html>oops</html>", false).message, /请求参数无效/)
})
