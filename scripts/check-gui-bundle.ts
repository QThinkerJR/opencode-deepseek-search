// Guards the desktop bundle contract: the prebuilt CommonJS file the host loads
// as the plugin's `./gui-experimental` entry must exist and stay one file with
// its dynamic imports inlined.
//
// The bundle is never `require`d: it may touch `window` / Electron at load time.

import { readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const file = path.join(root, "gui-experimental.cjs")

let failures = 0
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`)
}

let bytes = 0
try {
  bytes = statSync(file).size
} catch {
  bytes = 0
}

check("bundle exists", bytes > 0, file)
if (bytes === 0) {
  console.log("FAIL no bundle to inspect; run `npm run build:gui` first")
  process.exit(1)
}

const source = readFileSync(file, "utf8")

check("bundle is non-empty", bytes > 0, `${bytes} bytes`)
check(
  "bundle is CommonJS",
  source.includes("module.exports") || source.includes("exports.default"),
  'contains "module.exports" or "exports.default"',
)
check("no dynamic import() remains", !/\bimport\s*\(/.test(source), "every dynamic import must be inlined")

if (failures > 0) {
  console.log(`FAIL ${failures} check(s) failed`)
  process.exit(1)
}
console.log(`ok   gui bundle verified (${bytes} bytes)`)
