import { PixelPlugin, type PixelPluginConfig } from "@mekari/pixel3";

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(PixelPlugin, {
    pixelTheme: true, // Enable Pixel Theme
    // NOTE: the toast manager is mounted explicitly via <MpToastManager /> in
    // layouts/default.vue (inside the themed app tree). Do NOT also auto-mount it
    // here — two [data-sonner-toaster] nodes make toast.notify() silently no-op
    // ("Only 1 MpToastManager allowed"), so every success toast fails to appear.
    toastManager: false,
    tooltipDirective: true
  } as PixelPluginConfig);
});
