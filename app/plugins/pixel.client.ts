import { PixelPlugin, type PixelPluginConfig, usePixelTheme } from "@mekari/pixel3";

export default defineNuxtPlugin((nuxtApp) => {
  // Apply theme settings BEFORE PixelPlugin installs its watcher (pixelTheme:true
  // calls activePixelThemeWatcher with immediate:true). Setting these values first
  // means the watcher's initial tick sees the right state and applies
  // data-panda-theme + data-product-theme synchronously — before the first Vue
  // render — so there is no flash of wrong enterprise colors.
  const { setNextTheme, setDarkMode, setProductTheme } = usePixelTheme();
  setNextTheme(true);
  setDarkMode(false);
  setProductTheme("enterprise");

  nuxtApp.vueApp.use(PixelPlugin, {
    pixelTheme: true,
    // NOTE: the toast manager is mounted explicitly via <MpToastManager /> in
    // layouts/default.vue (inside the themed app tree). Do NOT also auto-mount it
    // here — two [data-sonner-toaster] nodes make toast.notify() silently no-op
    // ("Only 1 MpToastManager allowed"), so every success toast fails to appear.
    toastManager: false,
    tooltipDirective: true
  } as PixelPluginConfig);
});
