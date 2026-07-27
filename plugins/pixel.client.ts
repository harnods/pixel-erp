import { PixelPlugin } from '@mekari/pixel3'
import { usePixelTheme } from '@mekari/pixel3'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(PixelPlugin, { pixelTheme: true, tooltipDirective: true })

  const { setNextTheme } = usePixelTheme()
  setNextTheme(true)
})
