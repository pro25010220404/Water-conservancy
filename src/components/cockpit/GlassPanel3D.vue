<script setup lang="ts">

defineProps<{
  title?: string
  variant?: 'default' | 'danger' | 'success' | 'warning'
  compact?: boolean
  large?: boolean
  /** cyber = 全息 HUD 深色面板 */
  theme?: 'light' | 'dark' | 'cyber'
}>()

</script>

<template>
  <div
    class="glass-panel"
    :class="[
      variant ? `glass-panel--${variant}` : '',
      theme === 'dark' ? 'glass-panel--dark' : '',
      theme === 'cyber' ? 'glass-panel--cyber' : '',
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

  &--dark,
  &--cyber {
    @include glass-panel-dark;

    .glass-panel__header {
      border-bottom-color: rgba(56, 140, 255, 0.14);
      background: linear-gradient(90deg, rgba(24, 120, 220, 0.14) 0%, transparent 100%);
    }

    .glass-panel__deco {
      background: linear-gradient(180deg, #40a0ff, rgba(24, 144, 255, 0.15));
      box-shadow: 0 0 10px rgba(24, 144, 255, 0.45);
    }

    .glass-panel__title {
      @include neon-text-blue;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    &::before,
    &::after {
      border-color: rgba(56, 160, 255, 0.4);
    }
  }

  &--cyber {
    @include glass-panel-cyber;
  }

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

  &:hover .glass-panel__deco {
    box-shadow: 0 0 14px rgba(24, 144, 255, 0.55);
    transform: scaleY(1.08);
  }

  &__deco {
    transition: box-shadow 0.25s ease, transform 0.25s ease;
  }
}
</style>
