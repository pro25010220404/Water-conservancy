<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElEmpty, ElTag } from 'element-plus'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import {
  SIMULATION_SCENE_MAP, MODEL_STATUS_MAP, REVIEW_STATUS_MAP, SIMULATION_TABS,
  type SimulationTab,
} from '@/constants/simulation'
import type {
  SimulationScene, SimulationRealtimeData,
  AiModel, SimulationReport, FaultReview,
} from '@/types/simulation'

const props = defineProps<{
  activeTab: SimulationTab
  simScene: SimulationScene
  simStatus: SimulationRealtimeData
  models: AiModel[]
  reports: SimulationReport[]
  reviews: FaultReview[]
  modelLoading?: boolean
  reportLoading?: boolean
  reviewLoading?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  'tab-change': [tab: SimulationTab]
  activate: [id: number]
  upload: []
  train: [modelId: number]
  generate: []
  'open-review': [id: number]
  'import-review': [id: number]
}>()

const tabTitle = computed(() => SIMULATION_TABS.find((t) => t.value === props.activeTab)?.label ?? '')
const sceneInfo = computed(() => SIMULATION_SCENE_MAP[props.simScene])

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div class="sim-tab-panel" :class="{ 'sim-tab-panel--compact': compact }">
    <div class="sim-tab-panel__tabs">
      <button
        v-for="t in SIMULATION_TABS"
        :key="t.value"
        type="button"
        class="sim-tab-panel__tab"
        :class="{ active: activeTab === t.value }"
        @click="emit('tab-change', t.value)"
      >
        {{ t.label }}
      </button>
    </div>
    <GlassPanel3D v-if="!compact" :title="tabTitle" large>
      <template v-if="activeTab === 'control'">
        <div class="scene-brief">
          <h4>{{ sceneInfo?.label }}</h4>
          <p>{{ sceneInfo?.description }}</p>
        </div>
        <dl class="summary-list">
          <div class="summary-list__row">
            <dt>仿真时长</dt>
            <dd>{{ formatDuration(simStatus.elapsedSec) }}</dd>
          </div>
          <div class="summary-list__row">
            <dt>当前水位</dt>
            <dd>{{ simStatus.currentLevel.toFixed(2) }} m</dd>
          </div>
          <div class="summary-list__row">
            <dt>当前流量</dt>
            <dd>{{ simStatus.currentFlow }} m³/s</dd>
          </div>
          <div class="summary-list__row">
            <dt>闸门开度</dt>
            <dd>{{ simStatus.currentOpening }}%</dd>
          </div>
        </dl>
        <div v-if="simStatus.historyLevels.length" class="history-block">
          <h5>水位变化（最近）</h5>
          <ul class="history-list">
            <li v-for="(p, i) in simStatus.historyLevels.slice(-5)" :key="i">
              T+{{ p.time }}s · {{ p.value.toFixed(2) }} m
            </li>
          </ul>
        </div>
        <p v-else class="hint-text">启动仿真后，此处显示运行摘要与历史曲线采样。</p>
      </template>

      <template v-else-if="activeTab === 'model'">
        <div class="panel-actions">
          <ElButton type="primary" @click="emit('upload')">导入模型</ElButton>
        </div>
        <ElEmpty v-if="!models.length && !modelLoading" description="暂无模型，请先导入" />
        <ul v-else class="entity-list">
          <li v-for="m in models" :key="m.id" class="entity-list__item">
            <div class="entity-list__main">
              <strong>{{ m.type }} {{ m.version }}</strong>
              <ElTag :color="MODEL_STATUS_MAP[m.status]?.color" effect="dark">
                {{ MODEL_STATUS_MAP[m.status]?.label }}
              </ElTag>
            </div>
            <div class="entity-list__meta">{{ m.createdAt }}</div>
            <div class="entity-list__actions">
              <ElButton v-if="m.status !== 'active'" link type="primary" @click="emit('activate', m.id)">激活</ElButton>
              <ElButton link type="primary" @click="emit('train', m.id)">训练</ElButton>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="activeTab === 'report'">
        <div class="panel-actions">
          <ElButton type="primary" @click="emit('generate')">生成报告</ElButton>
        </div>
        <ElEmpty v-if="!reports.length && !reportLoading" description="暂无评估报告" />
        <ul v-else class="entity-list">
          <li v-for="r in reports" :key="r.id" class="entity-list__item">
            <div class="entity-list__main">
              <strong>{{ SIMULATION_SCENE_MAP[r.scene]?.label ?? r.scene }}</strong>
              <span class="entity-list__tag">最高 {{ r.summary.maxLevel.toFixed(2) }} m</span>
            </div>
            <div class="entity-list__meta">{{ r.createdAt }} · {{ r.operatorName }}</div>
            <p class="entity-list__desc">{{ r.content }}</p>
          </li>
        </ul>
      </template>

      <template v-else>
        <ElEmpty v-if="!reviews.length && !reviewLoading" description="暂无故障复盘记录" />
        <ul v-else class="entity-list">
          <li v-for="r in reviews" :key="r.id" class="entity-list__item">
            <div class="entity-list__main">
              <strong>{{ r.faultType }}</strong>
              <ElTag :color="REVIEW_STATUS_MAP[r.status]?.color" effect="dark">
                {{ REVIEW_STATUS_MAP[r.status]?.label }}
              </ElTag>
            </div>
            <div class="entity-list__meta">{{ r.impactScope }} · {{ r.createdAt }}</div>
            <div class="entity-list__actions">
              <ElButton link type="primary" @click="emit('open-review', r.id)">详情</ElButton>
              <ElButton link type="primary" @click="emit('import-review', r.id)">导入仿真</ElButton>
            </div>
          </li>
        </ul>
      </template>
    </GlassPanel3D>
    <div v-else class="sim-tab-panel__compact-body">
      <template v-if="activeTab === 'control'">
        <div class="scene-brief">
          <h4>{{ sceneInfo?.label }}</h4>
          <p>{{ sceneInfo?.description }}</p>
        </div>
        <dl class="summary-list">
          <div class="summary-list__row">
            <dt>仿真时长</dt>
            <dd>{{ formatDuration(simStatus.elapsedSec) }}</dd>
          </div>
          <div class="summary-list__row">
            <dt>当前水位</dt>
            <dd>{{ simStatus.currentLevel.toFixed(2) }} m</dd>
          </div>
          <div class="summary-list__row">
            <dt>当前流量</dt>
            <dd>{{ simStatus.currentFlow }} m³/s</dd>
          </div>
          <div class="summary-list__row">
            <dt>闸门开度</dt>
            <dd>{{ simStatus.currentOpening }}%</dd>
          </div>
        </dl>
        <div v-if="simStatus.historyLevels.length" class="history-block">
          <h5>水位变化（最近）</h5>
          <ul class="history-list">
            <li v-for="(p, i) in simStatus.historyLevels.slice(-5)" :key="i">
              T+{{ p.time }}s · {{ p.value.toFixed(2) }} m
            </li>
          </ul>
        </div>
        <p v-else class="hint-text">启动仿真后，此处显示运行摘要与历史曲线采样。</p>
      </template>

      <template v-else-if="activeTab === 'model'">
        <div class="panel-actions">
          <ElButton type="primary" @click="emit('upload')">导入模型</ElButton>
        </div>
        <ElEmpty v-if="!models.length && !modelLoading" description="暂无模型，请先导入" />
        <ul v-else class="entity-list">
          <li v-for="m in models" :key="m.id" class="entity-list__item">
            <div class="entity-list__main">
              <strong>{{ m.type }} {{ m.version }}</strong>
              <ElTag :color="MODEL_STATUS_MAP[m.status]?.color" effect="dark">
                {{ MODEL_STATUS_MAP[m.status]?.label }}
              </ElTag>
            </div>
            <div class="entity-list__meta">{{ m.createdAt }}</div>
            <div class="entity-list__actions">
              <ElButton v-if="m.status !== 'active'" link type="primary" @click="emit('activate', m.id)">激活</ElButton>
              <ElButton link type="primary" @click="emit('train', m.id)">训练</ElButton>
            </div>
          </li>
        </ul>
      </template>

      <template v-else-if="activeTab === 'report'">
        <div class="panel-actions">
          <ElButton type="primary" @click="emit('generate')">生成报告</ElButton>
        </div>
        <ElEmpty v-if="!reports.length && !reportLoading" description="暂无评估报告" />
        <ul v-else class="entity-list">
          <li v-for="r in reports" :key="r.id" class="entity-list__item">
            <div class="entity-list__main">
              <strong>{{ SIMULATION_SCENE_MAP[r.scene]?.label ?? r.scene }}</strong>
              <span class="entity-list__tag">最高 {{ r.summary.maxLevel.toFixed(2) }} m</span>
            </div>
            <div class="entity-list__meta">{{ r.createdAt }} · {{ r.operatorName }}</div>
            <p class="entity-list__desc">{{ r.content }}</p>
          </li>
        </ul>
      </template>

      <template v-else>
        <ElEmpty v-if="!reviews.length && !reviewLoading" description="暂无故障复盘记录" />
        <ul v-else class="entity-list">
          <li v-for="r in reviews" :key="r.id" class="entity-list__item">
            <div class="entity-list__main">
              <strong>{{ r.faultType }}</strong>
              <ElTag :color="REVIEW_STATUS_MAP[r.status]?.color" effect="dark">
                {{ REVIEW_STATUS_MAP[r.status]?.label }}
              </ElTag>
            </div>
            <div class="entity-list__meta">{{ r.impactScope }} · {{ r.createdAt }}</div>
            <div class="entity-list__actions">
              <ElButton link type="primary" @click="emit('open-review', r.id)">详情</ElButton>
              <ElButton link type="primary" @click="emit('import-review', r.id)">导入仿真</ElButton>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.sim-tab-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
    flex-shrink: 0;
  }

  &__tab {
    padding: 6px 12px;
    font-size: $cockpit-font-sm;
    font-weight: 600;
    color: $cockpit-text-dim;
    background: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(24, 144, 255, 0.18);
    border-radius: 8px;
    cursor: pointer;

    &.active {
      color: $cockpit-accent;
      background: #e6f4ff;
      border-color: $cockpit-accent;
    }
  }

  &--compact {
    .sim-tab-panel__tab {
      color: rgba(180, 210, 240, 0.75);
      background: rgba(0, 40, 70, 0.5);
      border-color: rgba(0, 180, 255, 0.25);

      &.active {
        color: #7efcff;
        background: rgba(0, 80, 140, 0.55);
        border-color: #00d4ff;
      }
    }

    .sim-tab-panel__compact-body {
      max-height: 220px;
      overflow-y: auto;
      font-size: 12px;
      color: rgba(210, 230, 255, 0.9);
    }

    .scene-brief h4,
    .summary-list dd,
    .entity-list__main strong {
      color: #e8f4ff;
    }

    .scene-brief p,
    .summary-list dt,
    .entity-list__meta,
    .hint-text {
      color: rgba(160, 190, 220, 0.75);
    }
  }

  :deep(.glass-panel) {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :deep(.glass-panel__body) {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    font-size: $cockpit-font-base;
  }

  :deep(.el-button) {
    font-size: $cockpit-font-sm;
  }
}

