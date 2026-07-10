<script setup lang="ts">
import { computed, ref } from 'vue'
import { isGateOnline } from '@/utils/gateControl'
import type { GateNodeControl } from '@/types/gateControl'

type DetailZone = 'up' | 'down' | null

const props = defineProps<{
  gates: GateNodeControl[]
  selectedGateId: number | null
  upstreamLevel: number
  downstreamLevel: number
  inflowRate: number
  outflowRate: number
}>()

const emit = defineEmits<{ select: [id: number] }>()

const detailPanel = ref<DetailZone>(null)

const sortedGates = computed(() => [...props.gates].sort((a, b) => a.id - b.id))

const head = computed(() => Math.max(0, props.upstreamLevel - props.downstreamLevel))

const openCount = computed(() =>
  sortedGates.value.filter((g) => isGateOnline(g.status) && g.currentOpening > 0).length,
)

function levelFillPct(level: number) {
  const lo = Math.min(props.upstreamLevel, props.downstreamLevel) - 20
  const hi = Math.max(props.upstreamLevel, props.downstreamLevel) + 20
  const span = Math.max(hi - lo, 40)
  const t = (level - lo) / span
  return Math.min(100, Math.max(6, t * 100))
}

const upFillPct = computed(() => levelFillPct(props.upstreamLevel))
const downFillPct = computed(() => levelFillPct(props.downstreamLevel))

function gateShortCode(code: string) {
  const m = code.match(/(\d+)/)
  return m ? m[1].padStart(2, '0') : code.slice(-2)
}

function togglePanel(zone: 'up' | 'down') {
  detailPanel.value = detailPanel.value === zone ? null : zone
}
</script>

<template>
  <div class="dam-section">
    <div class="dam-section__main">
      <div class="dam-side dam-side--left" :class="{ 'dam-side--expanded': detailPanel === 'up' }">
        <div class="dam-rail__meta" :class="{ 'is-active': detailPanel === 'up' }">
          <span class="dam-rail__label">上游</span>
          <div class="dam-rail__reading">
            <strong>{{ upstreamLevel.toFixed(1) }}</strong>
            <em>m</em>
          </div>
        </div>
        <div class="dam-side__viz">
          <button
            type="button"
            class="dam-rail"
            :class="{ active: detailPanel === 'up' }"
            @click="togglePanel('up')"
          >
            <div class="dam-rail__gauge-wrap">
              <div class="dam-rail__gauge">
                <div class="dam-rail__fill" :style="{ height: `${upFillPct}%` }" />
              </div>
            </div>
            <div class="dam-rail__foot" aria-hidden="true" />
          </button>
        </div>

        <div v-show="detailPanel === 'up'" class="dam-detail-strip">
          <div class="dam-detail-strip__item">
            <span>坝前水位</span>
            <strong>{{ upstreamLevel.toFixed(1) }} m</strong>
          </div>
          <div class="dam-detail-strip__item">
            <span>入库流量</span>
            <strong>{{ inflowRate.toFixed(1) }} m³/s</strong>
          </div>
          <div class="dam-detail-strip__item">
            <span>水头差</span>
            <strong>{{ head.toFixed(1) }} m</strong>
          </div>
        </div>
      </div>

      <div class="dam-gates">
        <div class="dam-section__legend">
          <span class="dam-legend__item">
            <i class="dam-legend__swatch dam-legend__swatch--cur" />
            实际
          </span>
          <span class="dam-legend__item">
            <i class="dam-legend__swatch dam-legend__swatch--tgt" />
            预测
          </span>
        </div>

        <div
          class="dam-gates__grid"
          :style="{ gridTemplateColumns: `repeat(${sortedGates.length}, minmax(0, 1fr))` }"
        >
          <button
            v-for="g in sortedGates"
            :key="g.id"
            type="button"
            class="gate-col"
            :class="{
              active: selectedGateId === g.id,
              offline: !isGateOnline(g.status),
            }"
            @click="emit('select', g.id)"
          >
            <div class="gate-col__inner">
              <div class="gate-col__slot">
                <div class="gate-col__waterbox">
                  <div
                    v-if="isGateOnline(g.status)"
                    class="gate-col__water gate-col__water--tgt"
                    :style="{ height: `${g.targetOpening}%` }"
                  />
                  <div
                    v-if="isGateOnline(g.status) && g.currentOpening > 0"
                    class="gate-col__water gate-col__water--cur"
                    :style="{ height: `${g.currentOpening}%` }"
                  />
                  <div
                    v-if="isGateOnline(g.status)"
                    class="gate-col__leaf"
                    :style="{ height: `${100 - g.currentOpening}%` }"
                  />
                </div>
              </div>

              <div class="gate-col__pillar">
                <span class="gate-col__code">{{ gateShortCode(g.code) }}</span>
                <div class="gate-col__pill">
                  <div
                    v-if="isGateOnline(g.status)"
                    class="gate-col__pill-bar gate-col__pill-bar--tgt"
                    :style="{ height: `${g.targetOpening}%` }"
                  />
                  <div
                    v-if="isGateOnline(g.status) && g.currentOpening > 0"
                    class="gate-col__pill-bar gate-col__pill-bar--cur"
                    :style="{ height: `${g.currentOpening}%` }"
                  />
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      <div class="dam-side dam-side--right" :class="{ 'dam-side--expanded': detailPanel === 'down' }">
        <div class="dam-rail__meta" :class="{ 'is-active': detailPanel === 'down' }">
          <span class="dam-rail__label">下游</span>
          <div class="dam-rail__reading">
            <strong>{{ downstreamLevel.toFixed(1) }}</strong>
            <em>m</em>
          </div>
        </div>
        <div class="dam-side__viz">
          <button
            type="button"
            class="dam-rail"
            :class="{ active: detailPanel === 'down' }"
            @click="togglePanel('down')"
          >
            <div class="dam-rail__gauge-wrap">
              <div class="dam-rail__gauge">
                <div class="dam-rail__fill" :style="{ height: `${downFillPct}%` }" />
              </div>
            </div>
            <div class="dam-rail__foot" aria-hidden="true" />
          </button>
        </div>

        <div v-show="detailPanel === 'down'" class="dam-detail-strip">
          <div class="dam-detail-strip__item">
            <span>尾水位</span>
            <strong>{{ downstreamLevel.toFixed(1) }} m</strong>
          </div>
          <div class="dam-detail-strip__item">
            <span>出库流量</span>
            <strong>{{ outflowRate.toFixed(0) }} m³/s</strong>
          </div>
          <div class="dam-detail-strip__item">
            <span>开启孔数</span>
            <strong>{{ openCount }} 孔</strong>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/design-tokens.scss' as *;

