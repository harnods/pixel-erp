/**
 * Production module settings.
 *
 * Settings that change what the Production screens offer, rather than what any
 * one record contains. They live here so a screen reads the flag instead of
 * hard-coding the behaviour, and so the eventual Production settings page has
 * something to bind to.
 *
 * There is no settings UI for these yet — the sidebar's "Production settings"
 * entry has no page behind it. Until there is, these are the defaults.
 */

export interface ProductionSettings {
  /**
   * Whether a work order can be closed for part of its quantity, leaving the
   * balance open ("partially produced"), instead of only all-or-nothing.
   *
   * Off means the work order offers completion alone.
   */
  partialProduction: boolean
}

export const productionSettings: ProductionSettings = {
  partialProduction: true,
}
