<script setup lang="ts">
// ── 1. 外部依赖导入 ──
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import {
  ElMessage, ElMessageBox, ElDialog, ElForm, ElFormItem, ElInput,
  ElTimeline, ElTimelineItem, ElSlider, ElInputNumber, ElSelect, ElOption, ElTag,
} from 'element-plus'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import ThreeDamScene from '@/components/cockpit/ThreeDamScene.vue'
import TwinFloatPanel from '@/components/cockpit/TwinFloatPanel.vue'
import SimulationTabPanel from './components/SimulationTabPanel.vue'
import type {
  SimulationScene, SimulationSpeed, SimulationParams,
  SimulationRealtimeData, AiModel, SimulationReport, FaultReview, FaultConclusion,
} from '@/types/simulation'
import { XIANGJIABA_HYDRO, getLevelStatus, levelGaugePercent } from '@/constants/xiangjiaba'
import {
  SIMULATION_SCENE_OPTIONS, SIMULATION_SCENE_MAP,
  SIMULATION_STATUS_MAP, SPEED_OPTIONS, DEFAULT_SIMULATION_PARAMS, DEFAULT_TRAINING_CONFIG,
  type SimulationTab,
} from '@/constants/simulation'
import {
  startSimulation, pauseSimulation, resumeSimulation, resetSimulation, getSimulationStatus,
  getModelList, activateModel, uploadModel, startTraining, generateReport, getReportList,
  getFaultReviewList, getFaultReviewDetail, importToSimulation,
} from '@/api/simulation'

// ── 5. 响应式数据 ──
const activeTab = ref<SimulationTab>('control')
const simStatus = ref<SimulationRealtimeData>({
  status: 'idle', elapsedSec: 0,
  currentLevel: XIANGJIABA_HYDRO.normalPoolLevel,
  currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
  currentFlow: XIANGJIABA_HYDRO.normalInflow, currentOpening: 45,
  historyLevels: [], historyFlows: [],
})
const simParams = reactive<SimulationParams>({
  scene: 'normal', ...DEFAULT_SIMULATION_PARAMS,
  initialLevel: XIANGJIABA_HYDRO.normalPoolLevel,
  inflowRate: XIANGJIABA_HYDRO.normalInflow,
})
const simScene = ref<SimulationScene>('normal')
const simSpeed = ref<SimulationSpeed>(1)
const gateOpening = ref(45)

const models = ref<AiModel[]>([])
const reports = ref<SimulationReport[]>([])
const reviews = ref<FaultReview[]>([])
const modelLoading = ref(false)
const reportLoading = ref(false)
const reviewLoading = ref(false)

const reviewDetailVisible = ref(false)
const reviewDetail = ref<FaultReview | null>(null)
const reviewConclusion = reactive<FaultConclusion>({
  rootCause: '', improvements: '', responsibleDept: '', reviewedBy: '', reviewedAt: '',
})

let pollTimer: ReturnType<typeof setInterval> | null = null

