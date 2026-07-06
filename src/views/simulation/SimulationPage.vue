<script setup lang="ts">
// ── 1. 外部依赖导入 ──
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import {
  ElMessage, ElMessageBox, ElDialog, ElForm, ElFormItem, ElInput,
  ElTimeline, ElTimelineItem, ElSlider, ElInputNumber, ElSelect, ElOption, ElTag,
} from 'element-plus'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import ThreeDamScene from '@/components/cockpit/ThreeDamScene.vue'
import TwinDamSchematic2D from '@/components/cockpit/TwinDamSchematic2D.vue'
import DamPanoramaModal from '@/components/cockpit/DamPanoramaModal.vue'
import { useSmoothNumber } from '@/composables/useSmoothNumber'
import { useSimulationStream, mapProgressToRealtime } from '@/composables/useSimulationStream'
import { useUserStore } from '@/stores/user'
import SimulationTabPanel from './components/SimulationTabPanel.vue'
import ScenarioListPanel from './components/ScenarioListPanel.vue'
import type {
  SimulationScene, SimulationSpeed, SimulationParams,
  SimulationRealtimeData, AiModel, SimulationReport, FaultReview, FaultConclusion,
  SimulationScenarioItem, SimulationProgressPayload, SimulationScenarioPayload,
} from '@/types/simulation'
import { XIANGJIABA_HYDRO, getLevelStatus, levelGaugePercent } from '@/constants/xiangjiaba'
import {
  SIMULATION_SCENE_OPTIONS, SIMULATION_SCENE_MAP, getScenePreset,
  SIMULATION_STATUS_MAP, SPEED_OPTIONS, DEFAULT_TRAINING_CONFIG,
  SIMULATION_TABS,
  type SimulationTab,
} from '@/constants/simulation'
import {
  startSimulation, pauseSimulation, resumeSimulation, resetSimulation, getSimulationStatus,
  setSimulationGateOpening,
  getModelList, activateModel, uploadModel, startTraining, generateReport, getReportList,
  getFaultReviewList, getFaultReviewDetail, importToSimulation, getPhysicsGuardSummary,
  getSimulationScenarios, createSimulationScenario, updateSimulationScenario, deleteSimulationScenario,
  resolveScenarioId, getSimulationResult, applyResultToRealtime,
} from '@/api/simulation'
import type { PhysicsGuardSummary } from '@/types/dispatch'

const userStore = useUserStore()
const { connected: wsConnected, connect: connectSimStream, disconnect: disconnectSimStream } =
  useSimulationStream()

// ── 5. 响应式数据 ──
const activeTab = ref<SimulationTab>('control')
const scenarios = ref<SimulationScenarioItem[]>([])
const scenarioLoading = ref(false)
const scenarioDialogVisible = ref(false)
const scenarioEditingId = ref<number | null>(null)
const scenarioForm = reactive<SimulationScenarioPayload>({
  name: '',
  type: 'production',
  description: '',
  duration: 3600,
  speed: 1,
})
const SCENARIO_TYPE_OPTIONS = [
  { value: 'production', label: '生产工况' },
  { value: 'energy', label: '能源/枯水' },
  { value: 'fault', label: '故障复盘' },
]
const activeSimulationId = ref<string | null>(null)
const simStatus = ref<SimulationRealtimeData>({
  status: 'idle', elapsedSec: 0,
  currentLevel: XIANGJIABA_HYDRO.normalPoolLevel,
  currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
  currentFlow: XIANGJIABA_HYDRO.normalInflow, currentOpening: 45,
  historyLevels: [], historyFlows: [],
})
const simParams = reactive<SimulationParams>({
  scene: 'normal',
  ...getScenePreset('normal'),
})
const simScene = ref<SimulationScene>('normal')
const simSpeed = ref<SimulationSpeed>(1)
const gateOpening = ref(45)
const gateLocalEdit = ref(false)
let gateSyncTimer: ReturnType<typeof setTimeout> | null = null

watch(gateOpening, (v) => {
  if (gateSyncTimer) clearTimeout(gateSyncTimer)
  gateSyncTimer = setTimeout(() => {
    setSimulationGateOpening(v).catch(() => { /* */ })
  }, 400)
})

watch(() => simStatus.value.status, (status, prev) => {
  if (status === 'finished' && prev === 'running') {
    ElMessage.success(`仿真已完成 · 时长 ${simParams.durationMin} min`)
  }
})

watch(wsConnected, (open) => {
  if (open) stopPoll()
  else if (simStatus.value.status === 'running' && !pollTimer) startPoll()
})

