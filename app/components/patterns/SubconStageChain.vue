<script setup lang="ts">
/**
 * SubconStageChain — the five-node document-chain progress indicator for a subcon
 * order: BOM & config → Component supply → Subcon PR → Goods receipt → Closed.
 *
 * Node states:
 *   • done      — the stage is behind the order (filled, check-coloured)
 *   • current   — where the order is sitting right now (outlined, emphasised)
 *   • upcoming  — not reached yet (muted)
 *   • skipped   — not applicable to this configuration. Component supply is
 *     skipped on a `basic` order, where the vendor sources its own materials:
 *     drawn dashed rather than hidden, so every row's chain stays column-aligned
 *     and the reader can see *why* a step is absent.
 *
 * Read-only: the chain reports state, it is not a navigation control.
 */
import { MpIcon, MpTooltip } from '@mekari/pixel3'
import { SUBCON_STAGES, type SubconMethod, type SubconStage } from '~/data/subcon'

const props = defineProps<{
  stage: SubconStage
  method: SubconMethod
}>()

const { t } = useLocale()

type NodeState = 'done' | 'current' | 'upcoming' | 'skipped'

const nodes = computed(() =>
  SUBCON_STAGES.map((s) => {
    // A basic order never has a component-supply step — the vendor sources its own.
    const skipped = s.stage === 2 && props.method === 'basic'
    const state: NodeState = skipped
      ? 'skipped'
      : s.stage < props.stage ? 'done'
      : s.stage === props.stage ? 'current'
      : 'upcoming'
    return {
      ...s,
      state,
      /** Link into the *next* node — the last node has none. */
      linkDone: s.stage < props.stage,
      showLink: s.stage < SUBCON_STAGES.length,
      label: skipped
        ? t('Component supply — not applicable (Basic: the vendor sources its own materials)')
        : t(s.name),
    }
  }),
)
</script>

<template>
  <div class="stage-chain" role="img" :aria-label="t('Document chain progress')">
    <template v-for="n in nodes" :key="n.stage">
      <MpTooltip :label="n.label" placement="top" use-portal>
        <span class="stage-chain__node" :class="`stage-chain__node--${n.state}`">
          <MpIcon :name="n.state === 'done' ? 'check' : n.icon" size="sm" />
        </span>
      </MpTooltip>
      <span
        v-if="n.showLink"
        class="stage-chain__link"
        :class="{ 'stage-chain__link--done': n.linkDone }"
        aria-hidden="true"
      />
    </template>
  </div>
</template>

<style scoped>
.stage-chain {
  display: inline-flex;
  align-items: center;
}

.stage-chain__node {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--mp-sizes-6, 24px);
  height: var(--mp-sizes-6, 24px);
  border-radius: var(--mp-radii-full, 999px);
}

/* Behind the order — settled, positive. */
.stage-chain__node--done {
  background: var(--mp-background-success-subtle, #e8f4ef);
  color: var(--mp-text-success, #18794e);
}

/* Where the order is now — the only emphasised node in the row. */
.stage-chain__node--current {
  background: var(--mp-background-warning-subtle, #fffaea);
  color: var(--mp-text-warning, #b54708);
  outline: var(--mp-border-width-lg, 2px) solid var(--mp-border-warning, #e46910);
}

/* Not reached yet. */
.stage-chain__node--upcoming {
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
}

/* Not part of this configuration at all. */
.stage-chain__node--skipped {
  background: var(--mp-background-default, #fff);
  border: 1px dashed var(--mp-border-bold);
  color: var(--mp-text-subtle, #75808f);
}

.stage-chain__link {
  flex: none;
  width: var(--mp-spacing-3\.5, 14px);
  height: var(--mp-border-width-lg, 2px);
  background: var(--mp-border-default);
}
.stage-chain__link--done { background: var(--mp-border-success, var(--mp-text-success, #18794e)); }
</style>
