<template>
  <MpFlex
    as="header"
    alignItems="center"
    gap="2"
    height="56px"
    pl="4"
    pr="3"
    zIndex="sticky"
    backgroundColor="background.header"
  >
    <!-- Left: Logo -->
    <MpFlex
      alignItems="center"
      gap="2"
      flex="1"
      :display="{ base: 'none', md: 'flex' }"
    >
      <img
        :src="logoSrc"
        alt="Mekari ERP"
        :class="
          css({
            height: '20px',
            width: 'auto',
            display: 'block',
            flexShrink: '0'
          })
        "
      />
    </MpFlex>

    <!-- Center: Search -->
    <MpFlex
      :flexBasis="{ base: 'auto', md: '280px', lg: '400px' }"
      :width="{ base: 'full', md: '280px', lg: '400px' }"
      :flex="{ base: '1', md: 'initial' }"
    >
      <QuickSearch />
    </MpFlex>

    <!-- Right: Actions + User -->
    <MpFlex alignItems="center" flex="1" gap="2" justifyContent="flex-end">
      <MpFlex alignItems="center" gap="1">
        <IconButton icon="add" />
        <IconButton icon="help" />
        <IconButton icon="desktop" />
        <IconButton icon="notification" />
      </MpFlex>

      <!-- User -->
      <MpFlex
        alignItems="center"
        gap="2"
        px="2"
        py="1"
        rounded="lg"
        :_hover="{
          bg: 'background.header.menu.hovered'
        }"
      >
        <MpAvatar
          id="header-user-avatar"
          name="Rizal Candra"
          size="lg"
          variant-color="sky"
        />
        <MpFlex
          direction="column"
          alignItems="flex-start"
          :display="{ base: 'none', lg: 'flex' }"
        >
          <MpText size="label" color="text.inverse.static" weight="semiBold">
            Rizal Candra
          </MpText>
          <MpFlex maxWidth="160px" overflow="hidden">
            <MpText size="body-small" color="text.inverse" is-truncated>
              PT Central Perk Indonesia
            </MpText>
          </MpFlex>
        </MpFlex>
      </MpFlex>
    </MpFlex>
  </MpFlex>
</template>

<script setup lang="ts">
import { MpFlex, MpAvatar, MpText, css } from "@mekari/pixel3";

const logoSrc = "/mekari-erp-logo.svg";
</script>
