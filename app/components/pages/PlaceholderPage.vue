<script setup lang="ts">
import { MpText, css } from '@mekari/pixel3'

const { t } = useLocale()
const { currentPageKey } = useNavigation()

const pageClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  minHeight: '240px',
})

const contentClass = css({ textAlign: 'center' })

const labelClass = css({
  fontSize: 'lg',
  fontWeight: 'semiBold',
  color: 'text.default',
  marginBottom: '2',
})

const hintClass = css({
  fontSize: 'md',
  color: 'text.subtle',
})
</script>

<template>
  <div :class="pageClass">
    <div :class="contentClass">
      <MpText :class="labelClass">{{ currentPageKey }}</MpText>
      <MpText :class="hintClass">{{ t('Page content goes here.') }}</MpText>
    </div>
  </div>
</template>