const models = ref<AiModel[]>([])
const reports = ref<SimulationReport[]>([])
const reviews = ref<FaultReview[]>([])
const modelLoading = ref(false)
const reportLoading = ref(false)
const reviewLoading = ref(false)
const physicsGuard = ref<PhysicsGuardSummary | null>(null)

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
const smoothWaterLevel = useSmoothNumber(waterLevel, 1200)
const smoothDownstreamLevel = useSmoothNumber(downstreamLevel, 1200)
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
const sceneLabel = computed(() => SIMULATION_SCENE_MAP[simScene.value]?.label ?? '')
const speedLabel = computed(
  () => SPEED_OPTIONS.find((s) => s.value === simSpeed.value)?.label ?? `${simSpeed.value}x`,
)
const simActive = computed(() =>
  simStatus.value.status === 'running'
  || simStatus.value.status === 'paused'
  || simStatus.value.status === 'finished',
)
const canPause = computed(() =>
  simStatus.value.status === 'running' || simStatus.value.status === 'paused',
)
const canStart = computed(() =>
  simStatus.value.status === 'idle' || simStatus.value.status === 'finished',
)
const durationSec = computed(() => Math.max(60, simParams.durationMin * 60))
/** 主视窗：2D 剖面示意 / 3D 场景 */
const viewMode = ref<'2d' | '3d'>('3d')
const panoramaVisible = ref(false)
const mainSceneRef = ref<InstanceType<typeof ThreeDamScene> | null>(null)
const panoramaRef = ref<InstanceType<typeof DamPanoramaModal> | null>(null)

function openPanorama() {
  if (viewMode.value === '3d') panoramaVisible.value = true
}

// ── 9. 方法函数 ──
function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(fetchSim, 1000)
}

async function fetchScenarios() {
  scenarioLoading.value = true
  try {
    const res = await getSimulationScenarios()
    scenarios.value = res.data.list ?? []
  } catch {
    scenarios.value = []
  } finally {
    scenarioLoading.value = false
  }
}

function resetScenarioForm(item?: SimulationScenarioItem) {
  if (item) {
    scenarioEditingId.value = item.id
    scenarioForm.name = item.name
    scenarioForm.type = item.type
    scenarioForm.description = item.description ?? ''
    scenarioForm.duration = item.duration ?? simParams.durationMin * 60
    scenarioForm.speed = item.speed ?? simSpeed.value
    scenarioForm.status = item.status
  } else {
    scenarioEditingId.value = null
    scenarioForm.name = `${sceneLabel.value}仿真`
    scenarioForm.type = simScene.value === 'dry' ? 'energy' : 'production'
    scenarioForm.description = ''
    scenarioForm.duration = simParams.durationMin * 60
    scenarioForm.speed = simSpeed.value
    scenarioForm.status = 'draft'
  }
}

function openCreateScenario() {
  resetScenarioForm()
  scenarioDialogVisible.value = true
}

function openEditScenario(item: SimulationScenarioItem) {
  resetScenarioForm(item)
  scenarioDialogVisible.value = true
}

async function submitScenarioForm() {
  if (!scenarioForm.name.trim()) {
    ElMessage.warning('请填写场景名称')
    return
  }
  try {
    if (scenarioEditingId.value) {
      await updateSimulationScenario(scenarioEditingId.value, scenarioForm)
      ElMessage.success('场景已更新')
    } else {
      const res = await createSimulationScenario(scenarioForm)
      ElMessage.success(`场景已创建 · ID ${res.data.id}`)
    }
    scenarioDialogVisible.value = false
    await fetchScenarios()
  } catch {
    ElMessage.error('保存失败')
  }
}

async function handleDeleteScenario(item: SimulationScenarioItem) {
  try {
    await ElMessageBox.confirm(`确认删除场景「${item.name}」？`, '删除场景', { type: 'warning' })
    await deleteSimulationScenario(item.id)
    ElMessage.success('已删除')
    await fetchScenarios()
  } catch { /* cancel */ }
}

function onSimProgress(payload: SimulationProgressPayload) {
  simStatus.value = mapProgressToRealtime(simStatus.value, payload, durationSec.value)
  if (!gateLocalEdit.value && payload.metrics?.gate_opening != null) {
    gateOpening.value = Math.round(payload.metrics.gate_opening)
  }
  if (simStatus.value.status === 'finished' && activeSimulationId.value) {
    void loadSimulationResult(activeSimulationId.value)
  }
}

async function loadSimulationResult(simulationId: string) {
  try {
    const res = await getSimulationResult(simulationId)
    if (res.data.points?.length) {
      simStatus.value = applyResultToRealtime(res.data.points, durationSec.value)
    }
  } catch {
    /* 结果接口未就绪时保留 WS 最后状态 */
  }
}

