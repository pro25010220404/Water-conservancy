<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import ThreeDamScene from '@/components/cockpit/ThreeDamScene.vue'
import {
  SIMULATION_SCENE_OPTIONS,
  SIMULATION_SCENE_MAP,
  SPEED_OPTIONS,
} from '@/constants/simulation'
import type { SimulationScene, SimulationSpeed, SimulationRealtimeData } from '@/types/simulation'

const props = defineProps<{
  visible: boolean
  waterLevel: number
  downstreamLevel: number
  gateOpening: number
  flowRate: number
  simScene: SimulationScene
  simSpeed: SimulationSpeed
  simStatus: SimulationRealtimeData
  canStart: boolean
  canPause: boolean
  elapsedLabel: string
  sceneLabel: string
  statusLabel: string
  statusColor: string
  levelStatusColor: string
  levelStatusLabel: string
  /** 调度方案预览 — 仅展示 3D，隐藏仿真控制 */
  preview?: boolean
  previewPlanName?: string
  previewSafetyScore?: number
}>()

const emit = defineEmits<{
  close: []
  start: []
  pause: []
  reset: []
  'update:simScene': [scene: SimulationScene]
  'update:simSpeed': [speed: SimulationSpeed]
  'update:gateOpening': [opening: number]
}>()

const sceneRef = ref<InstanceType<typeof ThreeDamScene> | null>(null)
const sceneInfo = computed(() => SIMULATION_SCENE_MAP[props.simScene])
const simActive = computed(
  () =>
    props.simStatus.status === 'running' ||
    props.simStatus.status === 'paused' ||
    props.simStatus.status === 'finished',
)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) emit('close')
}

watch(
  () => props.visible,
  (v) => {
    document.body.style.overflow = v ? 'hidden' : ''
    if (v && simActive.value) {
      setTimeout(() => sceneRef.value?.focusSimulationView(), 600)
    }
  },
)

