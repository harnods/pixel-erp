// Nuxt 4 / Vite 8 need a modern Node. On an old one they die deep inside a
// dependency with "does not provide an export named 'styleText'", which says
// nothing about the real cause. Fail here instead, with the fix.
const MIN_MAJOR = 22
const major = Number(process.versions.node.split('.')[0])

if (major < MIN_MAJOR) {
  console.error(
    `\nNode ${process.versions.node} is too old for this app (needs >= ${MIN_MAJOR}).\n` +
      `Current node: ${process.execPath}\n\n` +
      `Fix it with either:\n` +
      `  export PATH="/opt/homebrew/opt/node/bin:$PATH"   # Homebrew Node\n` +
      `  nvm use                                          # reads .nvmrc\n`,
  )
  process.exit(1)
}
