<script setup lang="ts">

defineProps<{

  title?: string

  variant?: 'default' | 'danger' | 'success' | 'warning'

  compact?: boolean

  large?: boolean

}>()

</script>



<template>

  <div

    class="glass-panel"

    :class="[

      variant ? `glass-panel--${variant}` : '',

      { 'glass-panel--compact': compact, 'glass-panel--large': large },

    ]"

  >

    <div v-if="title" class="glass-panel__header">

      <span class="glass-panel__deco" />

      <span class="glass-panel__title">{{ title }}</span>

      <div class="glass-panel__extra"><slot name="extra" /></div>

    </div>

    <div class="glass-panel__body"><slot /></div>

  </div>

</template>



<style scoped lang="scss">

@use '@/assets/styles/cockpit.scss' as *;



.glass-panel {

  @include glass-panel-3d;

  @include hud-corner;

  position: relative;
  overflow: visible;
  flex-shrink: 0;



  &--danger {

    border-color: rgba(239, 68, 68, 0.35);

    background: linear-gradient(145deg, rgba(255, 251, 251, 0.98) 0%, rgba(254, 242, 242, 0.9) 100%);

  }



  &--success {

    border-color: rgba(34, 197, 94, 0.35);

    background: linear-gradient(145deg, rgba(247, 254, 249, 0.98) 0%, rgba(240, 253, 244, 0.9) 100%);

  }



  &--warning {

    border-color: rgba(245, 158, 11, 0.35);

    background: linear-gradient(145deg, rgba(255, 253, 247, 0.98) 0%, rgba(254, 249, 235, 0.9) 100%);

  }



  &--compact .glass-panel__header { padding: 10px 14px; }

  &--compact .glass-panel__body { padding: 12px 14px; }

  &--large .glass-panel__title { font-size: 20px; }

  &--large .glass-panel__body { padding: 18px 20px; }



  &__header {

    display: flex;

    align-items: center;

    gap: 10px;

    padding: 14px 18px;

    border-bottom: 1px solid rgba(24, 144, 255, 0.12);

    background: linear-gradient(90deg, rgba(24, 144, 255, 0.06) 0%, transparent 100%);

  }



  &__deco {

    width: 4px;

    height: 18px;

    background: linear-gradient(180deg, $cockpit-accent, rgba(24, 144, 255, 0.2));

    border-radius: 2px;

  }



  &__title {

    font-size: 18px;

    font-weight: 600;

    letter-spacing: 0.5px;

    color: $cockpit-text;

  }



  &__extra { margin-left: auto; }

  &__body { padding: 16px 18px; overflow: visible; font-size: 16px; }

}

</style>


