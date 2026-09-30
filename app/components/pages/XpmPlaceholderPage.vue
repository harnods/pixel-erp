<script setup lang="ts">
import { MpText, css } from '@mekari/pixel3'

const { t } = useLocale()
const { pageTitle } = useNavigation()

const scaffoldClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '240px',
})

const boxClass = css({
  width: '100%',
  maxWidth: '480px',
  padding: '8',
  textAlign: 'center',
  border: '1px dashed token(colors.border.default)',
  rounded: 'xl',
  bg: 'background.neutral',
})

const titleClass = css({
  fontSize: 'lg',
  fontWeight: 'semiBold',
  color: 'text.default',
  marginBottom: '2',
})

const hintClass = css({
  fontSize: 'sm',
  lineHeight: 'sm',
  color: 'text.secondary',
})
</script>

<template>
  <div :class="scaffoldClass">
    <div :class="boxClass">
      <MpText :class="titleClass">{{ t(pageTitle) }}</MpText>
      <MpText :class="hintClass">This page keeps the same shell, grouped nav and design language. It's next in line to be built.</MpText>
    </div>
  </div>
</template>
