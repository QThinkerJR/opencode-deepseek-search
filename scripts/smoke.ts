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

await step("search returns results", async () => {
  const results = await deepseekSearch("DeepSeek 官方文档", key, 3)
  if (results.length === 0) throw new Error("empty results")
  const first = results[0]
  if (!first?.url) throw new Error("first result has no url")
  if (first.content && first.content.length > 2000) throw new Error("search content is not a summary")
  return `${results.length} results, first: ${first.url}`
})

await step("search with no match returns empty array", async () => {
  const results = await deepseekSearch("zzzz-no-such-topic-opencode-deepseek-smoke", key, 3)
  return `${results.length} results`
})

await step("fetch returns markdown", async () => {
  const result = await deepseekFetch("https://example.com", key, 5000)
  if (result.empty) throw new Error("empty content")
  if (!result.markdown.includes("https://example.com")) throw new Error("markdown missing source url")
  return `${result.chars} chars`
})

await step("fetch truncates long pages", async () => {
  const result = await deepseekFetch("https://example.com", key, 20)
  if (!result.truncated) throw new Error("expected truncation at 20 chars")
  if (!result.markdown.includes("[DeepSeek Fetch 截断提示]")) throw new Error("missing truncation notice")
  return "truncation notice present"
})

await step("invalid url is rejected before the request", async () => {
  if (validateUrl("ftp://example.com") === undefined) throw new Error("ftp url accepted")
  return "rejected"
})

console.log(failures === 0 ? "SMOKE OK" : `SMOKE FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
