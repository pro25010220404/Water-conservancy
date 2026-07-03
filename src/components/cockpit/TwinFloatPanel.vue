<script setup lang="ts">
defineProps<{
  title: string
  side?: 'left' | 'right'
}>()
</script>

<template>
  <div class="twin-panel" :class="`twin-panel--${side ?? 'left'}`">
    <div class="twin-panel__corner twin-panel__corner--tl" />
    <div class="twin-panel__corner twin-panel__corner--tr" />
    <div class="twin-panel__corner twin-panel__corner--bl" />
    <div class="twin-panel__corner twin-panel__corner--br" />
    <header class="twin-panel__head">
      <span class="twin-panel__bar" />
      {{ title }}
    </header>
    <div class="twin-panel__body">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.twin-panel {
  position: relative;
  background: linear-gradient(135deg, rgba(6, 18, 36, 0.88) 0%, rgba(10, 28, 52, 0.82) 100%);
  border: 1px solid rgba(0, 180, 255, 0.35);
  box-shadow:
    0 0 24px rgba(0, 120, 255, 0.12),
    inset 0 0 30px rgba(0, 80, 160, 0.08);
  backdrop-filter: blur(14px);
  border-radius: 4px;
  pointer-events: auto;

  &__corner {
    position: absolute;
    width: 12px;
    height: 12px;
    border-color: #00d4ff;
    border-style: solid;
    opacity: 0.85;

    &--tl { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
    &--tr { top: -1px; right: -1px; border-width: 2px 2px 0 0; }
    &--bl { bottom: -1px; left: -1px; border-width: 0 0 2px 2px; }
    &--br { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 8px;
    font-size: 13px;
    font-weight: 700;
    color: #7efcff;
    letter-spacing: 0.08em;
    border-bottom: 1px solid rgba(0, 180, 255, 0.2);
  }

  &__bar {
    width: 3px;
    height: 14px;
    background: linear-gradient(180deg, #00d4ff, #1890ff);
    border-radius: 2px;
    box-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
  }

  &__body {
    padding: 12px 14px 14px;
    color: rgba(220, 235, 255, 0.92);
    font-size: 12px;
  }
}
</style>
