<script setup lang="ts">
// ── 1. 外部依赖导入 ──
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ElMessage, ElMessageBox, ElDialog, ElForm, ElFormItem, ElInput,
  ElSlider, ElInputNumber, ElSelect, ElOption, ElTag, ElUpload, ElButton,
} from 'element-plus'
import { Upload } from '@element-plus/icons-vue'
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
  SimulationRealtimeData, AiModel, SimulationReport, FaultReview,
  SimulationScenarioItem, SimulationProgressPayload, SimulationScenarioPayload,
} from '@/types/simulation'
import { XIANGJIABA_HYDRO, getLevelStatus, levelGaugePercent } from '@/constants/xiangjiaba'
import { estimateGateBayDischarge } from '@/utils/xiangjiabaTelemetry'
import {
  SIMULATION_SCENE_OPTIONS, SIMULATION_SCENE_MAP, getScenePreset,
  SIMULATION_STATUS_MAP, SPEED_OPTIONS, DEFAULT_TRAINING_CONFIG,
  SIMULATION_TABS, SCENARIO_LIBRARY_LABEL, MODEL_REGISTRY_LABEL,
  getSimulationSceneLabel,
  clampSimulationLevel,
  SIMULATION_LEVEL_MIN,
  type SimulationTab,
} from '@/constants/simulation'
import {
  startSimulation, pauseSimulation, resumeSimulation, resetSimulation, getSimulationStatus,
  setSimulationGateOpening,
  getModelList, activateModel, startTraining, generateReport, getReportList, downloadReport,
  getRegistryModelList, importModelFromRegistry, uploadModel,
  getFaultReviewList, getFaultReviewDetail, importToSimulation, getPhysicsGuardSummary,
  getSimulationScenarios, createSimulationScenario, updateSimulationScenario, deleteSimulationScenario,
  ensureScenarioActive,
  resolveScenarioId, getSimulationResult, applyResultToRealtime,
  SIMULATION_USE_MOCK,
  rememberScenarioSimulation,
  clearScenarioRunningTask,
} from '@/api/simulation'
import type { PhysicsGuardSummary } from '@/types/dispatch'
import type { ModelInfo } from '@/shared/types'
import { MODEL_STATUS_MAP as REGISTRY_STATUS_MAP, MODEL_TYPE_MAP } from '@/constants/settings'
import { isSimulationAlreadyRunningError, isSimulationDraftScenarioError, isApiBusinessError, isAuthError } from '@/utils/apiError'
import { scenarioToSimulationParams, faultReviewToSimulationParams } from '@/api/simulationAdapter'

const userStore = useUserStore()
const router = useRouter()
const { connected: wsConnected, connect: connectSimStream, disconnect: disconnectSimStream } =
  useSimulationStream()

const DELETED_SCENARIOS_KEY = 'simulation_deleted_scenario_ids'

function loadDeletedScenarioIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(DELETED_SCENARIOS_KEY)
    if (!raw) return new Set()
    const ids = JSON.parse(raw) as number[]
    return new Set(Array.isArray(ids) ? ids : [])
  } catch {
    return new Set()
  }
}

function persistDeletedScenarioIds(ids: Set<number>) {
  sessionStorage.setItem(DELETED_SCENARIOS_KEY, JSON.stringify([...ids]))
}

// ── 5. 响应式数据 ──
const activeTab = ref<SimulationTab>('control')
const scenarios = ref<SimulationScenarioItem[]>([])
const scenarioLoading = ref(false)
/** 场景库当前选中项（与「我的仿真场景库」预设联动） */
const selectedScenarioId = ref<number | null>(null)
/** 已成功删除的场景 ID（含 sessionStorage，防止刷新后又出现） */
const deletedScenarioIds = loadDeletedScenarioIds()
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
const startingSim = ref(false)
const simStatus = ref<SimulationRealtimeData>({
  status: 'idle', elapsedSec: 0,
  currentLevel: XIANGJIABA_HYDRO.normalPoolLevel,
  currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
  currentFlow: XIANGJIABA_HYDRO.normalInflow, currentOpening: 100,
  historyLevels: [], historyFlows: [],
})
const simParams = reactive<SimulationParams>({
  scene: 'custom',
  ...getScenePreset('custom'),
})
const simScene = ref<SimulationScene>('custom')
const GATE_COUNT = 5
const simSpeed = ref<SimulationSpeed>(1)
const gateOpening = ref(100)
const gateOpenings = ref<number[]>([100, 100, 100, 100, 100])
const gateLocalEdit = ref(false)
const selectedGateIndex = ref(-1)
let gateSyncTimer: ReturnType<typeof setTimeout> | null = null

function safeOpening(v: number, fallback = 100) {
  return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback
}

function syncAggregateFromGates() {
  const avg = gateOpenings.value.reduce((a, b) => a + safeOpening(b), 0) / GATE_COUNT
  gateOpening.value = Math.round(avg)
}

function syncGatesFromAggregate(opening: number) {
  const v = safeOpening(opening)
  gateOpenings.value = Array.from({ length: GATE_COUNT }, () => v)
}

function setGateOpeningAt(index: number, opening: number) {
  if (index < 0 || index >= GATE_COUNT) return
  gateLocalEdit.value = true
  gateOpenings.value = gateOpenings.value.map((g, i) =>
    i === index ? safeOpening(opening) : g,
  )
  syncAggregateFromGates()
  applyInteractiveControl({ opening: gateOpening.value })
  if (gateSyncTimer) clearTimeout(gateSyncTimer)
  gateSyncTimer = setTimeout(() => {
    const id = activeSimulationId.value
    if (id) setSimulationGateOpening(id, gateOpening.value).catch(() => { /* */ })
    gateLocalEdit.value = false
  }, 400)
}

watch(gateOpening, (v) => {
  const opening = safeOpening(v)
  if (opening !== v) gateOpening.value = opening
  if (gateLocalEdit.value) return
  syncGatesFromAggregate(opening)
  applyInteractiveControl({ opening })
  if (gateSyncTimer) clearTimeout(gateSyncTimer)
  gateSyncTimer = setTimeout(() => {
    const id = activeSimulationId.value
    if (id) setSimulationGateOpening(id, opening).catch(() => { /* */ })
  }, 400)
})

watch(() => simStatus.value.status, (status, prev) => {
  if (status === 'finished' && prev === 'running') {
    ElMessage.success(`仿真已完成 · 时长 ${simParams.durationMin} min`)
    if (activeSimulationId.value) {
      void loadSimulationResult(activeSimulationId.value)
    }
  }
})

watch(wsConnected, (open) => {
  if (open) stopPoll()
  else if (
    activeSimulationId.value
    && simStatus.value.status === 'running'
    && !pollTimer
  ) {
    startPoll()
  }
})