$color-actual: #40a9ff;
$color-predict: rgba(145, 213, 255, 0.55);
$color-select: #69c0ff;
$divider: #e8eaed;
$bar-w: 28px;
$pill-h: 44px;
$pillar-foot-h: calc(#{$pill-h} + 15px);

.dam-section {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #fff;
  overflow: hidden;
}

.dam-section__main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 0;
  padding: 22px 18px 18px;
}

.dam-side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  width: 100px;
  flex-shrink: 0;

  &--left {
    padding-right: 18px;
    border-right: 1px solid $divider;
  }

  &--right {
    padding-left: 18px;
    border-left: 1px solid $divider;
  }

  &--expanded {
    width: 136px;
  }

  &__viz {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
}

.dam-rail__meta {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-bottom: 10px;
  text-align: center;

  &.is-active .dam-rail__label {
    color: $color-actual;
  }
}

.dam-rail {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 4px 0;
  border: none;
  cursor: pointer;
  background: transparent;

  &__label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #94a3b8;
  }

  &__reading {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 3px;
    line-height: 1.2;

    strong {
      font-size: 18px;
      font-weight: 700;
      font-family: 'SF Mono', Consolas, monospace;
      color: #1e293b;
    }

    em {
      font-style: normal;
      font-size: 12px;
      color: #94a3b8;
    }
  }

  &__gauge-wrap {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  &__gauge {
    width: $bar-w;
    height: 100%;
    border-radius: 4px;
    background: #f0f9ff;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }

  &__fill {
    width: 100%;
    border-radius: 3px 3px 0 0;
    background: $color-actual;
  }

  &__foot {
    flex-shrink: 0;
    width: 100%;
    height: $pillar-foot-h;
  }
}

.dam-detail-strip {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 4px 0;
  flex-shrink: 0;

  &__item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    line-height: 1.3;

    span {
      color: #64748b;
      white-space: nowrap;
      font-weight: 500;
    }

    strong {
      font-family: 'SF Mono', Consolas, monospace;
      font-weight: 700;
      font-size: 15px;
      color: #1e293b;
      white-space: nowrap;
    }
  }
}

.dam-gates {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 22px;
}

.dam-section__legend {
  position: absolute;
  top: 0;
  right: 22px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 11px;
  color: #64748b;
  line-height: 1;
}

.dam-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.dam-legend__swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  flex-shrink: 0;

  &--cur {
    background: $color-actual;
  }

  &--tgt {
    background: $color-predict;
  }
}

.dam-gates__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 12px;
  align-items: stretch;
  padding-top: 28px;
}

.gate-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;

  &.active .gate-col__inner {
    outline: 1.5px solid $color-select;
    outline-offset: 2px;
    border-radius: 6px;

    .gate-col__code {
      color: $color-actual;
      font-weight: 700;
    }
  }

  &.offline {
    opacity: 0.36;
    cursor: default;
  }

  &__inner {
    width: $bar-w;
    height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  &__slot {
    flex: 1;
    min-height: 0;
    width: $bar-w;
    overflow: hidden;
  }

  &__waterbox {
    position: relative;
    width: $bar-w;
    height: 100%;
    margin: 0 auto;
    border-radius: 4px;
    overflow: hidden;
    background: #f0f9ff;
  }

  &__water {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 3px 3px 0 0;

    &--cur {
      z-index: 2;
      background: $color-actual;
    }

    &--tgt {
      z-index: 1;
      background: $color-predict;
    }
  }

  &__leaf {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3;
    background: #f0f9ff;
    pointer-events: none;
  }

  &__pillar {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: $bar-w;
  }

  &__code {
    width: 100%;
    font-size: 12px;
    font-family: Consolas, monospace;
    color: #64748b;
    text-align: center;
    line-height: 1;
  }

  &__pill {
    width: $bar-w;
    height: $pill-h;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 4px;
  }

  &__pill-bar {
    flex: 1;
    max-width: 12px;
    min-width: 0;
    align-self: flex-end;
    border-radius: 2px 2px 0 0;

    &--cur {
      background: $color-actual;
    }

    &--tgt {
      background: $color-predict;
    }
  }
}
</style>
