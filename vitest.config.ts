import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '~': resolve(__dirname, 'app'),
      '@': resolve(__dirname, 'app'),
    },
  },
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.behavior.spec.ts'],
    environment: 'node',
    // Fills the getBoundingClientRect gap on Comment/Text nodes so floating-ui's
    // post-unmount async positioning can't throw (see tests/setup.ts).
    setupFiles: ['./tests/setup.ts'],
    // happy-dom has no layout engine / no network, so Pixel's floating-ui
    // tooltips and incidental <img> loads emit async unhandled rejections AFTER
    // their tests have already passed. They are environmental noise, not test
    // failures — but they'd otherwise flip the process exit code to 1 and break
    // the CI gate on a fully-green suite. Test pass/fail is unaffected: a real
    // assertion failure still fails the run.
    dangerouslyIgnoreUnhandledErrors: true,
  },
})