async function fetchSim() {
  try {
    simStatus.value = (await getSimulationStatus()).data
    if (!gateLocalEdit.value) {
      gateOpening.value = simStatus.value.currentOpening
    }
  } catch { /* */ }
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
async function fetchPhysicsGuard() {
  try { physicsGuard.value = (await getPhysicsGuardSummary()).data } catch { physicsGuard.value = null }
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

function applyScenePreset(scene: SimulationScene) {
  const preset = getScenePreset(scene)
  simParams.scene = scene
  simParams.initialLevel = preset.initialLevel
  simParams.inflowRate = preset.inflowRate
  simParams.durationMin = preset.durationMin
  if (simStatus.value.status === 'idle') {
    gateOpening.value = preset.gateOpening
  }
}

function onSceneChange(scene: SimulationScene) {
  simScene.value = scene
  applyScenePreset(scene)
}

/** 打开全景弹窗（开始/暂停/重置均在弹窗内操作） */
function handleOpenSimModal() {
  viewMode.value = '3d'
  panoramaVisible.value = true
}

async function handleStartSim() {
  if (!canStart.value) return
  try {
    const { scenarioId, modelId } = resolveScenarioId(simScene.value, scenarios.value)
    const res = await startSimulation({
      ...simParams,
      scene: simScene.value,
      speed: simSpeed.value,
      gateOpening: gateOpening.value,
      scenarioId,
      modelId,
    })
    const data = res.data
    activeSimulationId.value = data.simulation_id
    simStatus.value = {
      ...simStatus.value,
      status: 'running',
      elapsedSec: 0,
      historyLevels: [{ time: 0, value: simParams.initialLevel }],
      historyFlows: [{ time: 0, value: simParams.inflowRate }],
    }
    stopPoll()

    const token = userStore.token || localStorage.getItem('token') || ''
    if (data.ws_endpoint || token) {
      await connectSimStream({
        simulationId: data.simulation_id,
        wsEndpoint: data.ws_endpoint,
        token,
        onProgress: onSimProgress,
        onError: () => startPoll(),
      })
    }
    if (!wsConnected.value) {
      startPoll()
    }

    ElMessage.success(`仿真已启动 · ${sceneLabel.value} · ${simSpeed.value}x 倍速`)
    setTimeout(() => {
      panoramaRef.value?.focusSimulationView()
      mainSceneRef.value?.focusSimulationView()
    }, 500)
  } catch {
    ElMessage.error('启动失败')
  }
}

async function handlePauseSim() {
  if (!canPause.value) return
  try {
    if (simStatus.value.status === 'paused') {
      await resumeSimulation()
      ElMessage.success('仿真已继续')
    } else {
      await pauseSimulation()
      ElMessage.info('仿真已暂停')
    }
    await fetchSim()
  } catch {
    ElMessage.error('操作失败')
  }
}

async function handleResetSim() {
  try {
    disconnectSimStream()
    activeSimulationId.value = null
    await resetSimulation()
    applyScenePreset(simScene.value)
    await fetchSim()
    startPoll()
    mainSceneRef.value?.resetView()
    ElMessage.success('仿真已重置')
  } catch {
    ElMessage.error('重置失败')
  }
}

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
  const id = activeSimulationId.value
  if (!id) {
    ElMessage.warning('请先完成一次仿真')
    return
  }
  try {
    await generateReport(id)
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
  applyScenePreset(simScene.value)
  fetchScenarios()
  fetchSim()
  fetchModels()
  fetchReports()
  fetchReviews()
  fetchPhysicsGuard()
  startPoll()
})
onUnmounted(() => {
  stopPoll()
  disconnectSimStream()
  if (gateSyncTimer) clearTimeout(gateSyncTimer)
})
</script>

<template>
  <div class="sim-page sim-page--twin sim-page--sky">
      <div class="sim-page__grid">
        <!-- 左栏：水情 + 曲线 + 场景库 -->
        <aside class="sim-page__col sim-page__col--left">
          <GlassPanel3D title="水情实时统计" compact class="twin-kpi-panel">
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
              <li v-if="physicsGuard"><span>防护配置</span><b>v{{ physicsGuard.config_version }}</b></li>
              <li v-if="physicsGuard"><span>紧急水位线</span><b>{{ physicsGuard.upstream_emergency }} m</b></li>
            </ul>
          </GlassPanel3D>

          <GlassPanel3D title="库区水位曲线" compact class="twin-chart-panel">
            <div class="twin-bars">
              <div
                v-for="(bar, i) in levelHistoryBars"
                :key="i"
                class="twin-bars__item"
                :style="{ height: bar.h + '%' }"
                :title="bar.v.toFixed(2) + 'm'"
              />
            </div>
          </GlassPanel3D>

          <GlassPanel3D title="仿真场景库" compact fill class="twin-scenario-panel">
            <ScenarioListPanel
              :scenarios="scenarios"
              :loading="scenarioLoading"
              @refresh="fetchScenarios"
              @create="openCreateScenario"
              @edit="openEditScenario"
              @delete="handleDeleteScenario"
            />
          </GlassPanel3D>
        </aside>

        <!-- 中栏：仿真视图 + 仿真控制 -->
        <main class="sim-page__col sim-page__col--center">
          <div class="sim-viewport-label">仿真视图 · 2D 剖面 / 3D 场景</div>
          <div
            class="sim-viewport sim-viewport--twin"
            :class="{ 'sim-viewport--2d': viewMode === '2d' }"
            @dblclick="openPanorama"
          >
            <div v-if="viewMode === '3d'" class="sim-viewport__ctrl">
              <button type="button" class="sim-viewport__btn" @click.stop="openPanorama">
                全景 BIM
              </button>
            </div>
            <div v-if="viewMode === '3d'" class="sim-viewport__fx" aria-hidden="true">
              <div class="sim-viewport__scanlines" />
              <div class="sim-viewport__particles" />
              <div class="sim-viewport__data-beam sim-viewport__data-beam--left" />
              <div class="sim-viewport__data-beam sim-viewport__data-beam--right" />
            </div>
            <div v-if="viewMode === '3d' && simActive && !panoramaVisible" class="sim-viewport__hud">
              <span class="sim-viewport__hud-badge" :style="{ color: statusInfo?.color }">
                {{ statusInfo?.label }} · {{ sceneLabel }}
              </span>
              <span>水位 <b :style="{ color: levelStatus.color }">{{ waterLevel.toFixed(2) }} m</b></span>
              <span>开度 <b>{{ gateOpening }}%</b></span>
              <span>仿真 <b>{{ elapsedLabel }}</b></span>
              <span>倍速 <b>{{ simSpeed }}x</b></span>
            </div>
            <TwinDamSchematic2D
              v-if="viewMode === '2d'"
              :water-level="smoothWaterLevel"
              :downstream-level="smoothDownstreamLevel"
              :gate-opening="gateOpening"
              :flow-rate="flowRate"
            />
            <ThreeDamScene
              v-else
              ref="mainSceneRef"
              visual-mode="twin"
              :water-level="smoothWaterLevel"
              :downstream-level="smoothDownstreamLevel"
              :gate-opening="gateOpening"
              :flow-rate="flowRate"
              :sim-scene="simScene"
              :sim-running="simActive"
            />
          </div>

          <div class="sim-toolbar">
            <div class="sim-toolbar__view">
              <button
                type="button"
                class="sim-toolbar__btn"
                :class="{ 'is-active': viewMode === '2d' }"
                @click="viewMode = '2d'"
              >
                2D 剖面
              </button>
              <button
                type="button"
                class="sim-toolbar__btn"
                :class="{ 'is-active': viewMode === '3d' }"
                @click="viewMode = '3d'"
              >
                3D 场景
              </button>
            </div>
            <span class="sim-toolbar__sep" />
            <div class="sim-toolbar__field sim-toolbar__field--readonly" title="点击「打开控制」修改场景与倍速">
              <span>场景</span>
              <span class="sim-toolbar__value">{{ sceneLabel }}</span>
            </div>
            <div class="sim-toolbar__field sim-toolbar__field--readonly" title="点击「打开控制」修改场景与倍速">
              <span>倍速</span>
              <span class="sim-toolbar__value">{{ speedLabel }}</span>
            </div>
            <span class="sim-toolbar__spacer" />
            <button
              type="button"
              class="sim-toolbar__status"
              :style="{ color: statusInfo?.color }"
              @click="handleOpenSimModal"
            >
              仿真 {{ elapsedLabel }} · {{ statusInfo?.label }}
              <small>打开控制</small>
            </button>
          </div>
        </main>

        <!-- 右栏：闸门监测 + 功能面板 -->
        <aside class="sim-page__col sim-page__col--right">
          <GlassPanel3D title="泄洪闸门监测" compact class="twin-gate-panel">
            <ul class="twin-gate-grid">
              <li v-for="n in 5" :key="n">
                <span>{{ n }} 号表孔</span>
                <b>{{ gateOpening }}%</b>
              </li>
            </ul>
            <p class="twin-gate-summary">5 孔同步 · 运行正常</p>
          </GlassPanel3D>

          <GlassPanel3D title="功能面板" fill class="sim-func-panel">
            <div class="sim-func-panel__inner">
              <div class="sim-func-tabs">
                <button
                  v-for="t in SIMULATION_TABS"
                  :key="t.value"
                  type="button"
                  class="sim-func-tabs__btn"
                  :class="{ 'is-active': activeTab === t.value }"
                  @click="onTabChange(t.value)"
                >
                  {{ t.label }}
                </button>
              </div>
              <div class="sim-func-panel__scroll">
                <SimulationTabPanel
                  class="sim-func-panel__content"
                  :active-tab="activeTab"
                  :sim-scene="simScene"
                  :sim-status="simStatus"
                  :physics-guard="physicsGuard"
                  :models="models"
                  :reports="reports"
                  :reviews="reviews"
                  :model-loading="modelLoading"
                  :report-loading="reportLoading"
                  :review-loading="reviewLoading"
                  compact
                  hide-tabs
                  @tab-change="onTabChange"
                  @activate="handleActivateModel"
                  @upload="handleUploadModel"
                  @train="handleTrainModel"
                  @generate="handleGenerateReport"
                  @open-review="openReviewDetail"
                  @import-review="handleImportToSim"
                />
              </div>
            </div>
          </GlassPanel3D>
        </aside>
      </div>

      <DamPanoramaModal
        ref="panoramaRef"
        :visible="panoramaVisible"
        :water-level="smoothWaterLevel"
        :downstream-level="smoothDownstreamLevel"
        :gate-opening="gateOpening"
        :flow-rate="flowRate"
        :sim-scene="simScene"
        :sim-speed="simSpeed"
        :sim-status="simStatus"
        :can-start="canStart"
        :can-pause="canPause"
        :elapsed-label="elapsedLabel"
        :scene-label="sceneLabel"
        :status-label="statusInfo?.label ?? '待机'"
        :status-color="statusInfo?.color ?? '#6b7280'"
        :level-status-color="levelStatus.color"
        :level-status-label="levelStatus.label"
        @close="panoramaVisible = false"
        @start="handleStartSim"
        @pause="handlePauseSim"
        @reset="handleResetSim"
        @update:sim-scene="onSceneChange"
        @update:sim-speed="simSpeed = $event"
        @update:gate-opening="gateOpening = $event"
      />

      <ElDialog v-model="showParams" title="仿真参数" width="440px" destroy-on-close>
        <div class="param-panel__status">
          <ElTag size="small" :color="statusInfo?.color">{{ statusInfo?.label }}</ElTag>
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
            <ElSlider
              v-model="gateOpening"
              :min="0"
              :max="100"
              :step="1"
              show-input
              @input="gateLocalEdit = true"
              @change="gateLocalEdit = false"
            />
          </ElFormItem>
        </ElForm>
      </ElDialog>

      <ElDialog
        v-model="scenarioDialogVisible"
        :title="scenarioEditingId ? '编辑仿真场景' : '新建仿真场景'"
        width="480px"
        destroy-on-close
      >
        <ElForm label-position="top">
          <ElFormItem label="场景名称">
            <ElInput v-model="scenarioForm.name" placeholder="如：枯水季仿真" />
          </ElFormItem>
          <ElFormItem label="场景类型">
            <ElSelect v-model="scenarioForm.type" style="width: 100%">
              <ElOption
                v-for="t in SCENARIO_TYPE_OPTIONS"
                :key="t.value"
                :label="t.label"
                :value="t.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="描述">
            <ElInput v-model="scenarioForm.description" type="textarea" :rows="2" />
          </ElFormItem>
          <ElFormItem label="时长（秒）">
            <ElInputNumber v-model="scenarioForm.duration" :min="60" :max="86400" controls-position="right" />
          </ElFormItem>
          <ElFormItem label="倍速">
            <ElInputNumber v-model="scenarioForm.speed" :min="1" :max="10" controls-position="right" />
          </ElFormItem>
        </ElForm>
        <template #footer>
          <ElButton @click="scenarioDialogVisible = false">取消</ElButton>
          <ElButton type="primary" @click="submitScenarioForm">保存</ElButton>
        </template>
      </ElDialog>

      <ElDialog v-model="reviewDetailVisible" title="历史故障复盘详情" width="720px">
        <template v-if="reviewDetail">
          <div class="review-summary">
            <p><strong>{{ reviewDetail.faultType }}</strong></p>
            <p class="review-meta">影响范围：{{ reviewDetail.impactScope }} · 关联告警 #{{ reviewDetail.alarmId }}</p>
          </div>
          <ElTimeline>
            <ElTimelineItem v-for="(e, i) in reviewDetail.timeline" :key="i" :timestamp="e.time">{{ e.event }}</ElTimelineItem>
          </ElTimeline>
        </template>
        <ElForm label-position="top">
          <ElFormItem label="根因分析">
            <ElInput v-model="reviewConclusion.rootCause" type="textarea" :rows="3" placeholder="填写故障根因" />
          </ElFormItem>
          <ElFormItem label="改进措施">
            <ElInput v-model="reviewConclusion.improvements" type="textarea" :rows="2" placeholder="填写改进措施" />
          </ElFormItem>
        </ElForm>
      </ElDialog>
    </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/text-mixins.scss' as *;
@use '@/assets/styles/cockpit.scss' as *;

.sim-page--twin.sim-page--sky {
  @include cockpit-page-white;
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  height: 100%;
  /* 与侧栏、右边缘留出一致内边距，避免面板贴边或被裁切 */
  padding: 14px 18px 16px;
  color: #1e4976;
  overflow: hidden;
  font-size: $cockpit-font-md;
  box-sizing: border-box;

  :deep(.glass-panel) {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid rgba(24, 144, 255, 0.16);
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(24, 144, 255, 0.06);
  }

  :deep(.glass-panel__title) { font-size: $cockpit-font-md; font-weight: 600; }
  :deep(.glass-panel__body) { font-size: $cockpit-font-base; line-height: 1.55; }
  :deep(.glass-panel__header) { padding: 12px 14px; }
  :deep(.glass-panel__deco) { height: 16px; }

  /* 三栏：左 ~27% · 中 ~46% · 右 ~27% */
  .sim-page__grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(288px, 27fr) minmax(0, 46fr) minmax(300px, 27fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 14px;
    align-items: stretch;
    overflow: hidden;
  }

  .sim-page__col {
    min-height: 0;
    min-width: 0;
    height: 100%;
    overflow: hidden;

    &--left {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 10px;
      overflow: hidden;

      .twin-kpi-panel,
      .twin-chart-panel {
        min-height: 0;
      }

      :deep(.glass-panel__body) {
        padding: 10px 12px;
      }

      .twin-chart-panel :deep(.glass-panel__body) {
        padding: 8px 12px 10px;
      }

      .twin-scenario-panel {
        min-height: 0;
        overflow: hidden;

        :deep(.glass-panel__body) {
          padding: 8px 12px 10px;
        }

        :deep(.scenario-panel__toolbar .el-button) {
          font-size: $cockpit-font-sm;
          padding: 6px 12px;
        }

        :deep(.scenario-panel__head) {
          font-size: $cockpit-font-base;
        }

        :deep(.scenario-panel__meta) {
          font-size: $cockpit-font-sm;
        }

        :deep(.scenario-panel__actions .el-button) {
          font-size: $cockpit-font-sm;
        }
      }
    }

    &--center {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
      min-width: 0;
    }

    .sim-viewport-label {
      flex-shrink: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1e4976;
      padding: 0 2px;
    }

    &--right {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: 10px;
      overflow: hidden;
      min-height: 0;

      .twin-gate-panel {
        align-self: start;

        :deep(.glass-panel__body) {
          padding: 8px 12px 10px;
        }
      }

      .sim-func-panel {
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
    }
  }

  .sim-func-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex-shrink: 0;
    margin-bottom: 2px;

    &__btn {
      flex-shrink: 0;
      padding: 6px 10px;
      font-size: $cockpit-font-sm;
      font-weight: 600;
      line-height: 1.35;
      color: #64748b;
      background: #f1f5f9;
      border: 1px solid rgba(24, 144, 255, 0.12);
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;

      &:hover {
        color: #1890ff;
        border-color: rgba(24, 144, 255, 0.28);
        background: #e6f4ff;
      }

      &.is-active {
        color: #fff;
        background: linear-gradient(135deg, #1890ff, #096dd9);
        border-color: transparent;
      }
    }
  }

  .sim-func-panel {
    min-height: 0;
    min-width: 0;
    overflow: hidden;

    :deep(.glass-panel__header) {
      padding: 12px 14px;
    }

    :deep(.glass-panel__body) {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0;
    }

    &__inner {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px 12px 12px;
      overflow: hidden;
    }

    &__scroll {
      flex: 1 1 0;
      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      @include hide-scrollbar;
    }

    &__content {
      min-height: min-content;
    }

    :deep(.sim-tab-panel) {
      min-width: 0;
    }

    :deep(.sim-tab-panel--compact) {
      display: block;
      height: auto;
      overflow: visible;
    }

    :deep(.sim-tab-panel__compact-body) {
      overflow: visible;
      padding-bottom: 4px;
    }

    :deep(.entity-list) {
      padding-bottom: 12px;
    }

    :deep(.entity-list__item:last-child) {
      margin-bottom: 0;
      padding-bottom: 14px;
    }

    :deep(.scene-brief h4) {
      color: #1890ff;
      margin: 0 0 6px;
      font-size: $cockpit-font-md;
      font-weight: 700;
    }

    :deep(.scene-brief p),
    :deep(.summary-list dt),
    :deep(.hint-text) {
      color: #64748b;
      font-size: $cockpit-font-base;
    }

    :deep(.summary-list dd) {
      color: #1890ff;
      font-weight: 700;
      font-size: $cockpit-font-md;
    }

    :deep(.summary-list__row) {
      padding: 9px 0;
      font-size: $cockpit-font-base;
    }

    :deep(.panel-actions) {
      margin-bottom: 10px;

      .el-button {
        font-size: $cockpit-font-base;
        padding: 9px 16px;
      }
    }

    :deep(.hint-text) {
      margin-bottom: 10px;
      line-height: 1.55;
    }

    :deep(.history-block h5) {
      color: #1e4976;
      font-size: $cockpit-font-base;
      font-weight: 700;
    }

    :deep(.history-list) {
      color: #475569;
      font-size: $cockpit-font-base;
    }

    :deep(.entity-list__main strong) { font-size: $cockpit-font-base; }
    :deep(.entity-list__meta),
    :deep(.entity-list__desc) { font-size: $cockpit-font-base; }
    :deep(.el-button) { font-size: $cockpit-font-base; }
    :deep(.el-input__inner) { font-size: $cockpit-font-base; }
    :deep(.el-tag) { font-size: $cockpit-font-sm; }
  }

  .sim-viewport--twin {
    flex: 1;
    min-height: 0;
    position: relative;
    width: 100%;
    border-radius: 12px;
    background: #ffffff;
    border: 1px solid rgba(24, 144, 255, 0.15);
    box-shadow: 0 2px 12px rgba(24, 144, 255, 0.08);
    overflow: hidden;
    cursor: pointer;
    transition:
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 0.28s ease,
      border-color 0.28s ease;

    &:hover {
      transform: translateY(-2px);
      border-color: rgba(24, 144, 255, 0.35);
      box-shadow:
        0 8px 32px rgba(24, 144, 255, 0.15),
        inset 0 0 40px rgba(24, 144, 255, 0.04);
    }

    &:active {
      transform: translateY(0) scale(0.998);
      transition-duration: 0.1s;
    }

    &__fx {
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
    }

    &__scanlines {
      position: absolute;
      inset: 0;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 3px,
        rgba(64, 180, 255, 0.04) 3px,
        rgba(64, 180, 255, 0.04) 4px
      );
      animation: holo-scan 8s linear infinite;
    }

    &__particles {
      position: absolute;
      inset: 0;
      background-image:
        radial-gradient(1px 1px at 20% 30%, rgba(100, 200, 255, 0.5), transparent),
        radial-gradient(1px 1px at 60% 70%, rgba(100, 200, 255, 0.4), transparent),
        radial-gradient(1px 1px at 80% 20%, rgba(255, 200, 100, 0.3), transparent),
        radial-gradient(1px 1px at 40% 80%, rgba(100, 200, 255, 0.35), transparent);
      background-size: 100% 100%;
      animation: particle-drift 12s ease-in-out infinite;
    }

    &__data-beam {
      position: absolute;
      top: 20%;
      bottom: 20%;
      width: 2px;
      background: linear-gradient(180deg, transparent, rgba(64, 200, 255, 0.6), transparent);
      opacity: 0.5;
      animation: data-beam 2.5s ease-in-out infinite;

      &--left { left: 0; animation-delay: 0s; }
      &--right { right: 0; animation-delay: 1.2s; }
    }

    &__hud {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 5;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px 16px;
      padding: 8px 16px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(24, 144, 255, 0.22);
      backdrop-filter: blur(12px);
      pointer-events: none;
      font-size: 14px;
      color: #64748b;
      box-shadow: 0 2px 12px rgba(24, 144, 255, 0.1);

      b { color: #1e4976; font-weight: 700; font-size: 16px; }
    }

    &__hud-badge {
      font-weight: 700;
      padding-right: 12px;
      border-right: 1px solid rgba(24, 144, 255, 0.15);
    }

    &.sim-viewport--2d {
      background: linear-gradient(180deg, #f7fbff 0%, #eef6fc 100%);
      border-color: rgba(24, 144, 255, 0.22);
      box-shadow:
        inset 0 0 40px rgba(24, 144, 255, 0.06),
        0 4px 20px rgba(24, 144, 255, 0.08);
    }

    :deep(.three-scene),
    :deep(.twin-2d) {
      width: 100%;
      height: 100%;
      min-height: 0;
    }
  }

  .sim-toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 14px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(232, 244, 252, 0.88) 100%);
    border: 1px solid rgba(24, 144, 255, 0.2);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(24, 144, 255, 0.08);
    transition: box-shadow 0.25s ease, border-color 0.25s ease;

    &:hover {
      border-color: rgba(24, 144, 255, 0.28);
      box-shadow: 0 6px 20px rgba(24, 144, 255, 0.1);
    }

    &__view {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    &__sep {
      width: 1px;
      height: 20px;
      margin: 0 4px;
      background: rgba(24, 144, 255, 0.2);
    }

    &__btn {
      padding: 9px 20px;
      font-size: $cockpit-font-base;
      font-weight: 600;
      color: #1890ff;
      background: rgba(230, 244, 255, 0.9);
      border: 1px solid rgba(24, 144, 255, 0.25);
      border-radius: 8px;
      cursor: pointer;
      transition:
        transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.2s ease,
        background 0.2s ease,
        border-color 0.2s ease;

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        background: #e6f4ff;
        border-color: rgba(24, 144, 255, 0.45);
        box-shadow: 0 4px 14px rgba(24, 144, 255, 0.2);
      }

      &:active:not(:disabled) {
        transform: translateY(0) scale(0.96);
        transition-duration: 0.08s;
      }

      &:disabled { opacity: 0.45; cursor: not-allowed; }

      &.is-active {
        color: #fff;
        background: linear-gradient(135deg, #1890ff, #096dd9);
        border-color: transparent;
        box-shadow: 0 0 16px rgba(24, 144, 255, 0.3);

        &:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(24, 144, 255, 0.4);
        }
      }

      &--launch {
        color: #fff;
        background: linear-gradient(135deg, #1890ff, #096dd9);
        border-color: transparent;
        padding: 7px 22px;
      }
    }

    &__spacer {
      flex: 1;
      min-width: 8px;
    }

    &__status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      padding: 8px 14px;
      font-size: $cockpit-font-base;
      font-weight: 600;
      color: #64748b;
      background: rgba(230, 244, 255, 0.6);
      border: 1px solid rgba(24, 144, 255, 0.18);
      border-radius: 8px;
      cursor: pointer;
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease,
        border-color 0.2s ease;

      small {
        font-size: 13px;
        font-weight: 500;
        color: #1890ff;
        opacity: 0.85;
      }

      &:hover {
        transform: translateY(-1px);
        border-color: rgba(24, 144, 255, 0.35);
        box-shadow: 0 4px 12px rgba(24, 144, 255, 0.12);
      }
    }

    &__field {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: $cockpit-font-base;
      color: #64748b;

      span { white-space: nowrap; }

      &--readonly {
        padding: 8px 12px;
        background: rgba(241, 245, 249, 0.85);
        border: 1px solid rgba(24, 144, 255, 0.12);
        border-radius: 8px;
        cursor: default;
        user-select: none;
      }
    }

    &__value {
      font-weight: 600;
      color: #1890ff;
    }

    &__select {
      padding: 8px 12px;
      font-size: $cockpit-font-base;
      font-weight: 600;
      color: #1890ff;
      background: rgba(230, 244, 255, 0.9);
      border: 1px solid rgba(24, 144, 255, 0.25);
      border-radius: 8px;
      cursor: pointer;

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  }
}

@keyframes holo-scan {
  0% { transform: translateY(0); }
  100% { transform: translateY(4px); }
}

@keyframes particle-drift {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes data-beam {
  0%, 100% { opacity: 0.25; transform: scaleY(0.85); }
  50% { opacity: 0.7; transform: scaleY(1); }
}

@keyframes bar-shimmer {
  0% { transform: translateY(100%); }
  100% { transform: translateY(-100%); }
}

.twin-kpi-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 10px;
}

.twin-kpi {
  flex: 1;
  min-width: 0;
  text-align: center;
  font-size: $cockpit-font-sm;
  color: #64748b;
  padding: 4px 2px;
  border-radius: 8px;
  @include interactive-card;
  cursor: pointer;

  span { color: #1890ff; font-size: $cockpit-font-sm; font-weight: 600; }

  &__ring {
    width: 68px;
    height: 68px;
    margin: 0 auto 6px;
    border-radius: 50%;
    background: conic-gradient(var(--c, #1890ff) var(--pct), #e2e8f0 0);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: 0 0 12px rgba(24, 144, 255, 0.15);
    transition: box-shadow 0.25s ease, transform 0.25s ease;

    &::before {
      content: '';
      position: absolute;
      inset: 6px;
      border-radius: 50%;
      background: #fff;
      border: 1px solid rgba(24, 144, 255, 0.12);
    }

    b, small { position: relative; z-index: 1; line-height: 1.1; }
    b { font-size: $cockpit-font-md; color: #1e4976; font-weight: 700; }
    small { font-size: $cockpit-font-sm; color: #64748b; }

    &--flow {
      background: conic-gradient(#1890ff 65%, #e2e8f0 0);
    }
    &--gate {
      background: conic-gradient(#22c55e 45%, #e2e8f0 0);
    }
  }

  &:hover &__ring {
    box-shadow: 0 0 20px rgba(24, 144, 255, 0.35);
    transform: scale(1.06);
  }
}

.twin-ref-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: $cockpit-font-base;
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 8px;

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 7px 4px;
    margin: 0;
    border-bottom: 1px dashed rgba(24, 144, 255, 0.12);
    border-radius: 4px;
    color: #64748b;

    span { font-size: $cockpit-font-sm; white-space: nowrap; }
    b { color: #1890ff; font-weight: 700; font-size: $cockpit-font-base; white-space: nowrap; }
  }
}

.twin-bars {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  height: 100px;
  padding-top: 2px;

  &__item {
    position: relative;
    flex: 1;
    min-height: 10px;
    overflow: hidden;
    background: linear-gradient(180deg, #7dd3fc 0%, #1890ff 45%, #0ea5e9 100%);
    border-radius: 3px 3px 0 0;
    opacity: 0.92;
    box-shadow: 0 0 8px rgba(24, 144, 255, 0.2);
    cursor: pointer;
    transition:
      height 0.8s ease,
      transform 0.22s ease,
      box-shadow 0.22s ease,
      opacity 0.22s ease;

    &:hover {
      transform: scaleY(1.04) scaleX(1.08);
      transform-origin: bottom center;
      opacity: 1;
      box-shadow: 0 0 18px rgba(24, 144, 255, 0.45);
      z-index: 1;
    }

    &:active {
      transform: scaleY(0.98) scaleX(1.02);
      transform-origin: bottom center;
    }

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.35) 50%, transparent 100%);
      animation: bar-shimmer 2.8s linear infinite;
    }
  }
}

.twin-gate-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin: 0 0 6px;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border-radius: 6px;
    background: rgba(34, 197, 94, 0.06);
    border: 1px solid rgba(34, 197, 94, 0.18);
    text-align: center;

    span {
      font-size: $cockpit-font-sm;
      color: #64748b;
      white-space: nowrap;
    }

    b {
      font-size: $cockpit-font-md;
      font-weight: 700;
      color: #16a34a;
    }
  }
}

.twin-gate-summary {
  margin: 0;
  padding: 0;
  font-size: $cockpit-font-sm;
  color: #16a34a;
  text-align: center;
}

.twin-gate-list {
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
  font-size: $cockpit-font-base;

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 10px 10px;
    margin: 0 -8px;
    border-bottom: 1px solid rgba(24, 144, 255, 0.1);
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      background 0.2s ease,
      box-shadow 0.2s ease;

    span { font-size: 16px; }

    &:hover {
      transform: translateX(3px);
      background: rgba(34, 197, 94, 0.06);
      box-shadow: inset 3px 0 0 rgba(34, 197, 94, 0.5);
    }

    &:active {
      transform: scale(0.99);
    }

    b.is-open {
      color: #16a34a;
      font-weight: 700;
      font-size: 16px;
      white-space: nowrap;
    }
  }
}

.twin-alert {
  margin: 0;
  padding: 10px 12px;
  font-size: $cockpit-font-base;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.08);
  border: 1px solid rgba(34, 197, 94, 0.22);
  color: #16a34a;
  cursor: default;
  transition: transform 0.22s ease, box-shadow 0.22s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(34, 197, 94, 0.15);
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
  transition:
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    background: #e6f4ff;
    border-color: #1890ff;
    box-shadow: 0 6px 18px rgba(24, 144, 255, 0.28);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.96);
    transition-duration: 0.08s;
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
