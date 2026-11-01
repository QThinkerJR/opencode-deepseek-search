import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { Host } from "@opencode/plugin/host"

const root = fileURLToPath(new URL("..", import.meta.url))

// README packaging trap: with `name` + `exports`, OpenCode resolves a locally configured directory by package name
// and silently drops entrypoints outside it. The package must keep resolving by its root file convention instead.
test("package.json stays free of the exports field", () => {
  // Strip a BOM defensively: hand-edited manifests sometimes keep one, and JSON.parse rejects it.
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

test("tui entry resolves to the repository root tui.ts", () => {
  const entry = Host.resolve({ directory: root })
  assert.ok(entry.tui, "tui entry did not resolve")
  assert.equal(path.basename(fileURLToPath(entry.tui)), "tui.ts")
})

// The desktop bundle is a build artifact and stays out of git, so a fresh clone
// has none until `npm run build:gui`: assert the entry only when it exists.
test("gui entry resolves to the root gui-experimental.cjs once it is built", (t) => {
  if (!existsSync(path.join(root, "gui-experimental.cjs"))) {
    t.skip("gui-experimental.cjs is not built")
    return
  }
  const entry = Host.resolve({ directory: root })
  assert.ok(entry.gui, "gui entry did not resolve")
  assert.equal(path.basename(fileURLToPath(entry.gui)), "gui-experimental.cjs")
})
