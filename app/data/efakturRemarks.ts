/**
 * Additional remarks (keterangan tambahan) — the shared catalogue behind the
 * two transaction codes that carry a facility reason: **07** (PPN tidak
 * dipungut) and **08** (PPN dibebaskan).
 *
 * Used by both output documents: an FK (Faktur Keluaran) raised under code
 * 07/08, and a DK (Dokumen Lain Keluaran) under transaction code 5 whose
 * detail is 07/08. Same list, same rule — see `refDocRequired` below.
 *
 * Labels stay in Indonesian. These are the regulation's own designations
 * (and what Coretax prints), not UI copy to translate — the same reason the
 * Summary block shows "Dasar pengenaan pajak (DPP)" untranslated.
 *
 * `contentStamp` / `contentStampCode` (the cap printed on the faktur PDF and
 * the TD.011xx code sent to Coretax) are DERIVED from the selection, never
 * entered, so they aren't modelled here — see §8.4 of the spec.
 */

export interface AdditionalRemark {
  /** e.g. '07-02'. */
  code: string
  /** Dropdown label, without the code prefix. */
  label: string
  /**
   * When true the "Description" field is required (max 255). When false it must
   * be EMPTY — the form disables it and nulls the value (§2.3).
   */
  refDocRequired: boolean
  /**
   * What to put in Description, when it's required. The spec calls this a
   * placeholder; the ERP has no placeholders (`rule/input-no-placeholder`), so
   * it renders as a caption under the label instead.
   */
  refDocHint?: string
}

/** §2.1 — code 07, PPN tidak dipungut. 30 options. */
export const REMARKS_07: AdditionalRemark[] = [
  { code: '07-01', label: 'untuk Kawasan Bebas', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '07-02', label: 'untuk Tempat Penimbunan Berikat', refDocRequired: true, refDocHint: 'Nomor AJU' },
  { code: '07-03', label: 'untuk Hibah dan Bantuan Luar Negeri', refDocRequired: false },
  { code: '07-04', label: 'untuk Avtur', refDocRequired: false },
  { code: '07-05', label: 'untuk Lainnya', refDocRequired: false },
  { code: '07-06', label: 'untuk Kontraktor PKP2B Generasi I', refDocRequired: false },
  { code: '07-07', label: 'untuk Penyerahan BBM Kapal Angkutan Laut LN', refDocRequired: false },
  { code: '07-08', label: 'untuk Penyerahan JKP terkait alat angkutan tertentu', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '07-09', label: 'untuk Penyerahan BKP Tertentu di KEK', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '07-10', label: 'untuk BKP strategis berupa anode slime', refDocRequired: false },
  { code: '07-11', label: 'untuk Penyerahan alat angkutan tertentu dan/atau JKP terkait', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '07-12', label: 'untuk Kontraktor KKS Migas (PP 27/2017)', refDocRequired: true, refDocHint: 'Nomor Fasilitas' },
  { code: '07-13', label: 'Rumah Tapak & Sarusun DTP TA 2021', refDocRequired: false },
  { code: '07-14', label: 'Jasa Sewa Ruangan ke Pedagang Eceran DTP TA 2021', refDocRequired: false },
  { code: '07-15', label: 'Barang & Jasa Penanganan COVID-19', refDocRequired: false },
  { code: '07-16', label: 'Insentif PMK-103/2021 Rumah Tapak DTP TA 2021', refDocRequired: false },
  { code: '07-17', label: 'KEK (PP 40/2021)', refDocRequired: true, refDocHint: 'Nomor PJKEK atau PPKEK' },
  { code: '07-18', label: 'Kawasan Bebas (PP 41/2021)', refDocRequired: true, refDocHint: 'Nomor PPBJ' },
  { code: '07-19', label: 'Rumah Tapak & Sarusun DTP TA 2022', refDocRequired: false },
  { code: '07-20', label: 'PPN DTP Penanganan COVID (PMK 226/2021)', refDocRequired: false },
  { code: '07-21', label: 'Kontraktor KKS Migas (PP 53/2017)', refDocRequired: true, refDocHint: 'Nomor Fasilitas' },
  { code: '07-22', label: 'BKP strategis anode slime dan emas butiran', refDocRequired: false },
  { code: '07-23', label: 'untuk penyerahan kertas koran dan/atau majalah', refDocRequired: false },
  { code: '07-24', label: 'PPN tidak dipungut oleh Pemerintah lainnya', refDocRequired: false },
  { code: '07-25', label: 'BKP dan JKP tertentu', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '07-26', label: 'Penyerahan BKP dan JKP di Ibu Kota Negara baru', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '07-27', label: 'Penyerahan kendaraan listrik berbasis baterai', refDocRequired: false },
  { code: '07-28', label: 'Insentif Tambahan Rumah Tapak & Sarusun DTP TA 2025', refDocRequired: false },
  { code: '07-29', label: 'Hewan Khusus Tertentu Berupa Kuda DTP TA 2025', refDocRequired: false },
  { code: '07-30', label: 'Bekal Khusus Operasi Tertentu DTP TA 2025', refDocRequired: false },
]

/** §2.2 — code 08, PPN dibebaskan. 10 options. */
export const REMARKS_08: AdditionalRemark[] = [
  { code: '08-01', label: 'untuk BKP dan JKP Tertentu', refDocRequired: false },
  { code: '08-02', label: 'untuk BKP Tertentu yang Bersifat Strategis', refDocRequired: false },
  { code: '08-03', label: 'untuk Jasa Kebandarudaraan', refDocRequired: false },
  { code: '08-04', label: 'untuk Lainnya', refDocRequired: false },
  { code: '08-05', label: 'untuk BKP Strategis (PP 81/2015)', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '08-06', label: 'untuk Jasa Kepelabuhan Tertentu angkutan laut LN', refDocRequired: false },
  { code: '08-07', label: 'untuk Penyerahan Air Bersih', refDocRequired: false },
  { code: '08-08', label: 'BKP strategis (PP 48/2020)', refDocRequired: true, refDocHint: 'Supporting document' },
  { code: '08-09', label: 'Perwakilan Negara Asing dan Badan Internasional', refDocRequired: true, refDocHint: 'Nomor Fasilitas' },
  { code: '08-10', label: 'BKP dan JKP tertentu', refDocRequired: true, refDocHint: 'Supporting document' },
]

/** The catalogue a transaction/detail code opens, or [] when it carries none. */
export function remarksFor(code: string): AdditionalRemark[] {
  if (code === '07') return REMARKS_07
  if (code === '08') return REMARKS_08
  return []
}

/** True for exactly the two codes that carry a remarks catalogue (R-FK-5, R-DK-3). */
export function hasRemarks(code: string): boolean {
  return code === '07' || code === '08'
}

export function findRemark(code: string): AdditionalRemark | undefined {
  return [...REMARKS_07, ...REMARKS_08].find(r => r.code === code)
}

/** Dropdown options for a remarks catalogue — "07-02 — untuk Tempat Penimbunan Berikat". */
export function remarkOptions(code: string): { value: string; label: string }[] {
  return remarksFor(code).map(r => ({ value: r.code, label: `${r.code} — ${r.label}` }))
}
