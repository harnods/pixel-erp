<template>
  <!--
    Access gate. Resolves the session once on mount, then renders exactly one of:
      • loading   → a minimal centered spinner (avoids a flash of the login card)
      • anonymous → <LoginScreen> (Google @mekari.com sign-in)
      • authed    → the app (default slot)
    App-level protection for the prototype — see server/api/auth/*.
  -->
  <div v-if="status === 'loading'" class="auth-gate__loading">
    <MpSpinner size="lg" />
  </div>
  <LoginScreen v-else-if="status === 'anonymous'" />
  <slot v-else />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { MpSpinner } from '@mekari/pixel3'

const { status, refresh } = useAuth()

onMounted(() => refresh())
</script>

<style scoped>
.auth-gate__loading {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mp-colors-background-neutral, #f0f2f2);
}
</style>
