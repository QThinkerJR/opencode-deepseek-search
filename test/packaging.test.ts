import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { Host } from "@opencode/plugin/host"

const root = fileURLToPath(new URL("..", import.meta.url))

// README packaging trap: with `name` + `exports`, OpenCode resolves a locally configured directory by package name
// and silently drops entrypoints outside it. The package must keep resolving by its root file convention instead.
test("package.json stays free of the exports field", () => {
  // The hand-formatted manifest starts with a UTF-8 BOM, which JSON.parse rejects.
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8").replace(/^\uFEFF/, "")) as Record<
    string,
    unknown
  >
  assert.equal("exports" in pkg, false)
})

// The resolved entrypoint is a file: URL, so normalise it before comparing; basename keeps this separator-agnostic.
test("server entry resolves to the repository root index.ts", () => {
  const entry = Host.resolve({ directory: root })
  assert.ok(entry.server, "server entry did not resolve")
  assert.equal(path.basename(fileURLToPath(entry.server)), "index.ts")
})
