/**
 * Detail pages link a transaction's customer / vendor to its contact page.
 * Two bugs broke that link: the templates called `window.open(...)` inline
 * (window is not exposed to Vue templates, so the click threw), and about half of
 * the customer master had no contact record, so the link landed on "Contact not
 * found". These tests pin both fixes.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { customers } from '~/data/customers'
import { vendors } from '~/data/vendors'
import { contacts, getContactIdByName, getContact } from '~/data/contacts'
import { contactHref } from '~/composables/useOpenContact'

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : []
  })
}

describe('contact links on detail pages', () => {
  it('no template calls window.* inline (it throws in the production build)', () => {
    const offenders = vueFiles('app/components').filter((f) => /@click="window\./.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('every customer and vendor that transactions reference has a contact record', () => {
    const missing = [...customers.map((c) => c.name), ...vendors.map((v) => v.name)].filter((n) => !getContactIdByName(n))
    expect(missing).toEqual([])
  })

  it('backfilled contacts carry the right list type and master details', () => {
    const santika = getContact(getContactIdByName('Santika Premiere Hotel')!)!
    expect(santika.types).toContain('customer')
    expect(santika.emails).toContain('fnb@santika.com')
    const ids = contacts.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length) // no duplicate ids
  })

  it('contactHref builds the list route, or undefined when nothing matches', () => {
    expect(contactHref('customers', 'Santika Premiere Hotel')).toMatch(/^\/customers\/CT\d{3}$/)
    expect(contactHref('vendors', 'Klasik Beans Cooperative')).toBe('/vendors/CT013')
    expect(contactHref('customers', 'Nobody Ltd')).toBeUndefined()
  })
})