watch(
  () => props.simStatus.status,
  (status) => {
    if (props.visible && (status === 'running' || status === 'paused')) {
      setTimeout(() => sceneRef.value?.focusSimulationView(), 400)
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})

defineExpose({ focusSimulationView: () => sceneRef.value?.focusSimulationView() })
</script>

<template>
  <Teleport to="body">
    <Transition name="panorama-fade">
      <div
        v-if="visible"
        class="sim-modal"
        :class="{ 'sim-modal--running': simStatus.status === 'running' }"
        role="dialog"
        aria-modal="true"
        aria-label="向家坝 BIM 预览"
      >
        <div class="sim-modal__backdrop" @click="emit('close')" />

        <div class="sim-modal__panel">
          <!-- 左侧：仿真控制 / 方案预览 -->
          <aside class="sim-modal__sidebar">
            <div class="sim-modal__sidebar-head">
              <h2>{{ preview ? '方案 BIM 预览' : '仿真推演' }}</h2>
              <span class="sim-modal__status" :style="{ color: statusColor }">
                {{ preview ? '调度预览' : statusLabel }}
              </span>
            </div>

            <template v-if="preview">
              <div class="sim-modal__scene-brief">
                <h3>{{ previewPlanName || '当前方案' }}</h3>
                <p>基于 AI 调度方案预览闸门开度与上下游水位效果</p>
              </div>

              <div class="sim-modal__kpis">
                <div class="sim-modal__kpi">
                  <small>方案开度</small>
                  <strong>{{ gateOpening }}%</strong>
                </div>
                <div class="sim-modal__kpi">
                  <small>预期上游水位</small>
                  <strong :style="{ color: levelStatusColor }"
                    >{{ waterLevel.toFixed(2) }} m</strong
                  >
                  <em>{{ levelStatusLabel }}</em>
                </div>
                <div class="sim-modal__kpi">
                  <small>下游尾水</small>
                  <strong>{{ downstreamLevel.toFixed(2) }} m</strong>
                </div>
                <div class="sim-modal__kpi">
                  <small>入库流量</small>
                  <strong>{{ flowRate }} m³/s</strong>
                </div>
                <div v-if="previewSafetyScore != null" class="sim-modal__kpi">
                  <small>安全评分</small>
                  <strong :style="{ color: previewSafetyScore >= 90 ? '#22c55e' : '#f59e0b' }">
                    {{ previewSafetyScore }}
                  </strong>
                </div>
              </div>
              <p class="sim-modal__hint">拖动旋转视角 · 滚轮缩放 · Esc 关闭</p>
            </template>

            <template v-else>
              <div class="sim-modal__scene-brief">
                <h3>{{ sceneInfo?.label }}</h3>
                <p>{{ sceneInfo?.description }}</p>
              </div>

              <div class="sim-modal__field">
                <label>预设场景</label>
                <select
                  class="sim-modal__select"
                  :value="simScene"
                  :disabled="!canStart"
                  @change="
                    emit(
                      'update:simScene',
                      ($event.target as HTMLSelectElement).value as SimulationScene,
                    )
                  "
                >
                  <option v-for="s in SIMULATION_SCENE_OPTIONS" :key="s.value" :value="s.value">
                    {{ s.label }}
                  </option>
                </select>
              </div>

              <div class="sim-modal__field">
                <label>仿真倍速</label>
                <select
                  class="sim-modal__select"
                  :value="simSpeed"
                  :disabled="simStatus.status === 'running'"
                  @change="
                    emit(
                      'update:simSpeed',
                      Number(($event.target as HTMLSelectElement).value) as SimulationSpeed,
                    )
                  "
                >
                  <option v-for="s in SPEED_OPTIONS" :key="s.value" :value="s.value">
                    {{ s.label }}
                  </option>
                </select>
              </div>

              <div class="sim-modal__field">
                <label>闸门开度 {{ gateOpening }}%</label>
                <input
                  type="range"
                  class="sim-modal__slider"
                  min="0"
                  max="100"
                  step="1"
                  :value="gateOpening"
                  @input="
                    emit('update:gateOpening', Number(($event.target as HTMLInputElement).value))
                  "
                />
              </div>

              <div class="sim-modal__actions">
                <button
                  type="button"
                  class="sim-modal__btn sim-modal__btn--primary"
                  :disabled="!canStart"
                  @click="emit('start')"
                >
                  开始仿真
                </button>
                <button
                  type="button"
                  class="sim-modal__btn"
                  :disabled="!canPause"
                  @click="emit('pause')"
                >
                  {{ simStatus.status === 'paused' ? '继续' : '暂停' }}
                </button>
                <button
                  type="button"
                  class="sim-modal__btn sim-modal__btn--ghost"
                  :disabled="simStatus.status === 'idle'"
                  @click="emit('reset')"
                >
                  重置
                </button>
              </div>

              <div class="sim-modal__kpis">
                <div class="sim-modal__kpi">
                  <small>仿真时间</small>
                  <strong>{{ elapsedLabel }}</strong>
                </div>
                <div class="sim-modal__kpi">
                  <small>上游水位</small>
                  <strong :style="{ color: levelStatusColor }"
                    >{{ waterLevel.toFixed(2) }} m</strong
                  >
                  <em>{{ levelStatusLabel }}</em>
                </div>
                <div class="sim-modal__kpi">
                  <small>下游尾水</small>
                  <strong>{{ downstreamLevel.toFixed(2) }} m</strong>
                </div>
                <div class="sim-modal__kpi">
                  <small>入库流量</small>
                  <strong>{{ flowRate }} m³/s</strong>
                </div>
                <div class="sim-modal__kpi">
                  <small>闸门开度</small>
                  <strong>{{ gateOpening }}%</strong>
                </div>
              </div>

              <div v-if="simStatus.historyLevels.length" class="sim-modal__history">
                <h4>水位变化（最近）</h4>
                <ul>
                  <li v-for="(p, i) in simStatus.historyLevels.slice(-6)" :key="i">
                    T+{{ p.time }}s · {{ p.value.toFixed(2) }} m
                  </li>
                </ul>
              </div>
              <p v-else class="sim-modal__hint">点击「开始仿真」后，左侧实时显示运行数据。</p>
            </template>
          </aside>

          <!-- 右侧：放大 3D 模型 -->
          <main class="sim-modal__viewport">
            <ThreeDamScene
              v-if="visible"
              ref="sceneRef"
              visual-mode="panorama"
              :water-level="waterLevel"
              :downstream-level="downstreamLevel"
              :gate-opening="gateOpening"
              :flow-rate="flowRate"
              :sim-scene="simScene"
              :sim-running="simActive"
              :auto-rotate="false"
            />
            <svg
              class="sim-modal__geo-lines"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="simModalGeoGrad" x1="0%" y1="100%" x2="100%" y2="30%">
                  <stop offset="0%" stop-color="rgba(24,144,255,0.85)" />
                  <stop offset="100%" stop-color="rgba(64,200,255,0.15)" />
                </linearGradient>
              </defs>
              <path
                class="sim-modal__geo-line"
                d="M 8 92 Q 22 72 38 58 T 62 44"
                fill="none"
                stroke="url(#simModalGeoGrad)"
                stroke-width="0.2"
              />
              <path
                class="sim-modal__geo-line sim-modal__geo-line--d2"
                d="M 8 92 Q 18 68 32 50 T 55 38"
                fill="none"
                stroke="url(#simModalGeoGrad)"
                stroke-width="0.15"
              />
            </svg>
            <button type="button" class="sim-modal__close" aria-label="关闭" @click="emit('close')">
              ✕
            </button>
          </main>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.sim-modal {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;

  &__backdrop {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    background: rgba(8, 12, 20, 0.45);
  }

  &__panel {
    position: relative;
    z-index: 1;
    display: flex;
    width: min(92vw, 1400px);
    height: min(88vh, 860px);
    pointer-events: auto;
    border-radius: 14px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 16px 64px rgba(0, 0, 0, 0.28);
    transform-origin: center center;
  }

  &--running &__panel {
    box-shadow:
      0 16px 64px rgba(0, 0, 0, 0.28),
      0 0 0 2px rgba(34, 197, 94, 0.35);
  }

  &__sidebar {
    flex: 0 0 300px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px 18px;
    background: linear-gradient(180deg, #f7fbff 0%, #eef6fc 100%);
    border-right: 1px solid rgba(24, 144, 255, 0.15);
    overflow-y: auto;
  }

  &__sidebar-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;

    h2 {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      color: #1e4976;
    }
  }

  &__status {
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid currentColor;
    opacity: 0.85;
  }

  &__scene-brief {
    h3 {
      margin: 0 0 4px;
      font-size: 14px;
      color: #1890ff;
    }

    p {
      margin: 0;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;

    label {
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
    }
  }

  &__select {
    padding: 8px 10px;
    font-size: 13px;
    font-weight: 600;
    color: #1e4976;
    background: #fff;
    border: 1px solid rgba(24, 144, 255, 0.25);
    border-radius: 8px;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__slider {
    width: 100%;
    accent-color: #1890ff;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__btn {
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #1890ff;
    background: rgba(230, 244, 255, 0.95);
    border: 1px solid rgba(24, 144, 255, 0.3);
    border-radius: 8px;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.2);
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    &--primary {
      color: #fff;
      background: linear-gradient(135deg, #1890ff, #096dd9);
      border-color: transparent;
    }

    &--ghost {
      background: transparent;
    }
  }

  &__kpis {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(24, 144, 255, 0.12);
  }

  &__kpi {
    small {
      display: block;
      font-size: 10px;
      color: #94a3b8;
    }

    strong {
      display: block;
      font-size: 15px;
      color: #1e4976;
      font-weight: 700;
    }

    em {
      display: block;
      font-size: 10px;
      font-style: normal;
      color: #64748b;
    }
  }

  &__history {
    h4 {
      margin: 0 0 6px;
      font-size: 12px;
      color: #64748b;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 11px;
      color: #475569;
      line-height: 1.7;
    }
  }

  &__hint {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
  }

  &__viewport {
    flex: 1;
    min-width: 0;
    position: relative;
    background: linear-gradient(180deg, #ffffff 0%, #f7fbff 50%, #eef6fc 100%);
  }

  &__geo-lines {
    position: absolute;
    inset: 0;
    z-index: 6;
    pointer-events: none;
    opacity: 0.6;
  }

  &__geo-line {
    stroke-dasharray: 6 10;
    animation: geo-line-flow 4s linear infinite;

    &--d2 {
      animation-delay: 0.8s;
      opacity: 0.65;
    }
  }

  &__close {
    position: absolute;
    top: 14px;
    right: 14px;
    z-index: 20;
    width: 36px;
    height: 36px;
    border: 1px solid rgba(64, 200, 255, 0.45);
    border-radius: 8px;
    background: rgba(6, 14, 28, 0.75);
    color: #7ec8ff;
    font-size: 16px;
    cursor: pointer;

    &:hover {
      background: rgba(24, 144, 255, 0.25);
    }
  }
}

.panorama-fade-enter-active .sim-modal__panel,
.panorama-fade-leave-active .sim-modal__panel {
  transition:
    opacity 0.38s ease,
    transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.panorama-fade-enter-active .sim-modal__backdrop,
.panorama-fade-leave-active .sim-modal__backdrop {
  transition: opacity 0.38s ease;
}

.panorama-fade-enter-from,
.panorama-fade-leave-to {
  .sim-modal__backdrop {
    opacity: 0;
  }
  .sim-modal__panel {
    opacity: 0;
    transform: scale(0.9);
  }
}

@keyframes geo-line-flow {
  0% {
    stroke-dashoffset: 0;
  }
  100% {
    stroke-dashoffset: -32;
  }
}
</style>
