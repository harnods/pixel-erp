import { PixelPlugin, type PixelPluginConfig } from "@mekari/pixel3";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(PixelPlugin, {
    pixelTheme: true, // Enable Pixel Theme
    toastManager: true,
    tooltipDirective: true
  } as PixelPluginConfig);
});