const models = ref<AiModel[]>([])
const registryModels = ref<ModelInfo[]>([])
const modelRegistryVisible = ref(false)
const registryLoading = ref(false)
const registryKeyword = ref('')
const registryUploadRef = ref<InstanceType<typeof ElUpload> | null>(null)
const registryUploading = ref(false)
const registryUploadProgress = ref(0)
const reports = ref<SimulationReport[]>([])
const reviews = ref<FaultReview[]>([])
const modelLoading = ref(false)
const modelUploading = ref(false)
const reportLoading = ref(false)
const reviewLoading = ref(false)
const reviewLoadError = ref<string | null>(null)
const physicsGuard = ref<PhysicsGuardSummary | null>(null)

let pollTimer: ReturnType<typeof setInterval> | null = null
let simAnimTimer: ReturnType<typeof setInterval> | null = null
/** 用户拖滑块时标记，避免 watch 回写冲突 */
let lastUserControlAt = 0
const userControlActive = ref(false)

function isUserControllingTelemetry() {
  return userControlActive.value || Date.now() - lastUserControlAt < 800
}

function isSimSessionActive() {
  const s = simStatus.value.status
  return s === 'running' || s === 'paused'
}

function estimateInteractiveDownstream(upstreamLevel: number): number {
  const tailBase = XIANGJIABA_HYDRO.downstreamNormalLevel
  const delta = (upstreamLevel - XIANGJIABA_HYDRO.normalPoolLevel) * 0.1
  return +Math.max(tailBase - 0.35, Math.min(tailBase + 1.2, tailBase + delta)).toFixed(2)
}

function onControlActive(active: boolean) {
  userControlActive.value = active
  if (active) lastUserControlAt = Date.now()
}

/** 用户手动调过滑块后，禁止静默场景加载覆盖 */
const userAdjustedParams = ref(false)

function ringPctToDeg(pct: number) {
  return `${Math.min(359.94, Math.max(0, pct) * 3.6)}deg`
}

/** 每次启动/重置递增，丢弃过期的 poll / WS 回调 */
let simRunToken = 0

// ── 6. Computed ──
const sliderWaterLevel = ref<number>(XIANGJIABA_HYDRO.normalPoolLevel)
const sliderRainfall = ref(0)

/** 左侧 P2、3D、弹窗 KPI 统一读 simStatus */
const displayWaterLevel = computed(() => simStatus.value.currentLevel)
const displayDownstreamLevel = computed(() => simStatus.value.currentDownstreamLevel)
const displayFlowRate = computed(() => simStatus.value.currentFlow)
const displayGateOpening = computed(() =>
  safeOpening(gateOpening.value, simStatus.value.currentOpening),
)
const displayGateOpenings = computed(() => gateOpenings.value.map((v) => safeOpening(v)))
const selectedGateOpening = computed(() =>
  selectedGateIndex.value >= 0 ? safeOpening(gateOpenings.value[selectedGateIndex.value]) : 0,
)
const selectedGateFlow = computed(() => {
  if (selectedGateIndex.value < 0) return 0
  return Math.round(
    estimateGateBayDischarge(displayWaterLevel.value, gateOpenings.value[selectedGateIndex.value], GATE_COUNT),
  )
})
const gateFlowAt = (index: number) =>
  Math.round(estimateGateBayDischarge(displayWaterLevel.value, gateOpenings.value[index] ?? 0, GATE_COUNT))

/** 五孔合计泄流，便于与入库流量对照 */
const totalOutflowRate = computed(() =>
  Math.round(
    displayGateOpenings.value.reduce(
      (sum, o) => sum + estimateGateBayDischarge(displayWaterLevel.value, o, GATE_COUNT),
      0,
    ),
  ),
)

const clampedWaterLevel = computed(() => clampSimulationLevel(displayWaterLevel.value))
const sceneWaterLevel = computed(() => clampedWaterLevel.value)
const smoothWaterLevel = useSmoothNumber(clampedWaterLevel, 800)

function applyInteractiveControl(opts?: { level?: number; rainfall?: number; opening?: number }) {
  lastUserControlAt = Date.now()
  userAdjustedParams.value = true
  if (opts?.rainfall != null) sliderRainfall.value = opts.rainfall
  if (opts?.opening != null) gateOpening.value = safeOpening(opts.opening)

  const level = clampSimulationLevel(
    opts?.level ?? sliderWaterLevel.value ?? simStatus.value.currentLevel,
  )
  sliderWaterLevel.value = level
  simParams.initialLevel = level
  const flow = Math.round(simParams.inflowRate + sliderRainfall.value * 12)
  const opening = Math.round(safeOpening(opts?.opening ?? gateOpening.value))

  simStatus.value = {
    ...simStatus.value,
    currentLevel: level,
    currentFlow: flow,
    currentOpening: opening,
    currentDownstreamLevel: estimateInteractiveDownstream(level),
  }
}
function stopSimAnimation() {
  if (simAnimTimer) {
    clearInterval(simAnimTimer)
    simAnimTimer = null
  }
}

function pushTelemetryHistory(level: number, flow: number, elapsedSec: number) {
  const historyLevels = [...simStatus.value.historyLevels, { time: elapsedSec, value: level }]
  const historyFlows = [...simStatus.value.historyFlows, { time: elapsedSec, value: flow }]
  if (historyLevels.length > 180) historyLevels.shift()
  if (historyFlows.length > 180) historyFlows.shift()
  return { historyLevels, historyFlows }
}

function resolveElapsedSecFromBackend(data: SimulationRealtimeData): number {
  const backend = Math.max(0, data.elapsedSec ?? 0)
  const local = simStatus.value.elapsedSec
  if (simStatus.value.status === 'paused') return local
  if (data.status === 'finished') return Math.max(local, backend)
  if (isSimSessionActive() || simStatus.value.status === 'running') {
    return Math.max(local, backend)
  }
  return backend
}

function applySimTelemetry(data: SimulationRealtimeData, fromBackend = false) {
  if (fromBackend) {
    const level = simStatus.value.currentLevel
    const flow = simStatus.value.currentFlow
    const opening = Math.round(safeOpening(gateOpening.value, simStatus.value.currentOpening))
    const downstream = simStatus.value.currentDownstreamLevel
    const elapsedSec = resolveElapsedSecFromBackend(data)
    let status = data.status
    if (
      simStatus.value.status === 'running'
      && status === 'idle'
      && elapsedSec === simStatus.value.elapsedSec
    ) {
      status = 'running'
    }
    let historyLevels = simStatus.value.historyLevels
    let historyFlows = simStatus.value.historyFlows
    if (elapsedSec > simStatus.value.elapsedSec) {
      historyLevels = [...historyLevels, { time: elapsedSec, value: level }]
      historyFlows = [...historyFlows, { time: elapsedSec, value: flow }]
      if (historyLevels.length > 180) historyLevels.shift()
      if (historyFlows.length > 180) historyFlows.shift()
    }
    simStatus.value = {
      ...data,
      status,
      elapsedSec,
      currentLevel: level,
      currentFlow: flow,
      currentOpening: opening,
      currentDownstreamLevel: downstream,
      historyLevels,
      historyFlows,
    }
    return
  }
  simStatus.value = data
  if (!isUserControllingTelemetry() && !isSimSessionActive() && !userAdjustedParams.value) {
    sliderWaterLevel.value = clampSimulationLevel(data.currentLevel)
  }
}

