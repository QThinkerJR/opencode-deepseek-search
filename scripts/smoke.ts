// Real-API smoke test. Skipped automatically when DEEPSEEK_API_KEY is absent.
//
//   node --experimental-strip-types scripts/smoke.ts

import { deepseekFetch, deepseekSearch, validateUrl } from "../src/deepseek.ts"

const key = process.env.DEEPSEEK_API_KEY?.trim()

if (!key) {
  console.log("SKIP: DEEPSEEK_API_KEY is not set. Smoke test needs a real key.")
  process.exit(0)
}

let failures = 0
const step = async (name: string, run: () => Promise<string>) => {
  const started = Date.now()
  try {
    console.log(`ok   ${name} (${Date.now() - started}ms): ${await run()}`)
  } catch (error) {
    failures++
    console.log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

await step("search returns results honouring count", async () => {
  const results = await deepseekSearch("DeepSeek 官方文档", key, 3, "en")
  if (results.length === 0) throw new Error("empty results")
  if (results.length > 3) throw new Error(`count=3 returned ${results.length} results`)
  const first = results[0]
  if (!first?.url) throw new Error("first result has no url")
  // `content` is the model-oriented summary (never full page text), so it is
  // bounded but not tiny.
  if (first.content !== undefined && first.content.length > 4000) throw new Error("search content looks like page text")
  return `${results.length} results, first: ${first.url}`
})

await step("search with a nonsense query still returns a well-formed array", async () => {
  const results = await deepseekSearch("zzzz-no-such-topic-opencode-deepseek-smoke", key, 3, "en")
  if (!Array.isArray(results)) throw new Error("not an array")
  return `${results.length} results`
})

await step("fetch returns markdown", async () => {
  const result = await deepseekFetch("https://example.com", key, 5000, "en")
  if (result.empty) throw new Error("empty content")
  if (!result.markdown.includes("https://example.com")) throw new Error("markdown missing source url")
  return `${result.chars} chars`
})

await step("fetch truncates long pages", async () => {
  const result = await deepseekFetch("https://example.com", key, 20, "en")
  if (!result.truncated) throw new Error("expected truncation at 20 chars")
  if (!result.markdown.includes("[DeepSeek Fetch truncated]")) throw new Error("missing truncation notice")
  return "truncation notice present"
})

await step("invalid url is rejected before the request", async () => {
  if (validateUrl("ftp://example.com", "en") === undefined) throw new Error("ftp url accepted")
  return "rejected"
})

console.log(failures === 0 ? "SMOKE OK" : `SMOKE FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
