import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

// Builds the desktop half into the root-level CommonJS bundle the host loads as
// the plugin's `./gui-experimental` entry. `entry` must be explicit: `gui()`
// defaults to `src/gui.tsx`.
export default defineConfig({
  plugins: [gui({ entry: "src/gui/index.tsx", outFile: "gui-experimental.cjs" })],
})