function startSimAnimation() {
  stopSimAnimation()
  simAnimTimer = setInterval(() => {
    if (simStatus.value.status !== 'running') return

    const elapsedSec = simStatus.value.elapsedSec + simSpeed.value
    if (elapsedSec >= durationSec.value) {
      simStatus.value = {
        ...simStatus.value,
        status: 'finished',
        elapsedSec: durationSec.value,
      }
      stopSimAnimation()
      return
    }

    const { historyLevels, historyFlows } = pushTelemetryHistory(
      simStatus.value.currentLevel,
      simStatus.value.currentFlow,
      elapsedSec,
    )
    simStatus.value = {
      ...simStatus.value,
      elapsedSec,
      historyLevels,
      historyFlows,
    }
  }, 1000)
}

watch(
  () => simStatus.value.currentLevel,
  (level) => {
    if (!isUserControllingTelemetry() && !isSimSessionActive() && !userAdjustedParams.value) {
      sliderWaterLevel.value = clampSimulationLevel(level)
    }
  },
)

watch(
  () => simStatus.value.status,
  (status) => {
    if (status === 'running') startSimAnimation()
    else stopSimAnimation()
  },
)

const smoothDownstreamLevel = useSmoothNumber(displayDownstreamLevel, 800)
const levelStatus = computed(() => getLevelStatus(displayWaterLevel.value))
const gaugePct = computed(() => levelGaugePercent(displayWaterLevel.value))
/** 入库流量环形占比（以当前工况入库流量为参考上限） */
const flowGaugePct = computed(() => {
  const refMax = Math.max(3500, simParams.inflowRate * 1.35, displayFlowRate.value * 1.1)
  return Math.max(0, Math.min(100, (displayFlowRate.value / refMax) * 100))
})
/** 闸门开度环形占比（0–100%），与数字一致 */
const gateGaugePct = computed(() => displayGateOpening.value)
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
const selectedScenario = computed(() =>
  scenarios.value.find((s) => s.id === selectedScenarioId.value) ?? null,
)
const sceneLabel = computed(() => {
  if (simScene.value === 'custom' && selectedScenario.value) {
    return `${SCENARIO_LIBRARY_LABEL} · ${selectedScenario.value.name}`
  }
  return SIMULATION_SCENE_MAP[simScene.value]?.label ?? ''
})
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

/** 打开全景仿真控制面板 */
function handleOpenSimModal() {
  viewMode.value = '3d'
  panoramaVisible.value = true
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
    const seen = new Set<number>()
    const list = (res.data.list ?? []).filter((s) => {
      if (deletedScenarioIds.has(s.id) || seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    scenarios.value = [...list].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0
      const tb = b.created_at ? Date.parse(b.created_at) : 0
      return tb - ta
    })
    if (scenarios.value.length) {
      const picked =
        (selectedScenarioId.value
          ? scenarios.value.find((s) => s.id === selectedScenarioId.value)
          : null) ?? scenarios.value[0]
      const canAutoLoad =
        (simStatus.value.status === 'idle' || simStatus.value.status === 'finished')
        && !userAdjustedParams.value
      if (canAutoLoad) {
        applyScenario(picked, { silent: true })
      } else if (picked) {
        selectedScenarioId.value = picked.id
        simScene.value = 'custom'
      }
    }
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
    scenarioForm.status = 'active'
  }
}

function patchScenarioInList(item: SimulationScenarioItem) {
  scenarios.value = scenarios.value.map((s) => (s.id === item.id ? item : s))
}

async function activateScenarioIfNeeded(scenarioId: number) {
  const activated = await ensureScenarioActive(scenarioId, scenarios.value)
  if (activated) patchScenarioInList(activated)
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
      scenarioForm.status = 'active'
      const res = await createSimulationScenario(scenarioForm)
      const created = res.data
      scenarios.value = [created, ...scenarios.value.filter((s) => s.id !== created.id)]
      ElMessage.success(`场景已创建 · ${created.name}`)
    }
    scenarioDialogVisible.value = false
    await fetchScenarios()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '保存失败'
    ElMessage.error(msg || '保存失败')
  }
}

