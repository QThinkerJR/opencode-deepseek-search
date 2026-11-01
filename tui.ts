// TUI entrypoint. OpenCode resolves a configured plugin *directory* by its root
// conventional file names (`tui` for the TUI half), so this re-export keeps the
// TUI half loadable without a package `exports` map (a `name`+`exports`
// manifest switches resolution to the package name, which OpenCode drops when
// the result falls outside the directory).
export { default } from "./src/tui/main.ts"
