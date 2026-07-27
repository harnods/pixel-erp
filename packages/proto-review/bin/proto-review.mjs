#!/usr/bin/env node
// Subcommand dispatcher: `proto-review init` and `proto-review bridge`.
// Each target self-runs on import.
const cmd = process.argv[2]

if (cmd === 'bridge') {
  await import('./bridge.mjs')
} else {
  // init.mjs prints its own usage when the subcommand isn't 'init'
  await import('./init.mjs')
}
