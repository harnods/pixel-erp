/**
 * Projects = Project accounting. The Projects rail item opens the project
 * accounting list at /projects; the old Project MTO module is gone, and nothing
 * routes to /project-accounting any more.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { SITEMAP } from '~/data/erpSitemap'
import { TOUR_GROUPS } from '~/tours/tourRegistry'

const root = resolve(__dirname, '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('Projects menu serves Project accounting', () => {
  it('the sitemap Projects module is one built Projects leaf at /projects', () => {
    const mod = SITEMAP.find((m) => m.module === 'Projects')!
    expect(mod.items.map((i) => i.label)).toEqual(['Projects'])
    expect(mod.items[0]!.route).toBe('/projects')
    expect(mod.items[0]!.built).toBe(true)
  })

  it('the router serves /projects with the Project accounting pages', () => {
    const slug = read('app/pages/[...slug].vue')
    expect(slug).toMatch(/'Projects':\s+defineAsyncComponent\(\(\) => import\('~\/components\/pages\/ProjectAccountingPage\.vue'\)\)/)
    expect(slug).toContain("segs[0] === 'projects'")
    expect(slug).not.toContain('ProjectsRouter')
    // The list title bar has only New project; expenses start from a project's Costs tab.
    expect(slug).not.toContain("router.push('/projects/expense/new')")
    expect(slug).not.toMatch(/['`]\/project-accounting/)
  })

  it('the sidebar has a single Projects item and no Project accounting entry under Accounting', () => {
    const sidebar = read('app/components/ErpSidebar.vue')
    expect(sidebar).toContain("{ name: 'Projects', icon: 'briefcase' }")
    expect(sidebar).not.toContain("{ label: 'Project accounting' }")
    expect(sidebar).not.toContain('Project approvals')
  })

  it('tours for projects run on /projects', () => {
    const g = TOUR_GROUPS.find((x) => x.key === 'project')!
    expect(g.label).toBe('Projects')
    expect(g.matches('/projects')).toBe(true)
    expect(g.matches('/projects/e1')).toBe(true)
  })

  it('the old Project MTO module is removed', () => {
    expect(existsSync(resolve(root, 'app/components/projects'))).toBe(false)
    expect(existsSync(resolve(root, 'app/assets/css/project-mto.css'))).toBe(false)
  })
})
