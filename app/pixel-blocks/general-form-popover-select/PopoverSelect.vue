<template>
  <MpFormControl
    id="priority-select"
    data-pixel-block="popover-select"
    :class="css({ w: '280px' })"
  >
    <MpFormLabel>Priority</MpFormLabel>
    <div ref="rootRef" :class="css({ position: 'relative', w: 'full' })">
      <MpPopover
        id="priority-select"
        is-manual
        is-adaptive-width
        :is-open="isOpen"
        placement="bottom-start"
        @close="isOpen = false"
      >
        <MpPopoverTrigger>
          <div
            :class="css({ position: 'relative', display: 'flex', alignItems: 'center', w: 'full' })"
            @mouseenter="isHovered = true"
            @mouseleave="isHovered = false"
          >
            <div
              role="combobox"
              :aria-expanded="isOpen"
              :tabindex="0"
              :class="
                css({
                  minW: '22',
                  w: 'full',
                  h: '9.5',
                  pl: '3',
                  pr: '2.75rem',
                  py: '2',
                  display: 'flex',
                  alignItems: 'center',
                  outline: '0',
                  borderWidth: '1px',
                  borderRadius: 'md',
                  appearance: 'none',
                  transition: 'all 250ms',
                  cursor: 'pointer',
                  userSelect: 'none',
                  bg: 'background.neutral',
                  borderColor: isOpen ? 'border.focused' : 'border.form',
                  boxShadow: isOpen ? 'focus' : 'none',
                  color: selected ? 'text.default' : 'text.placeholder',
                  _hover: { bg: 'background.neutral.hovered' },
                  _focusVisible: { borderColor: 'border.focused', boxShadow: 'focus' },
                })
              "
              @click="isOpen = !isOpen"
              @keydown.enter.prevent="isOpen = !isOpen"
              @keydown.space.prevent="isOpen = !isOpen"
              @keydown.escape="isOpen = false"
            >
              <MpFlex v-if="selected" alignItems="center" gap="2">
                <MpIcon
                  :name="selected.iconName as any"
                  size="sm"
                  :class="css({ color: selected.iconColor })"
                />
                {{ selected.label }}
              </MpFlex>
              <template v-else>Select priority</template>
            </div>

            <button
              v-if="priority && isHovered"
              type="button"
              :class="
                css({
                  position: 'absolute',
                  right: '40px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  w: '5',
                  h: '5',
                  p: '0',
                  border: 'none',
                  bg: 'transparent',
                  color: 'icon.default',
                  cursor: 'pointer',
                  _hover: { color: 'icon.subtle' },
                })
              "
              @click.stop="clear"
            >
              <MpIcon name="reset" size="sm" />
            </button>

            <MpIcon
              name="chevrons-down"
              size="sm"
              :class="
                css({
                  position: 'absolute',
                  right: '2',
                  w: '6',
                  h: '6',
                  pointerEvents: 'none',
                  transition: 'transform 0.2s',
                  transform: isOpen ? 'rotate(-180deg)' : 'rotate(0deg)',
                  color: 'icon.default',
                })
              "
            />
          </div>
        </MpPopoverTrigger>

        <MpPopoverContent :class="css({ maxHeight: '300px', overflowY: 'auto' })">
          <MpPopoverList>
            <MpPopoverListItem
              v-for="option in options"
              :key="option.value"
              :is-active="option.value === priority"
              @click="select(option.value)"
            >
              <MpFlex alignItems="center" gap="2">
                <MpIcon
                  :name="option.iconName as any"
                  size="sm"
                  :class="css({ color: option.iconColor })"
                />
                {{ option.label }}
              </MpFlex>
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>
  </MpFormControl>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  css,
  MpFormControl,
  MpFormLabel,
  MpFlex,
  MpIcon,
  MpPopover,
  MpPopoverTrigger,
  MpPopoverContent,
  MpPopoverList,
  MpPopoverListItem,
} from '@mekari/pixel3'
import { onClickOutside } from '@mekari/pixel3-utils'

const options = [
  { value: 'low', label: 'Low', iconName: 'priority-low', iconColor: 'icon.information' },
  { value: 'medium', label: 'Medium', iconName: 'priority-medium', iconColor: 'icon.success' },
  { value: 'high', label: 'High', iconName: 'priority-high', iconColor: 'icon.warning' },
  { value: 'critical', label: 'Critical', iconName: 'priority-high', iconColor: 'icon.danger' },
]

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const priority = ref<string | null>(null)
const isHovered = ref(false)

const selected = computed(() => options.find((o) => o.value === priority.value) ?? null)

onClickOutside(rootRef, () => {
  isOpen.value = false
})

function select(value: string) {
  priority.value = value
  isOpen.value = false
}

function clear() {
  priority.value = null
}
</script>
