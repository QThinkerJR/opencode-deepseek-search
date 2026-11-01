// Package entry. OpenCode resolves a configured plugin *directory* by its root
// conventional file names (`server`, else `index`), so this re-export keeps the
// repository usable as a local plugin directory without a package `exports`
// map (a `name`+`exports` manifest switches resolution to the package name,
// which OpenCode drops when the result falls outside the directory).
export { default } from "./src/index.ts"