.scene-brief {
  margin-bottom: var(--spacing-md);

  h4 {
    margin: 0 0 8px;
    font-size: $cockpit-font-lg;
    color: $cockpit-text;
  }

  p {
    margin: 0;
    font-size: $cockpit-font-base;
    color: $cockpit-text-dim;
    line-height: 1.55;
  }
}

.summary-list {
  margin: 0 0 var(--spacing-md);
  padding: 0;

  &__row {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid rgba(24, 144, 255, 0.1);
    font-size: $cockpit-font-base;
  }

  dt { color: $cockpit-text-dim; }
  dd { margin: 0; font-weight: 600; color: $cockpit-accent; @include data-value; font-size: $cockpit-font-lg; }
}

.history-block h5 {
  margin: 0 0 10px;
  font-size: $cockpit-font-sm;
  color: $cockpit-text-dim;
  font-weight: 600;
}

.history-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: $cockpit-font-base;
  color: $cockpit-text;

  li {
    padding: 6px 0;
    border-bottom: 1px dashed rgba(24, 144, 255, 0.08);
  }
}

.hint-text {
  margin: 0;
  font-size: $cockpit-font-base;
  color: $cockpit-text-dim;
  line-height: 1.55;
}

.panel-actions {
  margin-bottom: var(--spacing-md);
}

.entity-list {
  margin: 0;
  padding: 0;
  list-style: none;

  &__item {
    padding: 12px 0;
    border-bottom: 1px solid rgba(24, 144, 255, 0.1);
  }

  &__main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;

    strong { font-size: $cockpit-font-md; color: $cockpit-text; }
  }

  &__tag {
    font-size: $cockpit-font-sm;
    color: $cockpit-accent;
    font-weight: 600;
  }

  &__meta {
    font-size: $cockpit-font-sm;
    color: $cockpit-text-dim;
    margin-bottom: 6px;
  }

  &__desc {
    margin: 0;
    font-size: $cockpit-font-base;
    color: $cockpit-text-dim;
    line-height: 1.5;
  }

  &__actions {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }
}
</style>
