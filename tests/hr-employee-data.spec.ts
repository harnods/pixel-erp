/**
 * HR (Talenta) — employee master regression tests.
 *
 * Guards the "every employee must be complete & coherent" work: each person needs
 * family, education, emergency contacts and work experience, a valid 16-digit NIK,
 * and a gender-matched avatar (a male name must never get a female illustration,
 * and vice-versa — see the avatar split in data/employees.ts).
 */
import { describe, it, expect } from 'vitest'
import { employees } from '~/data/employees'

// The female avatar illustrations (must mirror FEMALE_AVATARS in employees.ts).
const FEMALE_AVATARS = new Set(['christin.jpg', 'cinta.jpg', 'evelyn.jpg', 'indah.jpg', 'jessie.jpg'])
const fileOf = (photo?: string) => (photo ?? '').split('/').pop() ?? ''

describe('HR employee master — coherence', () => {
  it('has employees with unique ids and employee codes', () => {
    expect(employees.length).toBeGreaterThan(0)
    expect(new Set(employees.map((e) => e.id)).size).toBe(employees.length)
    expect(new Set(employees.map((e) => e.employeeId)).size).toBe(employees.length)
  })

  it('every employee has complete sub-records (family / education / emergency / work experience)', () => {
    const missing = employees
      .filter((e) => !(e.family?.length && e.education?.length && e.emergencyContacts?.length && e.workExperience?.length))
      .map((e) => e.fullName)
    expect(missing, `incomplete: ${missing.join(', ')}`).toEqual([])
  })

  it('every employee has core profile fields (NIK 16 digits, email, join date)', () => {
    for (const e of employees) {
      expect(e.nik, `${e.fullName} NIK`).toMatch(/^\d{16}$/)
      expect(e.email, `${e.fullName} email`).toBeTruthy()
      expect(e.jobPosition, `${e.fullName} jobPosition`).toBeTruthy()
    }
  })

  it('avatar gender matches the employee gender', () => {
    const mismatches = employees
      .filter((e) => {
        const isFemaleAvatar = FEMALE_AVATARS.has(fileOf(e.photo))
        return e.gender === 'Female' ? !isFemaleAvatar : isFemaleAvatar
      })
      .map((e) => `${e.fullName} (${e.gender}) → ${fileOf(e.photo)}`)
    expect(mismatches, `avatar/gender mismatch: ${mismatches.join('; ')}`).toEqual([])
  })

  it('education records are well-formed (institution, degree, period)', () => {
    for (const e of employees) {
      for (const ed of e.education ?? []) {
        expect(ed.institution, `${e.fullName} education institution`).toBeTruthy()
        expect(ed.degree, `${e.fullName} education degree`).toBeTruthy()
        expect(ed.startYear && ed.endYear, `${e.fullName} education period`).toBeTruthy()
      }
    }
  })
})