async function handleDeleteScenario(item: SimulationScenarioItem) {
  try {
    await ElMessageBox.confirm(`确认删除场景「${item.name}」？`, '删除场景', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteSimulationScenario(item.id)
    deletedScenarioIds.add(item.id)
    persistDeletedScenarioIds(deletedScenarioIds)
    scenarios.value = scenarios.value.filter((s) => s.id !== item.id)
    if (selectedScenarioId.value === item.id) {
      selectedScenarioId.value = null
      if (simScene.value === 'custom' && scenarios.value.length) {
        applyScenario(scenarios.value[0], { silent: true })
      }
    }
    ElMessage.success(`已删除「${item.name}」(#${item.id})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '删除失败'
    if (msg.includes('仿真记录') || msg.includes('不可删除')) {
      ElMessage.warning('该场景已有仿真记录，不可删除')
    } else {
      ElMessage.error(msg || '删除失败，请稍后重试')
    }
  }
}

function onSimProgress(payload: SimulationProgressPayload) {
  if (!activeSimulationId.value) return
  applySimTelemetry(
    mapProgressToRealtime(simStatus.value, payload, durationSec.value),
    true,
  )
  if (simStatus.value.status === 'finished' && activeSimulationId.value) {
    void loadSimulationResult(activeSimulationId.value)
  }
}

async function loadSimulationResult(simulationId: string) {
  try {
    const res = await getSimulationResult(simulationId)
    if (res.data.points?.length) {
      applySimTelemetry(applyResultToRealtime(res.data.points, durationSec.value), true)
    }
  } catch {
    /* 结果接口未就绪时保留 WS 最后状态 */
  }
}

async function fetchSim() {
  try {
    const id = activeSimulationId.value
    if (!id) return
    const token = simRunToken
    const data = (await getSimulationStatus(id)).data
    if (token !== simRunToken || activeSimulationId.value !== id) return
    applySimTelemetry(data, true)
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
  reviewLoadError.value = null
  try {
    reviews.value = (await getFaultReviewList({ pageNum: 1, pageSize: 10 })).data.list
  } catch (err) {
    reviews.value = []
    if (isAuthError(err)) {
      reviewLoadError.value = '登录已过期，请重新登录后再查看故障复盘'
      ElMessage.warning(reviewLoadError.value)
    } else {
      const msg = isApiBusinessError(err)
        ? err.message
        : err instanceof Error
          ? err.message
          : '加载故障复盘失败'
      reviewLoadError.value = msg
    }
  } finally {
    reviewLoading.value = false
  }
}

function onTabChange(tab: SimulationTab) {
  activeTab.value = tab
  if (tab === 'model') fetchModels()
  else if (tab === 'report') fetchReports()
  else if (tab === 'review') fetchReviews()
}

function applyScenario(item: SimulationScenarioItem, opts?: { silent?: boolean; force?: boolean }) {
  selectedScenarioId.value = item.id
  simScene.value = 'custom'
  const params = scenarioToSimulationParams(item)
  simParams.scene = 'custom'
  simParams.inflowRate = params.inflowRate
  simParams.durationMin = params.durationMin

  const simActive = isSimSessionActive()
  if ((simActive || userAdjustedParams.value) && opts?.silent && !opts?.force) {
    return
  }

  simParams.initialLevel = params.initialLevel
  if (item.speed && [1, 2, 5, 10].includes(item.speed)) {
    simSpeed.value = item.speed as SimulationSpeed
  }
  const opening = safeOpening(params.gateOpening ?? getScenePreset('custom').gateOpening)
  gateOpening.value = opening
  syncGatesFromAggregate(opening)
  sliderWaterLevel.value = params.initialLevel
  applyInteractiveControl({
    level: params.initialLevel,
    opening,
  })
  userAdjustedParams.value = false
  if (simStatus.value.status === 'idle' || simStatus.value.status === 'finished') {
    simStatus.value = {
      ...simStatus.value,
      historyLevels: [{ time: 0, value: params.initialLevel }],
      historyFlows: [{ time: 0, value: params.inflowRate }],
    }
  }
  if (!opts?.silent) {
    ElMessage.success(`已联动${SCENARIO_LIBRARY_LABEL} · ${item.name}`)
  }
}

function onSelectScenario(item: SimulationScenarioItem) {
  applyScenario(item)
}

function applyScenePreset(scene: SimulationScene) {
  const preset = getScenePreset(scene)
  simParams.scene = scene
  simParams.initialLevel = preset.initialLevel
  simParams.inflowRate = preset.inflowRate
  simParams.durationMin = preset.durationMin
  if (simStatus.value.status === 'idle' || simStatus.value.status === 'finished') {
    sliderWaterLevel.value = preset.initialLevel
    gateOpening.value = preset.gateOpening
    syncGatesFromAggregate(preset.gateOpening)
    simStatus.value = {
      ...simStatus.value,
      currentLevel: preset.initialLevel,
      currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
      currentFlow: preset.inflowRate,
      currentOpening: preset.gateOpening,
      historyLevels: [{ time: 0, value: preset.initialLevel }],
      historyFlows: [{ time: 0, value: preset.inflowRate }],
    }
  }
}

function onGateSelect(index: number) {
  selectedGateIndex.value = index
}

function selectGateFromList(index: number) {
  onGateSelect(index)
}

const perGateOpening = (index: number) => safeOpening(gateOpenings.value[index] ?? displayGateOpening.value)

watch(() => panoramaVisible.value, (open) => {
  if (open) {
    setTimeout(() => panoramaRef.value?.resizeScene(), 100)
    setTimeout(() => panoramaRef.value?.resizeScene(), 450)
  }
})

function onSceneChange(scene: SimulationScene) {
  simScene.value = scene
  if (scene === 'custom') {
    const picked =
      scenarios.value.find((s) => s.id === selectedScenarioId.value) ?? scenarios.value[0]
    if (picked) {
      applyScenario(picked, { silent: true })
      return
    }
  }
  selectedScenarioId.value = null
  applyScenePreset(scene)
}

async function applyStartResult(
  data: { simulation_id: string; ws_endpoint?: string },
  scenarioId: number,
) {
  simRunToken++
  activeSimulationId.value = data.simulation_id
  rememberScenarioSimulation(scenarioId, data.simulation_id)
  simStatus.value = {
    ...simStatus.value,
    status: 'running',
    elapsedSec: 0,
    currentLevel: clampSimulationLevel(sliderWaterLevel.value),
    currentDownstreamLevel: estimateInteractiveDownstream(clampSimulationLevel(sliderWaterLevel.value)),
    currentFlow: Math.round(simParams.inflowRate + sliderRainfall.value * 12),
    currentOpening: safeOpening(gateOpening.value),
    historyLevels: [{ time: 0, value: clampSimulationLevel(sliderWaterLevel.value) }],
    historyFlows: [{ time: 0, value: Math.round(simParams.inflowRate + sliderRainfall.value * 12) }],
  }
  stopPoll()
  startSimAnimation()

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
}

async function handleStartSim() {
  if (!canStart.value || startingSim.value) return
  if (simScene.value === 'custom' && !selectedScenarioId.value) {
    ElMessage.warning(`请先在左侧${SCENARIO_LIBRARY_LABEL}选择场景`)
    return
  }
  if (!scenarios.value.length) {
    ElMessage.warning('场景库为空，请刷新或新建场景后再启动')
    return
  }
  startingSim.value = true
  try {
    if (!models.value.length) await fetchModels()
    simParams.initialLevel = clampSimulationLevel(sliderWaterLevel.value)
    const { scenarioId, modelId } = resolveScenarioId(
      simScene.value,
      scenarios.value,
      selectedScenarioId.value,
      models.value,
    )
    await activateScenarioIfNeeded(scenarioId)

    const startPayload = {
      ...simParams,
      scene: simScene.value,
      speed: simSpeed.value,
      gateOpening: gateOpening.value,
      scenarioId,
      modelId,
    }

    const runStart = async () => {
      const res = await startSimulation(startPayload)
      await applyStartResult(res.data, scenarioId)
      if (res.data.simulation_id.startsWith('MOCK-') && SIMULATION_USE_MOCK) {
        ElMessage.success(`仿真已启动（本地模式）· ${sceneLabel.value} · ${simSpeed.value}x 倍速`)
      } else {
        ElMessage.success(`仿真已启动 · ${sceneLabel.value} · ${simSpeed.value}x 倍速`)
      }
    }

    stopPoll()
    stopSimAnimation()
    disconnectSimStream()
    activeSimulationId.value = null

    await clearScenarioRunningTask(scenarioId, { activeSimulationId: null })

    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await runStart()
        lastErr = null
        break
      } catch (err) {
        lastErr = err
        if (isSimulationDraftScenarioError(err)) {
          await activateScenarioIfNeeded(scenarioId)
          continue
        }
        if (!isSimulationAlreadyRunningError(err)) throw err
        await clearScenarioRunningTask(scenarioId, {
          err,
          activeSimulationId: activeSimulationId.value,
        })
        activeSimulationId.value = null
      }
    }
    if (lastErr) throw lastErr
  } catch (err) {
    const msg = err instanceof Error ? err.message : '启动失败'
    ElMessage.error(msg || '启动失败，请确认场景与模型已在后端配置')
  } finally {
    startingSim.value = false
  }
}

async function handlePauseSim() {
  if (!canPause.value || !activeSimulationId.value) return
  try {
    const id = activeSimulationId.value
    if (simStatus.value.status === 'paused') {
      await resumeSimulation(id)
      ElMessage.success('仿真已继续')
    } else {
      await pauseSimulation(id)
      ElMessage.info('仿真已暂停')
    }
    await fetchSim()
  } catch {
    ElMessage.error('操作失败')
  }
}

function resetLocalSimState() {
  simRunToken++
  userAdjustedParams.value = false
  stopPoll()
  stopSimAnimation()
  activeSimulationId.value = null
  selectedGateIndex.value = -1
  sliderRainfall.value = 0
  disconnectSimStream()

  const preset = getScenePreset(simScene.value)
  if (simScene.value === 'custom' && selectedScenarioId.value) {
    const item = scenarios.value.find((s) => s.id === selectedScenarioId.value)
    if (item) {
      const params = scenarioToSimulationParams(item)
      simParams.scene = 'custom'
      simParams.initialLevel = params.initialLevel
      simParams.inflowRate = params.inflowRate
      simParams.durationMin = params.durationMin
      const opening = safeOpening(params.gateOpening ?? preset.gateOpening)
      gateOpening.value = opening
      syncGatesFromAggregate(opening)
      sliderWaterLevel.value = params.initialLevel
      simStatus.value = {
        status: 'idle',
        elapsedSec: 0,
        currentLevel: params.initialLevel,
        currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
        currentFlow: params.inflowRate,
        currentOpening: opening,
        historyLevels: [],
        historyFlows: [],
      }
      return
    }
  }

  simParams.scene = simScene.value
  simParams.initialLevel = preset.initialLevel
  simParams.inflowRate = preset.inflowRate
  simParams.durationMin = preset.durationMin
  gateOpening.value = preset.gateOpening
  syncGatesFromAggregate(preset.gateOpening)
  sliderWaterLevel.value = preset.initialLevel
  simStatus.value = {
    status: 'idle',
    elapsedSec: 0,
    currentLevel: preset.initialLevel,
    currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
    currentFlow: preset.inflowRate,
    currentOpening: preset.gateOpening,
    historyLevels: [],
    historyFlows: [],
  }
}

async function handleResetSim() {
  const { scenarioId } = resolveScenarioId(
    simScene.value,
    scenarios.value,
    selectedScenarioId.value,
    models.value,
  )
  try {
    await clearScenarioRunningTask(scenarioId, {
      activeSimulationId: activeSimulationId.value,
    })
  } catch {
    /* 本地仍重置 */
  }

  resetLocalSimState()
  mainSceneRef.value?.resetView()
  panoramaRef.value?.resizeScene()
  ElMessage.success('仿真已重置')
}

async function handleActivateModel(id: number) {
  try {
    await ElMessageBox.confirm('确认激活此模型？', '提示', { type: 'warning' })
    await activateModel(id)
    ElMessage.success('已激活')
    fetchModels()
  } catch { /* */ }
}
async function openModelRegistryDialog() {
  modelRegistryVisible.value = true
  registryKeyword.value = ''
  await fetchRegistryModels()
}

async function fetchRegistryModels() {
  registryLoading.value = true
  try {
    registryModels.value = (await getRegistryModelList(registryKeyword.value.trim() || undefined)).data
  } catch {
    registryModels.value = []
    ElMessage.warning(`${MODEL_REGISTRY_LABEL}列表为空，请先上传模型`)
  } finally {
    registryLoading.value = false
  }
}

async function handleRegistryUpload(opts: { file: File }) {
  const formData = new FormData()
  formData.append('file', opts.file)
  formData.append('name', opts.file.name.replace(/\.[^.]+$/, ''))
  formData.append('version', `v${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`)
  formData.append('type', 'general')

  registryUploading.value = true
  registryUploadProgress.value = 0
  const timer = setInterval(() => {
    if (registryUploadProgress.value < 90) registryUploadProgress.value += 10
  }, 200)

  try {
    const res = await uploadModel(formData)
    clearInterval(timer)
    registryUploadProgress.value = 100
    ElMessage.success(`「${opts.file.name}」已上传至${MODEL_REGISTRY_LABEL}`)
    registryUploadRef.value?.clearFiles()
    await fetchRegistryModels()
    if (res.data?.id) {
      await handleImportFromRegistry(res.data.id)
    }
  } catch (err) {
    clearInterval(timer)
    registryUploadProgress.value = 0
    const msg = isApiBusinessError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : '上传失败'
    ElMessage.error(msg)
  } finally {
    registryUploading.value = false
  }
}

function openModelVersionManagementPage() {
  modelRegistryVisible.value = false
  void router.push('/settings/models')
}

async function handleImportFromRegistry(id: number) {
  const picked = registryModels.value.find((m) => m.id === id)
  modelUploading.value = true
  try {
    const res = await importModelFromRegistry(id)
    const ai = res.data
    const idx = models.value.findIndex((m) => m.id === ai.id)
    if (idx >= 0) {
      models.value = models.value.map((m, i) => (i === idx ? ai : m))
    } else {
      models.value = [ai, ...models.value]
    }
    modelRegistryVisible.value = false
    activeTab.value = 'model'
    if (res.msg.includes('激活未成功')) {
      ElMessage.warning(res.msg)
    } else {
      ElMessage.success(
        res.msg ||
          `已从模型版本管理导入「${picked?.name ?? ai.type} ${ai.version}」`,
      )
    }
    try {
      await fetchModels()
    } catch {
      /* 刷新列表失败不影响导入结果 */
    }
  } catch (err) {
    const msg = isApiBusinessError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : '导入失败'
    if (/模型文件不存在|\.pth|权重文件/.test(msg)) {
      ElMessage.warning({ message: msg, duration: 8000, showClose: true })
    } else {
      ElMessage.error(msg || '导入失败')
    }
  } finally {
    modelUploading.value = false
  }
}

function registryTypeLabel(type: string) {
  return MODEL_TYPE_MAP[type] ?? type
}

function registryStatusLabel(status: string) {
  return REGISTRY_STATUS_MAP[status] ?? status
}

async function handleTrainModel(modelId: number) {
  try {
    await startTraining({ modelId, ...DEFAULT_TRAINING_CONFIG })
    ElMessage.success('训练任务已提交')
  } catch { ElMessage.error('训练启动失败') }
}
async function handleGenerateReport() {
  const id = activeSimulationId.value
  const hasSimData =
    simStatus.value.elapsedSec > 0 ||
    simStatus.value.historyLevels.length > 0 ||
    simStatus.value.status === 'running' ||
    simStatus.value.status === 'paused' ||
    simStatus.value.status === 'finished'

  if (!id || !hasSimData) {
    ElMessage.warning('请先点击底部「打开控制」启动仿真，运行后再生成报告')
    return
  }

  reportLoading.value = true
  try {
    const res = await generateReport(id, {
      scene: simScene.value,
      params: { ...simParams, scene: simScene.value },
      operatorName: userStore.userInfo?.nickname ?? userStore.userInfo?.username ?? '当前用户',
      simStatus: {
        ...simStatus.value,
        historyLevels: [...simStatus.value.historyLevels],
        historyFlows: [...simStatus.value.historyFlows],
      },
      gateOpening: gateOpening.value,
    })
    reports.value = [res.data, ...reports.value.filter((r) => r.id !== res.data.id)]
    ElMessage.success('报告已生成，可在下方列表下载')
    await fetchReports()
    activeTab.value = 'report'
  } catch (err) {
    const msg = err instanceof Error ? err.message : '生成失败'
    ElMessage.error(msg || '生成失败，请确认已完成仿真')
  } finally {
    reportLoading.value = false
  }
}

async function handleDownloadReport(id: number) {
  try {
    const blob = await downloadReport(id)
    const report = reports.value.find((r) => r.id === id)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `方案评估报告_${report?.scene ?? 'sim'}_${id}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '下载失败'
    ElMessage.error(msg)
  }
}
function applyImportedSimulationParams(
  params: SimulationParams & { gateOpening?: number },
  label?: string,
  backendMsg?: string,
) {
  simScene.value = params.scene
  Object.assign(simParams, params)
  const opening = safeOpening(
    params.gateOpening ?? getScenePreset(params.scene).gateOpening,
  )
  gateOpening.value = opening
  syncGatesFromAggregate(opening)
  sliderWaterLevel.value = params.initialLevel

  simStatus.value = {
    ...simStatus.value,
    status: 'idle',
    elapsedSec: 0,
    currentLevel: params.initialLevel,
    currentDownstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
    currentFlow: params.inflowRate,
    currentOpening: opening,
    historyLevels: [{ time: 0, value: params.initialLevel }],
    historyFlows: [{ time: 0, value: params.inflowRate }],
  }

  activeTab.value = 'control'
  viewMode.value = '3d'
  const sceneName = SIMULATION_SCENE_MAP[params.scene]?.label ?? params.scene
  ElMessage.success(
    backendMsg ??
      (label
        ? `已导入「${label}」· ${sceneName} · 水位 ${params.initialLevel} m · 开度 ${opening}%`
        : `已导入仿真参数 · ${sceneName}`),
  )
}

async function handleImportToSim(id: number) {
  const review = reviews.value.find((r) => r.id === id)
  if (simStatus.value.status === 'running' || simStatus.value.status === 'paused') {
    disconnectSimStream()
    stopPoll()
    const simId = activeSimulationId.value
    if (simId) {
      try {
        await resetSimulation(simId)
      } catch {
        /* mock 重置失败不阻断导入 */
      }
    }
    activeSimulationId.value = null
    selectedGateIndex.value = -1
  }
  try {
    const res = await importToSimulation(id)
    applyImportedSimulationParams(res.data, review?.faultType, res.msg || undefined)
  } catch (err) {
    if (isAuthError(err)) {
      ElMessage.warning('登录已过期，请重新登录后再导入仿真')
      return
    }
    // 后端 import-incident 400 时，仍用故障详情驱动前端参数，避免界面无反应
    try {
      const detail = review ?? (await getFaultReviewDetail(id)).data
      if (detail) {
        applyImportedSimulationParams(faultReviewToSimulationParams(detail), detail.faultType)
        ElMessage.warning(
          isApiBusinessError(err)
            ? `后端导入未成功（${err.message}），已按故障记录应用本地仿真参数`
            : '后端导入未成功，已按故障记录应用本地仿真参数',
        )
        return
      }
    } catch {
      /* 详情也失败则走下方统一报错 */
    }
    const msg = isApiBusinessError(err)
      ? err.message
      : err instanceof Error
        ? err.message
        : '导入失败'
    ElMessage.error(msg || '导入失败，请确认后端已配置故障记录')
  }
}

// ── 8. 生命周期 ──
onMounted(() => {
  gateOpening.value = 100
  syncGatesFromAggregate(100)
  simStatus.value = { ...simStatus.value, currentOpening: 100 }
  applyInteractiveControl()
  void fetchScenarios()
  fetchSim()
  fetchModels()
  fetchReports()
  fetchReviews()
  fetchPhysicsGuard()
})
onUnmounted(() => {
  stopPoll()
  stopSimAnimation()
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
                <div
                  class="twin-kpi__ring"
                  :style="{ '--ring-deg': ringPctToDeg(gaugePct), '--c': levelStatus.color }"
                >
                  <b>{{ displayWaterLevel.toFixed(2) }}</b>
                  <small>m</small>
                </div>
                <span>上游水位</span>
              </div>
              <div class="twin-kpi">
                <div
                  class="twin-kpi__ring twin-kpi__ring--flow"
                  :style="{ '--ring-deg': ringPctToDeg(flowGaugePct), '--c': '#1890ff' }"
                >
                  <b>{{ displayFlowRate }}</b>
                  <small>m³/s</small>
                </div>
                <span>入库流量</span>
              </div>
              <div class="twin-kpi">
                <div
                  class="twin-kpi__ring twin-kpi__ring--gate"
                  :style="{ '--ring-deg': ringPctToDeg(gateGaugePct), '--c': '#22c55e' }"
                >
                  <b>{{ displayGateOpening.toFixed(1) }}</b>
                  <small>%</small>
                </div>
                <span>闸门开度</span>
              </div>
            </div>
            <ul class="twin-ref-list">
              <li><span>正常蓄水</span><b>{{ XIANGJIABA_HYDRO.normalPoolLevel }} m</b></li>
              <li><span>汛限水位</span><b>{{ XIANGJIABA_HYDRO.floodLimitLevel }} m</b></li>
              <li><span>坝顶高程</span><b>{{ XIANGJIABA_HYDRO.crestElevation }} m</b></li>
              <li><span>下游尾水</span><b>{{ displayDownstreamLevel.toFixed(2) }} m</b></li>
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

          <GlassPanel3D :title="SCENARIO_LIBRARY_LABEL" compact fill class="twin-scenario-panel">
            <ScenarioListPanel
              :scenarios="scenarios"
              :loading="scenarioLoading"
              :selected-id="selectedScenarioId"
              :linked="simScene === 'custom'"
              @refresh="fetchScenarios"
              @create="openCreateScenario"
              @edit="openEditScenario"
              @delete="handleDeleteScenario"
              @select="onSelectScenario"
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
              <span>水位 <b :style="{ color: levelStatus.color }">{{ displayWaterLevel.toFixed(2) }} m</b></span>
              <span>开度 <b>{{ displayGateOpening.toFixed(1) }}%</b></span>
              <span>仿真 <b>{{ elapsedLabel }}</b></span>
              <span>倍速 <b>{{ simSpeed }}x</b></span>
            </div>
            <TwinDamSchematic2D
              v-if="viewMode === '2d'"
              :water-level="smoothWaterLevel"
              :downstream-level="smoothDownstreamLevel"
              :gate-opening="displayGateOpening"
              :gate-openings="displayGateOpenings"
              :flow-rate="displayFlowRate"
            />
            <ThreeDamScene
              v-else
              ref="mainSceneRef"
              visual-mode="twin"
              :water-level="sceneWaterLevel"
              :downstream-level="displayDownstreamLevel"
              :gate-opening="displayGateOpening"
              :gate-openings="displayGateOpenings"
              :flow-rate="displayFlowRate"
              :rainfall="sliderRainfall"
              :sim-scene="simScene"
              :sim-running="simActive"
              :selected-gate-index="selectedGateIndex"
              @gate-select="onGateSelect"
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
              <li
                v-for="n in 5"
                :key="n"
                class="twin-gate-item"
                :class="{ 'twin-gate-item--active': selectedGateIndex === n - 1 }"
                role="button"
                tabindex="0"
                @click="selectGateFromList(n - 1)"
                @keydown.enter="selectGateFromList(n - 1)"
              >
                <span>{{ n }} 号表孔</span>
                <b>{{ perGateOpening(n - 1).toFixed(1) }}%</b>
                <em v-if="selectedGateIndex === n - 1">单孔 {{ gateFlowAt(n - 1) }} m³/s</em>
              </li>
            </ul>
            <p class="twin-gate-summary">
              {{
                selectedGateIndex >= 0
                  ? `${selectedGateIndex + 1} 号闸门已选中 · 单孔约 ${gateFlowAt(selectedGateIndex)} m³/s · 五孔合计约 ${totalOutflowRate} m³/s`
                  : `5 孔默认全开 · 合计泄流约 ${totalOutflowRate} m³/s · 点击闸面查看细节`
              }}
            </p>
            <div v-if="selectedGateIndex >= 0" class="twin-gate-slider">
              <label>{{ selectedGateIndex + 1 }} 号表孔开度 <b>{{ perGateOpening(selectedGateIndex).toFixed(0) }}%</b></label>
              <ElSlider
                :model-value="gateOpenings[selectedGateIndex]"
                :min="0"
                :max="100"
                :step="1"
                @update:model-value="(v) => setGateOpeningAt(selectedGateIndex, Number(v))"
              />
            </div>
            <div v-else class="twin-gate-slider">
              <label>平均开度 <b>{{ displayGateOpening.toFixed(0) }}%</b></label>
              <ElSlider
                :model-value="gateOpening"
                :min="0"
                :max="100"
                :step="1"
                @update:model-value="(v) => { gateOpening = Number(v) }"
              />
            </div>
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
                  :model-uploading="modelUploading"
                  :report-loading="reportLoading"
                  :review-loading="reviewLoading"
                  :review-error="reviewLoadError"
                  compact
                  hide-tabs
                  @tab-change="onTabChange"
                  @activate="handleActivateModel"
                  @open-model-registry="openModelRegistryDialog"
                  @train="handleTrainModel"
                  @generate="handleGenerateReport"
                  @download-report="handleDownloadReport"
                  @import-review="handleImportToSim"
                  @refresh-reviews="fetchReviews"
                />
              </div>
            </div>
          </GlassPanel3D>
        </aside>
      </div>

      <DamPanoramaModal
        ref="panoramaRef"
        :visible="panoramaVisible"
        :water-level="displayWaterLevel"
        :downstream-level="displayDownstreamLevel"
        :gate-opening="displayGateOpening"
        :gate-openings="displayGateOpenings"
        :flow-rate="displayFlowRate"
        :rainfall="sliderRainfall"
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
        :selected-gate-index="selectedGateIndex"
        :selected-gate-opening="selectedGateOpening"
        :selected-gate-flow="selectedGateFlow"
        :scenarios="scenarios"
        :selected-scenario-id="selectedScenarioId"
        @close="panoramaVisible = false"
        @start="handleStartSim"
        @pause="handlePauseSim"
        @reset="handleResetSim"
        @update:sim-scene="onSceneChange"
        @update:sim-speed="simSpeed = $event"
        @update:gate-opening="gateOpening = $event"
        @update:gate-opening-at="setGateOpeningAt"
        @update:water-level="(v) => applyInteractiveControl({ level: v })"
        @update:rainfall="(v) => applyInteractiveControl({ rainfall: v })"
        @control-active="onControlActive"
        @select-scenario="onSelectScenario"
        @gate-select="onGateSelect"
      />

      <ElDialog v-model="showParams" title="仿真参数" width="440px" destroy-on-close>
        <div class="param-panel__status">
          <ElTag size="small" :color="statusInfo?.color">{{ statusInfo?.label }}</ElTag>
          <span>{{ getSimulationSceneLabel(simScene) }}</span>
        </div>
        <ElForm label-position="top" class="param-form">
          <ElFormItem label="仿真场景" class="param-form__full">
            <ElSelect :model-value="simScene" @change="onSceneChange($event as SimulationScene)">
              <ElOption
                v-for="s in SIMULATION_SCENE_OPTIONS"
                :key="s.value"
                :label="getSimulationSceneLabel(s.value)"
                :value="s.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="simScene === 'custom'" :label="SCENARIO_LIBRARY_LABEL" class="param-form__full">
            <ElSelect
              :model-value="selectedScenarioId"
              placeholder="请选择场景"
              style="width: 100%"
              @change="(id: number) => {
                const item = scenarios.find((s) => s.id === id)
                if (item) onSelectScenario(item)
              }"
            >
              <ElOption
                v-for="s in scenarios"
                :key="s.id"
                :label="`#${s.id} · ${s.name}`"
                :value="s.id"
              />
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

      <ElDialog
        v-model="modelRegistryVisible"
        :title="MODEL_REGISTRY_LABEL"
        width="600px"
        destroy-on-close
      >
        <div class="sim-registry-toolbar">
          <ElInput
            v-model="registryKeyword"
            placeholder="搜索模型名称..."
            clearable
            @keyup.enter="fetchRegistryModels"
          />
          <ElButton :loading="registryLoading" @click="fetchRegistryModels">刷新</ElButton>
          <ElUpload
            ref="registryUploadRef"
            :http-request="handleRegistryUpload"
            :limit="1"
            accept=".pt,.pth,.onnx,.h5,.pb,.zip"
            :show-file-list="false"
            :on-exceed="() => ElMessage.warning('仅允许上传一个文件')"
          >
            <ElButton type="primary" :icon="Upload" :loading="registryUploading">
              {{ registryUploading ? `上传中 ${registryUploadProgress}%` : '上传模型' }}
            </ElButton>
          </ElUpload>
        </div>
        <p class="sim-registry-tip">
          与「系统配置 → {{ MODEL_REGISTRY_LABEL }}」共用同一上传接口；支持 .pt / .pth / .onnx / .h5 / .pb / .zip，单文件 ≤ 500MB
        </p>
        <ElEmpty
          v-if="!registryModels.length && !registryLoading"
          :description="`暂无模型，请先上传或前往${MODEL_REGISTRY_LABEL}页面上传`"
        />
        <ul v-else class="sim-registry-list">
          <li v-for="m in registryModels" :key="m.id" class="sim-registry-list__item">
            <div class="sim-registry-list__main">
              <strong>{{ m.name }}</strong>
              <span>{{ registryTypeLabel(m.type) }} · {{ m.version }}</span>
            </div>
            <div class="sim-registry-list__meta">
              {{ registryStatusLabel(m.status) }}
              <template v-if="m.health_grade"> · 健康 {{ m.health_grade }}</template>
            </div>
            <ElButton
              type="primary"
              size="small"
              :loading="modelUploading"
              :disabled="m.status === 'deprecated'"
              @click="handleImportFromRegistry(m.id)"
            >
              {{ m.status === 'active' ? '已激活 · 选用' : '导入并激活' }}
            </ElButton>
          </li>
        </ul>
        <template #footer>
          <ElButton link type="primary" @click="openModelVersionManagementPage">
            前往{{ MODEL_REGISTRY_LABEL }}完整页面
          </ElButton>
        </template>
      </ElDialog>
    </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/text-mixins.scss' as *;
@use '@/assets/styles/cockpit.scss' as *;

.sim-registry-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  align-items: center;

  .el-input {
    flex: 1;
    min-width: 160px;
  }
}

.sim-registry-tip {
  margin: 0 0 12px;
  font-size: $cockpit-font-sm;
  color: #64748b;
  line-height: 1.5;
}

.sim-registry-search {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.sim-registry-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 360px;
  overflow-y: auto;

  &__item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    align-items: center;
    padding: 10px 8px;
    border-bottom: 1px solid rgba(24, 144, 255, 0.1);
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 2px;

    strong { color: #1e4976; font-size: $cockpit-font-base; }
    span { color: #64748b; font-size: $cockpit-font-sm; }
  }

  &__meta {
    grid-column: 1;
    font-size: $cockpit-font-sm;
    color: #94a3b8;
  }

  &__item > .el-button {
    grid-column: 2;
    grid-row: 1 / span 2;
  }
}

.sim-vsim-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 16px;
  border-radius: 10px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  font-size: $cockpit-font-sm;
  color: #389e0d;
}

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
        height: 100%;
        overflow: hidden;
        align-self: stretch;

        :deep(.glass-panel__body) {
          padding: 8px 12px 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
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

  .sim-actions-bar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 14px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(232, 244, 252, 0.88) 100%);
    border: 1px solid rgba(24, 144, 255, 0.2);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(24, 144, 255, 0.08);

    &__btn {
      padding: 10px 32px;
      font-size: $cockpit-font-base;
      font-weight: 600;
      color: #fff;
      background: linear-gradient(135deg, #1890ff, #096dd9);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 0 16px rgba(24, 144, 255, 0.3);
      transition:
        transform 0.2s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.2s ease;

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 20px rgba(24, 144, 255, 0.4);
      }

      &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
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

  /* 小屏 / 低分辨率 / Windows 125%–150% 缩放：避免三栏被裁切 */
  @media (max-width: 1440px) {
    padding: 10px 12px 12px;

    .sim-page__grid {
      grid-template-columns: minmax(220px, 1fr) minmax(0, 1.5fr) minmax(240px, 1fr);
      gap: 10px;
    }
  }

  @media (max-width: 1280px) {
    height: auto;
    min-height: calc(100vh - var(--header-height));
    overflow-x: hidden;
    overflow-y: auto;

    .sim-page__grid {
      grid-template-columns: 1fr;
      grid-auto-rows: auto;
      gap: 12px;
      overflow: visible;
      height: auto;
    }

    .sim-page__col {
      height: auto;
      overflow: visible;
    }

    .sim-page__col--left {
      grid-template-rows: auto auto auto;
    }

    .sim-page__col--center {
      min-height: 380px;
    }

    .sim-func-panel {
      min-height: 320px;
      max-height: none;
    }
  }

  @media (max-height: 860px) and (min-width: 1281px) {
    height: auto;
    min-height: calc(100vh - var(--header-height));
    overflow-x: hidden;
    overflow-y: auto;

    .sim-page__grid {
      overflow: visible;
    }

    .sim-page__col--left {
      overflow-y: auto;
      @include hide-scrollbar;
    }

    .sim-func-panel__scroll {
      max-height: min(42vh, 420px);
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
    background: conic-gradient(
      from -90deg,
      var(--c, #1890ff) 0deg,
      var(--c, #1890ff) var(--ring-deg, 0deg),
      #e2e8f0 var(--ring-deg, 0deg),
      #e2e8f0 360deg
    );
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

    &--flow { --c: #1890ff; }
    &--gate { --c: #22c55e; }
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

  @media (max-width: 960px) {
    grid-template-columns: repeat(3, 1fr);
  }

  li,
  .twin-gate-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border-radius: 6px;
    background: rgba(34, 197, 94, 0.06);
    border: 1px solid rgba(34, 197, 94, 0.18);
    text-align: center;
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      border-color: rgba(24, 144, 255, 0.35);
    }

    &--active {
      background: linear-gradient(180deg, rgba(24, 144, 255, 0.14), rgba(24, 144, 255, 0.06));
      border-color: rgba(24, 144, 255, 0.55);
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.18);

      b { color: #1890ff; }
      em { color: #1890ff; }
    }

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

    em {
      font-size: 10px;
      font-style: normal;
      color: #64748b;
    }
  }
}

.twin-gate-slider {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed rgba(34, 197, 94, 0.2);

  label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
    font-size: $cockpit-font-sm;
    color: #64748b;

    b {
      color: #16a34a;
      font-size: $cockpit-font-base;
    }
  }

  :deep(.el-slider__runway) {
    background: rgba(34, 197, 94, 0.12);
  }

  :deep(.el-slider__bar) {
    background: linear-gradient(90deg, #22c55e, #4ade80);
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