// ── 6. Computed ──
const waterLevel = computed(() => simStatus.value.currentLevel)
const downstreamLevel = computed(() => simStatus.value.currentDownstreamLevel)
const flowRate = computed(() => simStatus.value.currentFlow)
const levelStatus = computed(() => getLevelStatus(waterLevel.value))
const gaugePct = computed(() => levelGaugePercent(waterLevel.value))
const levelHistoryBars = computed(() => {
  const hist = simStatus.value.historyLevels.slice(-12)
  if (hist.length === 0) {
    return Array.from({ length: 12 }, (_, i) => ({
      h: 35 + Math.sin(i * 0.6) * 15,
      v: XIANGJIABA_HYDRO.normalPoolLevel,
    }))
  }
  const vals = hist.map((h) => h.value)
  const min = Math.min(...vals, XIANGJIABA_HYDRO.deadLevel)
  const max = Math.max(...vals, XIANGJIABA_HYDRO.crestElevation)
  const span = max - min || 1
  return hist.map((h) => ({ h: ((h.value - min) / span) * 70 + 18, v: h.value }))
})
const showParams = ref(false)
const elapsedLabel = computed(() => {
  const sec = simStatus.value.elapsedSec
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
const statusInfo = computed(() => SIMULATION_STATUS_MAP[simStatus.value.status])

// ── 9. 方法函数 ──
async function fetchSim() {
  try { simStatus.value = (await getSimulationStatus()).data } catch { /* */ }
}
async function fetchModels() {
  modelLoading.value = true
  try { models.value = (await getModelList()).data } catch { models.value = [] }
  finally { modelLoading.value = false }
}
async function fetchReports() {
  reportLoading.value = true
  try { reports.value = (await getReportList({ pageNum: 1, pageSize: 10 })).data.list } catch { reports.value = [] }
  finally { reportLoading.value = false }
}
async function fetchReviews() {
  reviewLoading.value = true
  try { reviews.value = (await getFaultReviewList({ pageNum: 1, pageSize: 10 })).data.list } catch { reviews.value = [] }
  finally { reviewLoading.value = false }
}

function onTabChange(tab: SimulationTab) {
  activeTab.value = tab
  if (tab === 'model') fetchModels()
  else if (tab === 'report') fetchReports()
  else if (tab === 'review') fetchReviews()
}

function onSceneChange(scene: SimulationScene) {
  simScene.value = scene
  simParams.scene = scene
}

async function handleStartSim() {
  try {
    await startSimulation({ ...simParams, scene: simScene.value })
    ElMessage.success('仿真已启动')
    fetchSim()
  } catch { ElMessage.error('启动失败') }
}
async function handlePauseSim() { try { await pauseSimulation(); fetchSim() } catch { /* */ } }
async function handleResumeSim() { try { await resumeSimulation(); fetchSim() } catch { /* */ } }
async function handleResetSim() { try { await resetSimulation(); fetchSim() } catch { /* */ } }

async function handleActivateModel(id: number) {
  try {
    await ElMessageBox.confirm('确认激活此模型？', '提示', { type: 'warning' })
    await activateModel(id)
    ElMessage.success('已激活')
    fetchModels()
  } catch { /* */ }
}
async function handleUploadModel() {
  try {
    await uploadModel(new FormData())
    ElMessage.success('模型导入成功')
    fetchModels()
  } catch { ElMessage.error('导入失败') }
}
async function handleTrainModel(modelId: number) {
  try {
    await startTraining({ modelId, ...DEFAULT_TRAINING_CONFIG })
    ElMessage.success('训练任务已提交')
  } catch { ElMessage.error('训练启动失败') }
}
async function handleGenerateReport() {
  try {
    await generateReport(101)
    ElMessage.success('报告已生成')
    fetchReports()
  } catch { ElMessage.error('生成失败') }
}
async function openReviewDetail(id: number) {
  try {
    reviewDetail.value = (await getFaultReviewDetail(id)).data
    reviewDetailVisible.value = true
  } catch { /* */ }
}
async function handleImportToSim(id: number) {
  try {
    const res = await importToSimulation(id)
    Object.assign(simParams, res.data)
    activeTab.value = 'control'
    ElMessage.success('已导入仿真参数')
  } catch { /* */ }
}

// ── 8. 生命周期 ──
onMounted(() => {
  fetchSim()
  fetchModels()
  fetchReports()
  fetchReviews()
  pollTimer = setInterval(fetchSim, 3000)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<template>
    <div class="page sim-page sim-page--twin">
      <header class="sim-twin-header">
        <div class="sim-twin-header__title">向家坝水电站 · 数字孪生驾驶舱</div>
        <div class="sim-twin-header__meta">
          <span>{{ XIANGJIABA_HYDRO.river }} · {{ XIANGJIABA_HYDRO.name }}</span>
          <ElTag size="small" :color="statusInfo?.color" effect="dark">{{ statusInfo?.label }}</ElTag>
        </div>
      </header>

      <div class="sim-twin-stage">
        <div class="sim-viewport sim-viewport--twin">
          <ThreeDamScene
            visual-mode="twin"
            :water-level="waterLevel"
            :downstream-level="downstreamLevel"
            :gate-opening="gateOpening"
            :flow-rate="flowRate"
            :sim-scene="simScene"
          />

          <TwinFloatPanel title="关键指标概况" class="sim-twin-float sim-twin-float--left-top">
            <div class="twin-kpi-row">
              <div class="twin-kpi">
                <div class="twin-kpi__ring" :style="{ '--pct': gaugePct + '%', '--c': levelStatus.color }">
                  <b>{{ waterLevel.toFixed(2) }}</b>
                  <small>m</small>
                </div>
                <span>上游水位</span>
              </div>
              <div class="twin-kpi">
                <div class="twin-kpi__ring twin-kpi__ring--flow">
                  <b>{{ flowRate }}</b>
                  <small>m³/s</small>
                </div>
                <span>入库流量</span>
              </div>
              <div class="twin-kpi">
                <div class="twin-kpi__ring twin-kpi__ring--gate">
                  <b>{{ gateOpening }}</b>
                  <small>%</small>
                </div>
                <span>闸门开度</span>
              </div>
            </div>
            <ul class="twin-ref-list">
              <li><span>正常蓄水</span><b>{{ XIANGJIABA_HYDRO.normalPoolLevel }} m</b></li>
              <li><span>汛限水位</span><b>{{ XIANGJIABA_HYDRO.floodLimitLevel }} m</b></li>
              <li><span>坝顶高程</span><b>{{ XIANGJIABA_HYDRO.crestElevation }} m</b></li>
              <li><span>下游尾水</span><b>{{ downstreamLevel.toFixed(2) }} m</b></li>
            </ul>
          </TwinFloatPanel>

          <TwinFloatPanel title="历史水位趋势" class="sim-twin-float sim-twin-float--left-bottom">
            <div class="twin-bars">
              <div
                v-for="(bar, i) in levelHistoryBars"
                :key="i"
                class="twin-bars__item"
                :style="{ height: bar.h + '%' }"
                :title="bar.v.toFixed(2) + 'm'"
              />
            </div>
          </TwinFloatPanel>

          <TwinFloatPanel title="泄洪闸门监测" side="right" class="sim-twin-float sim-twin-float--right-top">
            <ul class="twin-gate-list">
              <li v-for="n in 5" :key="n">
                <span>{{ n }} 号闸门</span>
                <b :class="{ 'is-open': gateOpening > (n - 1) * 18 }">{{ gateOpening > (n - 1) * 18 ? '运行' : '待机' }}</b>
              </li>
            </ul>
            <p class="twin-alert" :class="{ 'is-warn': waterLevel >= XIANGJIABA_HYDRO.warningLevel }">
              {{ waterLevel >= XIANGJIABA_HYDRO.warningLevel ? '⚠ 水位超预警阈值 ' + XIANGJIABA_HYDRO.warningLevel + 'm' : '运行正常 · ' + levelStatus.label }}
            </p>
          </TwinFloatPanel>

          <TwinFloatPanel title="功能面板" side="right" class="sim-twin-float sim-twin-float--right-bottom">
            <SimulationTabPanel
              :active-tab="activeTab"
              :sim-scene="simScene"
              :sim-status="simStatus"
              :models="models"
              :reports="reports"
              :reviews="reviews"
              :model-loading="modelLoading"
              :report-loading="reportLoading"
              :review-loading="reviewLoading"
              compact
              @tab-change="onTabChange"
              @activate="handleActivateModel"
              @upload="handleUploadModel"
              @train="handleTrainModel"
              @generate="handleGenerateReport"
              @open-review="openReviewDetail"
              @import-review="handleImportToSim"
            />
          </TwinFloatPanel>

          <div class="sim-twin-toolbar">
            <button type="button" class="sim-twin-toolbar__btn" @click="showParams = !showParams">参数</button>
            <button type="button" class="sim-twin-toolbar__btn" :disabled="simStatus.status === 'running'" @click="handleStartSim">开始仿真</button>
            <button type="button" class="sim-twin-toolbar__btn" :disabled="simStatus.status !== 'running'" @click="handlePauseSim">暂停</button>
            <button type="button" class="sim-twin-toolbar__btn" :disabled="simStatus.status !== 'paused'" @click="handleResumeSim">继续</button>
            <button type="button" class="sim-twin-toolbar__btn" @click="handleResetSim">重置</button>
            <span class="sim-twin-toolbar__time">仿真 {{ elapsedLabel }}</span>
          </div>

          <aside v-if="showParams" class="sim-twin-drawer">
            <GlassPanel3D title="仿真参数" large class="param-panel">
              <div class="param-panel__status">
                <ElTag size="small" :color="statusInfo?.color" effect="dark">{{ statusInfo?.label }}</ElTag>
                <span>{{ SIMULATION_SCENE_MAP[simScene]?.label }}</span>
              </div>
              <ElForm label-position="top" class="param-form">
                <ElFormItem label="预设场景" class="param-form__full">
                  <ElSelect :model-value="simScene" @change="onSceneChange($event as SimulationScene)">
                    <ElOption v-for="s in SIMULATION_SCENE_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="初始水位 (m)">
                  <ElInputNumber v-model="simParams.initialLevel" :min="370" :max="385" :step="0.1" controls-position="right" />
                </ElFormItem>
                <ElFormItem label="入库流量 (m³/s)">
                  <ElInputNumber v-model="simParams.inflowRate" :min="500" :max="5000" :step="50" controls-position="right" />
                </ElFormItem>
                <ElFormItem label="仿真时长 (min)">
                  <ElInputNumber v-model="simParams.durationMin" :min="10" :max="240" :step="10" controls-position="right" />
                </ElFormItem>
                <ElFormItem label="仿真倍速">
                  <ElSelect v-model="simSpeed">
                    <ElOption v-for="s in SPEED_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
                  </ElSelect>
                </ElFormItem>
                <ElFormItem label="闸门开度 (%)" class="param-form__full">
                  <ElSlider v-model="gateOpening" :min="0" :max="100" :step="1" show-input />
                </ElFormItem>
              </ElForm>
            </GlassPanel3D>
          </aside>
        </div>
      </div>

      <ElDialog v-model="reviewDetailVisible" title="故障复盘详情" width="640px">
        <ElTimeline v-if="reviewDetail">
          <ElTimelineItem v-for="(e, i) in reviewDetail.timeline" :key="i" :timestamp="e.time">{{ e.event }}</ElTimelineItem>
        </ElTimeline>
        <ElForm label-position="top">
          <ElFormItem label="根因分析">
            <ElInput v-model="reviewConclusion.rootCause" type="textarea" />
          </ElFormItem>
        </ElForm>
      </ElDialog>
    </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.sim-page--twin {
  min-height: calc(100vh - var(--header-height) - 100px);
  margin: calc(-1 * var(--spacing-lg));
  padding: 0;
  background: #050a14;
  color: #dce8ff;

  .sim-twin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: linear-gradient(180deg, rgba(8, 20, 40, 0.95), rgba(5, 10, 20, 0.85));
    border-bottom: 1px solid rgba(0, 180, 255, 0.3);
    box-shadow: 0 4px 24px rgba(0, 80, 160, 0.15);

    &__title {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.12em;
      color: #7efcff;
      text-shadow: 0 0 20px rgba(0, 212, 255, 0.35);
    }

    &__meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
      color: rgba(180, 210, 240, 0.8);
    }
  }

  .sim-twin-stage {
    flex: 1;
    min-height: 0;
    height: calc(100vh - var(--header-height) - 160px);
    padding: 0;
  }

  .sim-viewport--twin {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 520px;
    border: none;
    border-radius: 0;
    background: #050a14;

    :deep(.three-scene) {
      min-height: 100%;
      height: 100%;
    }
  }

  .sim-twin-float {
    position: absolute;
    z-index: 5;
    width: 280px;
    max-height: calc(50% - 24px);

    &--left-top { top: 16px; left: 16px; }
    &--left-bottom { bottom: 72px; left: 16px; width: 280px; max-height: 200px; }
    &--right-top { top: 16px; right: 16px; width: 260px; }
    &--right-bottom {
      top: 240px;
      right: 16px;
      width: 300px;
      max-height: calc(100% - 320px);
      overflow: hidden;
      display: flex;
      flex-direction: column;

      :deep(.twin-panel__body) {
        padding: 8px 10px 10px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
    }
  }

  .sim-twin-toolbar {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(6, 16, 32, 0.88);
    border: 1px solid rgba(0, 180, 255, 0.4);
    border-radius: 999px;
    backdrop-filter: blur(12px);
    pointer-events: auto;

    &__btn {
      padding: 6px 16px;
      font-size: 12px;
      font-weight: 600;
      color: #7efcff;
      background: rgba(0, 60, 100, 0.45);
      border: 1px solid rgba(0, 180, 255, 0.35);
      border-radius: 999px;
      cursor: pointer;

      &:hover:not(:disabled) { background: rgba(0, 100, 160, 0.55); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    &__time {
      margin-left: 8px;
      font-size: 12px;
      color: rgba(180, 210, 240, 0.75);
    }
  }

  .sim-twin-drawer {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 7;
    width: min(420px, 90vw);
    pointer-events: auto;
  }
}

.twin-kpi-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.twin-kpi {
  flex: 1;
  text-align: center;
  font-size: 10px;
  color: rgba(160, 190, 220, 0.8);

  &__ring {
    width: 68px;
    height: 68px;
    margin: 0 auto 6px;
    border-radius: 50%;
    background: conic-gradient(var(--c, #00d4ff) var(--pct), rgba(30, 50, 70, 0.8) 0);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: 0 0 16px rgba(0, 180, 255, 0.2);

    &::before {
      content: '';
      position: absolute;
      inset: 6px;
      border-radius: 50%;
      background: rgba(8, 18, 32, 0.92);
    }

    b, small {
      position: relative;
      z-index: 1;
      line-height: 1.1;
    }

    b { font-size: 14px; color: #fff; }
    small { font-size: 9px; color: rgba(180, 210, 240, 0.7); }

    &--flow { background: conic-gradient(#1890ff 65%, rgba(30, 50, 70, 0.8) 0); }
    &--gate { background: conic-gradient(#2ed573 45%, rgba(30, 50, 70, 0.8) 0); }
  }
}

.twin-ref-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11px;

  li {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px dashed rgba(0, 140, 200, 0.15);
    color: rgba(160, 190, 220, 0.75);

    b { color: #e8f4ff; font-weight: 700; }
  }
}

.twin-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 100px;

  &__item {
    flex: 1;
    min-height: 8px;
    background: linear-gradient(180deg, #00d4ff, #1a5080);
    border-radius: 2px 2px 0 0;
    opacity: 0.85;
  }
}

.twin-gate-list {
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
  font-size: 11px;

  li {
    display: flex;
    justify-content: space-between;
    padding: 5px 0;
    border-bottom: 1px solid rgba(0, 140, 200, 0.12);
    color: rgba(180, 210, 240, 0.75);

    b {
      color: rgba(160, 190, 220, 0.6);
      font-weight: 600;

      &.is-open { color: #2ed573; }
    }
  }
}

.twin-alert {
  margin: 0;
  padding: 8px 10px;
  font-size: 11px;
  border-radius: 6px;
  background: rgba(0, 80, 60, 0.35);
  border: 1px solid rgba(46, 213, 115, 0.35);
  color: #aaf0c8;

  &.is-warn {
    background: rgba(80, 30, 0, 0.35);
    border-color: rgba(255, 165, 2, 0.5);
    color: #ffd59a;
  }
}

.sim-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--header-height) - 132px - var(--spacing-lg) * 3);
  height: 100%;
  overflow: hidden;
  color: $cockpit-text;
  font-size: $cockpit-font-base;

  &__body {
    flex: 1;
    min-height: 0;
    display: grid;
    /* 左右固定宽度，中间 3D 主视窗占据剩余空间（约 52%~58%） */
    grid-template-columns: 268px minmax(0, 1fr) 276px;
    gap: 14px;
    padding: 12px 14px 0;
    overflow: hidden;
  }

  &__side {
    min-height: 0;
    overflow: hidden;

    &--left {
      overflow-y: auto;
      padding-bottom: 8px;

      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: rgba(24, 144, 255, 0.25); border-radius: 3px; }
    }

    &--right {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
  }

  &__center {
    min-height: 0;
    min-width: 0;
    display: flex;
  }
}

.sim-viewport {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(10, 22, 40, 0.95) 0%, rgba(13, 33, 55, 0.92) 100%);
  border: 1px solid rgba(0, 212, 255, 0.2);
  box-shadow: 0 4px 24px rgba(0, 40, 80, 0.25);
  overflow: hidden;

  :deep(.three-scene) {
    flex: 1;
    width: 100%;
    min-height: 0;
    min-width: 0;
    border-radius: 0;
    border: none;
  }
}

.sim-hud {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 28px;
  padding: 16px 20px 0;
  pointer-events: none;

  &__card {
    flex: 0 0 auto;
    min-width: 140px;
    padding: 10px 20px;
    border-radius: 999px;
    background: rgba(8, 12, 20, 0.84);
    border: 1px solid rgba(80, 170, 255, 0.48);
    box-shadow:
      0 0 18px rgba(40, 150, 255, 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(12px);
    text-align: center;
    white-space: nowrap;
    font-size: $cockpit-font-base;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: 0.04em;
    line-height: 1.45;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);

    &--level {
      min-width: 180px;

      small {
        display: block;
        font-size: 11px;
        font-weight: 600;
        margin-top: 2px;
      }
    }
  }
}

.sim-viewport__ctrl {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 2;
  display: flex;
  gap: 10px;
  pointer-events: auto;
}

.sim-viewport__btn {
  padding: 9px 26px;
  font-size: $cockpit-font-base;
  font-weight: 600;
  color: #1890ff;
  background: rgba(230, 244, 255, 0.94);
  border: 1px solid rgba(24, 144, 255, 0.42);
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.15);
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: #e6f4ff;
    border-color: #1890ff;
    box-shadow: 0 0 14px rgba(24, 144, 255, 0.28);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.param-panel {
  &__status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: $cockpit-font-sm;
    color: $cockpit-text-dim;
  }

  &__play {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(24, 144, 255, 0.12);
  }
}

.param-play-btn {
  flex: 1;
  padding: 8px 12px;
  font-size: $cockpit-font-sm;
  font-weight: 600;
  color: $cockpit-accent;
  background: #e6f4ff;
  border: 1px solid rgba(24, 144, 255, 0.25);
  border-radius: 8px;
  cursor: pointer;

  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:hover:not(:disabled) { background: #d6ebff; }
}

.param-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 12px;

  :deep(.el-form-item) { margin-bottom: 12px; }
  :deep(.el-form-item__label) { color: $cockpit-text-dim; font-size: $cockpit-font-sm; padding-bottom: 4px; font-weight: 500; }
  :deep(.el-input-number) { width: 100%; }
  :deep(.el-select) { width: 100%; }

  &__full {
    grid-column: 1 / -1;
  }
}

.status-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 8px 0 0;
  padding-top: 10px;
  border-top: 1px solid rgba(24, 144, 255, 0.12);

  div {
    text-align: center;
    padding: 6px 4px;
    border-radius: 6px;
    background: rgba(24, 144, 255, 0.05);
  }

  dt {
    font-size: $cockpit-font-xs;
    color: $cockpit-text-dim;
    margin-bottom: 4px;
  }

  dd {
    margin: 0;
    font-size: $cockpit-font-base;
    font-weight: 700;
    color: $cockpit-accent;
    @include data-value;
    font-size: $cockpit-font-base;
  }
}

:deep(.el-dialog) { --el-bg-color: #ffffff; }
:deep(.el-slider__bar) { background: linear-gradient(90deg, $cockpit-accent, #3b82f6); }
</style>
