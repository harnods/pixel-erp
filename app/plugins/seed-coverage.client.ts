/**
 * Ensures the seed status-coverage top-up runs at app boot (client only), so a
 * fresh/reset mock DB always has ≥1 record in every inbound/outbound status even
 * if no page has imported the data barrel yet. Importing the module runs its
 * one-time, sentinel-guarded ensureSeedCoverage(). See data/seedCoverage.ts.
 */
import '~/data/seedCoverage'

export default defineNuxtPlugin(() => {})
