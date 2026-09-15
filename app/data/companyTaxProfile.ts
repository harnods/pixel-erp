/**
 * The company's own tax identity — the "Pengusaha Kena Pajak" side of every
 * Output Tax Document it issues.
 *
 * Settings ▸ Company profile owns the editable version of this (see
 * SettingsCompanyProfilePage.vue, which also models the non-PKP and
 * not-yet-registered-with-Klikpajak scenarios). This module is the read-only
 * slice that documents need, so printing a faktur doesn't have to reach into a
 * settings screen's local state.
 */
export interface CompanyTaxProfile {
  name: string
  address: string
  /** 16-digit NPWP, as Coretax formats it. */
  npwp: string
  /** Nomor Identitas Tempat Kegiatan Usaha — the branch identifier. */
  nitku: string
}

export const COMPANY_TAX_PROFILE: CompanyTaxProfile = {
  name: 'PT Central Perk Indonesia',
  address: 'Jl. Jenderal Sudirman Kav. 52-53, Senayan, Jakarta Selatan, 12190, DKI Jakarta',
  npwp: '00098765432102222',
  nitku: '000022',
}
