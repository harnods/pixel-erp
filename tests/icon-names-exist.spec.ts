/**
 * Every static icon name in the app is a real Pixel icon.
 *
 * MpIcon loads `https://cdn.mekari.design/icons/<name>-<variant>.svg`, so a name
 * Pixel doesn't have (e.g. `information` for `info`, `trash` for `delete`) renders
 * nothing and leaves a 404 in the console on every page that mounts it — easy to
 * miss, because the layout doesn't break. The valid names are Pixel's own icon
 * list, read from the installed @mekari/pixel3-icon package.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

function pixelIconNames(): Set<string> {
  const src = readFileSync(join(ROOT, 'node_modules/@mekari/pixel3-icon/dist/data/iconsCategories.mjs'), 'utf8')
  const names = new Set<string>()
  for (const m of src.matchAll(/var \w+Icons = \[([^\]]*)\]/g))
    for (const n of m[1]!.matchAll(/"([^"]+)"/g)) names.add(n[1]!)
  return names
}

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return vueFiles(p)
    return p.endsWith('.vue') ? [p] : []
  })
}

describe('icon names', () => {
  const valid = pixelIconNames()

  it('reads Pixel\'s icon list', () => {
    expect(valid.size).toBeGreaterThan(100)
    expect(valid.has('info')).toBe(true)
  })

  it('every static MpIcon name / left-icon / right-icon in app/components is a Pixel icon', () => {
    const bad: string[] = []
    for (const file of vueFiles(join(ROOT, 'app/components'))) {
      const src = readFileSync(file, 'utf8')
      const re = /<MpIcon\b[^>]*?\sname="([a-z0-9-]+)"|\s(?:left|right)-icon="([a-z0-9-]+)"/g
      for (const m of src.matchAll(re)) {
        const name = m[1] ?? m[2]!
        if (!valid.has(name)) bad.push(`${file.replace(`${ROOT}/`, '')}: "${name}"`)
      }
    }
    expect(bad).toEqual([])
  })
})
