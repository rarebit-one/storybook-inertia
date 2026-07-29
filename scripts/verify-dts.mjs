#!/usr/bin/env node
/**
 * Publish guard: refuse to ship a package whose type declarations are a stub.
 *
 * WHY THIS EXISTS
 * ---------------
 * sidekick-ui v0.7.0 built "successfully", was tagged, and was never
 * publishable: `dist/index.d.ts` was a bare `export { }` with no declarations
 * behind it (sidekick-ui#122). A `grep -q '^export'` passes that stub happily,
 * so the check has to assert the shape we actually emit.
 *
 * luminality-ui emits a MULTI-FILE declaration tree and guards it by counting
 * .d.ts files with `declare` in them. This package rolls types up into ONE
 * file (`rollupTypes: true`), so that file count is always 1 and the floor
 * would be meaningless. The equivalent assertions here are:
 *
 *   1. dist/index.d.ts exists and is non-trivial.
 *   2. It contains real `export declare` statements — not just `export { }`.
 *   3. Every symbol the consumers actually import is declared and exported.
 *      This is the strongest check: it fails on a partial rollup, not merely
 *      an empty one, which a count-based floor would wave through.
 */

import { readFileSync, existsSync } from "node:fs"

const DTS = "dist/index.d.ts"

/**
 * The public API consumers alias `@inertiajs/react` onto. Dropping any of
 * these silently breaks a consumer's whole Storybook preview rather than one
 * story, so each is asserted by name.
 */
const REQUIRED_EXPORTS = [
  "StorybookPageProvider",
  "createStorybookPageProvider",
  "usePage",
  "Link",
  "Form",
  "Head",
  "Deferred",
  "router",
  "useForm",
  "http",
  "progress",
  "createInertiaApp",
  "InertiaPage",
  "InertiaPageProps",
  "ResolvedComponent",
]

const fail = (msg) => {
  console.error(`::error::${msg}`)
  process.exitCode = 1
}

if (!existsSync(DTS)) {
  fail(
    `${DTS} is missing — check vite-plugin-dts config (include/entry must match the build entry).`,
  )
  process.exit(1)
}

const dts = readFileSync(DTS, "utf8")

// 1. An empty `export { }` stub, or anything close to it, is not a package.
const declareCount = (dts.match(/^export declare /gm) ?? []).length
if (declareCount === 0) {
  fail(
    `${DTS} contains no 'export declare' statements — looks like an empty 'export { }' stub. The declaration build is broken. See sidekick-ui#122.`,
  )
  console.error("--- dist/index.d.ts ---")
  console.error(dts)
  process.exit(1)
}

// 2. Every public symbol must actually be declared.
const missing = REQUIRED_EXPORTS.filter(
  (name) =>
    !new RegExp(`^export declare (function|const|interface|type|class) ${name}\\b`, "m").test(dts),
)

if (missing.length > 0) {
  fail(
    `${DTS} is missing declarations for: ${missing.join(", ")}. A partial rollup ships a package that type-errors in every consumer.`,
  )
  process.exit(1)
}

// 3. The runtime bundle must exist alongside the types.
if (!existsSync("dist/index.js")) {
  fail("dist/index.js is missing — the runtime build did not emit.")
  process.exit(1)
}

console.log(
  `::notice::Declaration check OK — ${declareCount} exported declarations, all ${REQUIRED_EXPORTS.length} required symbols present.`,
)
