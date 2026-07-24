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
  },
})
