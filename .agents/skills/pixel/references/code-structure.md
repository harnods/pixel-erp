# Code Structure

Use this file immediately before writing the final Vue/Nuxt output.

## Vue SFC Order

Always place `<template>` before `<script setup lang="ts">`.

## Script Setup Order

1. Imports
2. Props
3. Emits
4. Reactive state
5. Computed values
6. Watchers
7. Lifecycle hooks
8. Functions

## Import Grouping

- Vue imports
- Pixel imports
- Local composables and utilities
- Local types

## Component Practices

- Use typed `defineProps` and `defineEmits` for reusable components.
- Keep handlers and state names explicit.
- Prefer small focused components over large nested files.
- Move non-view logic into composables when it outgrows the component.

## Delivery Expectations

- Output runnable Vue/Nuxt code, not pseudo-code.
- Include all required imports.
- Preserve project linting and formatting conventions.
