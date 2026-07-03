<script setup lang="ts">
// ============================================================
// 调度决策 — AI 决策 + LSTM 预测 + 手控 + 急停 + 调度记录
// ============================================================

// ── 1. 外部依赖 ──
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  ElButton, ElSlider, ElSelect, ElOption, ElMessage, ElMessageBox,
  ElDialog, ElFormItem, ElInput, ElTable, ElTableColumn,
} from 'element-plus'
import { Refresh, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import DamPanoramaModal from '@/components/cockpit/DamPanoramaModal.vue'
import { getLevelStatus } from '@/constants/xiangjiaba'
import { SIMULATION_STATUS_MAP } from '@/constants/simulation'
import type { SimulationRealtimeData } from '@/types/simulation'

use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer])
import {
  AUTO_LEVEL_OPTIONS,
  getConfidenceColor, FACTOR_DIRECTION_MAP,
  OPENING_MIN, OPENING_MAX, OPENING_STEP,
} from '@/constants/dispatch'
import type { DecisionDetail, DispatchRecord, PredictionData } from '@/types/dispatch'

type PlanAlt = NonNullable<DecisionDetail['alternatives']>[number]

import { getPrediction, executeDispatch } from '@/api/dispatch'
import { useUserStore } from '@/stores/user'
import { useOperationLog } from '@/composables/useOperationLog'

const userStore = useUserStore()
const { record: recordLog } = useOperationLog()

const canModifyLevel = computed(() => {
  const roles = userStore.userInfo?.roles ?? []
  return roles.includes('admin') || roles.includes('algorithm_engineer')
})

// ── 5. 响应式数据 ──
const status = ref({
  mode: 'auto' as 'auto' | 'manual',
  autoLevel: 2 as 1 | 2 | 3,
  upstreamLevel: 380.65, downstreamLevel: 278.42,
  flowRate: 1920, gateOpening: 45,
  lastDispatchAt: null as string | null, isExecuting: false,
})

const latestDecision = ref<DecisionDetail | null>(null)
const prediction = ref<PredictionData | null>(null)
const records = ref<DispatchRecord[]>([])
const riskLevelCache = ref(1) // 1=low 2=medium 3=high

const predictTerm = ref<1 | 2 | 3>(2) // 默认 3h
const metricKey = ref<'water' | 'flow'>('water')
const selectedPlanId = ref('')
const targetOpening = ref(45)
const autoExecEnabled = ref(true)

const levelDialogVisible = ref(false)
const pendingLevel = ref<1 | 2 | 3>(2)
const ignoreVisible = ref(false)
const ignoreReason = ref('')

const showDataTable = ref(true)
const panoramaVisible = ref(false)
const previewPlan = ref<PlanAlt | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

// ── 6. Computed ──

const riskCards = computed(() => [
  { key: 1, label: '低风险场景', desc: '水位在安全区间 ±0.3m 内', action: '可自动执行', color: '#22c55e', active: riskLevelCache.value === 1 },
  { key: 2, label: '中风险场景', desc: '水位偏离 ±0.3m~±1m', action: '需人工确认', color: '#f59e0b', active: riskLevelCache.value === 2 },
  { key: 3, label: '高风险场景', desc: '超出预警阈值/洪水预警', action: '禁止自动执行', color: '#ef4444', active: riskLevelCache.value === 3 },
])

const chartOption = computed(() => {
  const data = prediction.value ?? generateMockPrediction(predictTerm.value)
  const pts = metricKey.value === 'water' ? data.water_seq : data.flow_seq
  const times = pts.map((p) => {
    const d = new Date(p.time)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  })
  const values = pts.map((p) => p.value)
  const isWater = metricKey.value === 'water'

  return {
    animation: false,
    backgroundColor: 'transparent',
    color: ['#1890ff'],
    grid: { top: 24, right: 36, bottom: 54, left: 62, containLabel: true },
    tooltip: {
      trigger: 'axis',
      showContent: false,
      axisPointer: {
        type: 'cross',
        lineStyle: { color: 'rgba(24,144,255,0.35)', type: 'dashed', width: 1 },
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: times,
      axisLine: { show: true, lineStyle: { color: '#bfdbfe' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b', fontSize: 11, interval: Math.max(0, Math.floor(times.length / 8)) },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: true, lineStyle: { color: '#bfdbfe' } },
      axisLabel: { color: '#64748b', fontSize: 11, formatter: (value: number) => isWater ? value.toFixed(1) : value.toFixed(0) },
      splitLine: { show: true, lineStyle: { color: 'rgba(148,163,184,0.22)', type: 'dashed' } },
    },
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      {
        type: 'slider',
        start: 0,
        end: 100,
        height: 22,
        bottom: 10,
        borderColor: 'rgba(24,144,255,0.18)',
        fillerColor: 'rgba(24,144,255,0.12)',
        handleStyle: { color: '#1890ff' },
        textStyle: { color: '#64748b' },
      },
    ],
    series: [{
      name: '预测曲线',
      type: 'line',
      data: values,
      smooth: true,
      showSymbol: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: { color: '#1890ff', width: 3 },
      itemStyle: { color: '#1890ff', borderColor: '#ffffff', borderWidth: 1 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(24,144,255,0.28)' },
            { offset: 1, color: 'rgba(24,144,255,0.03)' },
          ],
        },
      },
      z: 5,
    }],
  }
})


/** 给数据表提供始终有值的 mock 数据 */
const mockTableData = computed(() => {
  const waterSeq = prediction.value?.water_seq ?? generateMockPrediction(predictTerm.value).water_seq
  const flowSeq = prediction.value?.flow_seq ?? generateMockPrediction(predictTerm.value).flow_seq
  return waterSeq.map((p, i) => ({
    time: p.time,
    water: p.value,
    flow: flowSeq[i]?.value ?? flowSeq[flowSeq.length - 1]?.value ?? 0,
  }))
})

/** 当前选中方案（切换时实时返回对应方案的各指标） */
const activePlan = computed(() => {
  if (!latestDecision.value) return null
  return latestDecision.value.alternatives?.find((p) => p.id === selectedPlanId.value) ?? null
})

function selectPlan(plan: { id: string; opening: number }) {
  selectedPlanId.value = plan.id
  targetOpening.value = plan.opening
}

function openPlanPanorama(plan: PlanAlt) {
  selectPlan(plan)
  previewPlan.value = plan
  panoramaVisible.value = true
}

const panoramaWaterLevel = computed(() =>
  previewPlan.value?.expectedLevel ?? latestDecision.value?.upstream_level ?? status.value.upstreamLevel,
)
const panoramaGateOpening = computed(() =>
  previewPlan.value?.opening ?? targetOpening.value,
)
const panoramaLevelStatus = computed(() => getLevelStatus(panoramaWaterLevel.value))
const panoramaSimStatus = computed<SimulationRealtimeData>(() => ({
  status: 'idle',
  elapsedSec: 0,
  currentLevel: panoramaWaterLevel.value,
  currentDownstreamLevel: status.value.downstreamLevel,
  currentFlow: status.value.flowRate,
  currentOpening: panoramaGateOpening.value,
  historyLevels: [],
  historyFlows: [],
}))
const panoramaStatusInfo = computed(() => SIMULATION_STATUS_MAP.idle)

// ── 7. 方法 ──

/** Mock 初始数据（后端未就绪时使用） */
const MOCK_RESERVOIR_ID = 1
let mockTick = 0

/** 模拟不同时段的数据变化 */
function buildMockDecision(tick: number): DecisionDetail {
  // 每 5 个 tick 切换一次风险场景
  const scenarioIdx = 0 // 固定低风险场景
  const now = new Date()
  const scenarios = [
    { // 低风险 — 正常调度
      risk_rank: 1 as const, decision_mode: 'L2' as const, confidence: 87,
      upstream_level: 380.65, inflow_rate: 1920, current_opening: 45,
      recommended_opening: 52, reward_score: 0.87,
      factors: [
        { name: '当前水位', value: '380.65 m', direction: 'up' as const, weight: 0.22 },
        { name: 'LSTM预测水位', value: '381.10 m', direction: 'up' as const, weight: 0.25 },
        { name: '实时流量', value: '1920 m³/s', direction: 'up' as const, weight: 0.18 },
        { name: '闸门开度', value: '45%', direction: 'neutral' as const, weight: 0.12 },
        { name: '防洪安全约束', value: '0.85 m', direction: 'down' as const, weight: 0.13 },
        { name: '生态流量要求', value: '达标', direction: 'neutral' as const, weight: 0.10 },
      ],
      alternatives: [
        { id: '方案A·推荐', opening: 52, expectedLevel: 380.2, power: 2850, safetyScore: 92, totalScore: 91, recommended: true, confidence: 87, factorImpacts: { '当前水位': { direction: 'down' as const, value: '380.20 m', weight: 0.18 }, '防洪安全约束': { direction: 'neutral' as const, value: '充足', weight: 0.20 } } },
        { id: '方案B·保守', opening: 38, expectedLevel: 380.8, power: 2100, safetyScore: 96, totalScore: 85, recommended: false, confidence: 72, factorImpacts: { '当前水位': { direction: 'up' as const, value: '380.80 m', weight: 0.35 }, '防洪安全约束': { direction: 'neutral' as const, value: '充足', weight: 0.18 } } },
        { id: '方案C·激进', opening: 65, expectedLevel: 379.6, power: 3200, safetyScore: 78, totalScore: 82, recommended: false, confidence: 58, factorImpacts: { '当前水位': { direction: 'down' as const, value: '379.60 m', weight: 0.10 }, '防洪安全约束': { direction: 'down' as const, value: '偏紧', weight: 0.28 } } },
      ],
    },
    { // 中风险 — 水位偏高
      risk_rank: 2 as const, decision_mode: 'L1' as const, confidence: 68,
      upstream_level: 381.05, inflow_rate: 2450, current_opening: 35,
      recommended_opening: 58, reward_score: 0.62,
      factors: [
        { name: '当前水位', value: '381.05 m', direction: 'up' as const, weight: 0.30 },
        { name: 'LSTM预测水位', value: '381.42 m', direction: 'up' as const, weight: 0.28 },
        { name: '实时流量', value: '2450 m³/s', direction: 'up' as const, weight: 0.22 },
        { name: '闸门开度', value: '35%', direction: 'down' as const, weight: 0.10 },
        { name: '防洪安全约束', value: '0.42 m', direction: 'down' as const, weight: 0.06 },
        { name: '生态流量要求', value: '偏紧', direction: 'neutral' as const, weight: 0.04 },
      ],
      alternatives: [
        { id: '方案A·推荐', opening: 58, expectedLevel: 380.5, power: 3100, safetyScore: 76, totalScore: 82, recommended: true, confidence: 68, factorImpacts: { 'LSTM预测水位': { direction: 'up' as const, value: '381.42 m', weight: 0.35 }, '防洪安全约束': { direction: 'down' as const, value: '0.42 m', weight: 0.10 } } },
        { id: '方案B·保守', opening: 42, expectedLevel: 380.9, power: 2350, safetyScore: 88, totalScore: 79, recommended: false, confidence: 55, factorImpacts: { 'LSTM预测水位': { direction: 'up' as const, value: '381.10 m', weight: 0.40 }, '防洪安全约束': { direction: 'neutral' as const, value: '0.70 m', weight: 0.18 } } },
        { id: '方案C·激进', opening: 72, expectedLevel: 379.8, power: 3600, safetyScore: 58, totalScore: 67, recommended: false, confidence: 42, factorImpacts: { 'LSTM预测水位': { direction: 'up' as const, value: '381.80 m', weight: 0.45 }, '防洪安全约束': { direction: 'down' as const, value: '风险', weight: 0.06 } } },
      ],
    },
    { // 高风险 — 洪水预警
      risk_rank: 3 as const, decision_mode: 'L1' as const, confidence: 42,
      upstream_level: 381.62, inflow_rate: 3800, current_opening: 25,
      recommended_opening: 80, reward_score: 0.35,
      factors: [
        { name: '当前水位', value: '381.62 m', direction: 'up' as const, weight: 0.35 },
        { name: 'LSTM预测水位', value: '382.10 m', direction: 'up' as const, weight: 0.30 },
        { name: '实时流量', value: '3800 m³/s', direction: 'up' as const, weight: 0.20 },
        { name: '闸门开度', value: '25%', direction: 'down' as const, weight: 0.08 },
        { name: '防洪安全约束', value: '0.12 m', direction: 'down' as const, weight: 0.04 },
        { name: '生态流量要求', value: '严重不足', direction: 'down' as const, weight: 0.03 },
      ],
      alternatives: [
        { id: '方案A·推荐', opening: 80, expectedLevel: 379.5, power: 4200, safetyScore: 52, totalScore: 68, recommended: true, confidence: 42, factorImpacts: { '当前水位': { direction: 'down' as const, value: '379.50 m', weight: 0.15 }, '防洪安全约束': { direction: 'down' as const, value: '0.12 m', weight: 0.25 } } },
        { id: '方案B·保守', opening: 60, expectedLevel: 380.5, power: 3400, safetyScore: 70, totalScore: 74, recommended: false, confidence: 35, factorImpacts: { '当前水位': { direction: 'up' as const, value: '380.50 m', weight: 0.28 }, '防洪安全约束': { direction: 'down' as const, value: '临界', weight: 0.20 } } },
        { id: '方案C·极限', opening: 95, expectedLevel: 378.8, power: 4800, safetyScore: 35, totalScore: 55, recommended: false, confidence: 20, factorImpacts: { '当前水位': { direction: 'down' as const, value: '378.80 m', weight: 0.08 }, '防洪安全约束': { direction: 'down' as const, value: '危险', weight: 0.35 } } },
      ],
    },
  ]
  const s = scenarios[scenarioIdx]
  return {
    id: tick + 1, trace_id: `trace-${String(tick + 1).padStart(3, '0')}`, reservoir_id: 1,
    decision_time: now.toISOString(), decision_mode: s.decision_mode, risk_rank: s.risk_rank,
    upstream_level: +(s.upstream_level + Math.sin(tick * 0.3) * 0.1).toFixed(2),
    downstream_level: 278.42, inflow_rate: s.inflow_rate + Math.round(Math.sin(tick * 0.2) * 80),
    current_opening: s.current_opening,
    lstm_predictions: { '1h': { level: s.upstream_level + 0.2, flow: s.inflow_rate + 50 }, '3h': { level: s.upstream_level + 0.5, flow: s.inflow_rate + 200 }, '6h': { level: s.upstream_level + 0.9, flow: s.inflow_rate + 500 } },
    recommended_opening: s.recommended_opening, confidence: s.confidence,
    factors: s.factors, alternatives: s.alternatives,
    weights_used: { power_weight: 0.40, safety_weight: 0.35, ecology_weight: 0.25 },
    reward_score: s.reward_score, physics_validation: null,
    execution_status: 'pending', executed_opening: null, actual_level_after: null, actual_power_after: null,
    created_at: now.toISOString(),
  }
}

function buildMockRecords(): DispatchRecord[] {
  const now = Date.now()
  return [
    { id: 1, decision_time: new Date(now - 60000).toISOString(), decision_mode: 'L2', recommended_opening: 48, confidence: 85, risk_rank: 1, execution_status: 'executed', physics_validation: null },
    { id: 2, decision_time: new Date(now - 300000).toISOString(), decision_mode: 'L1', recommended_opening: 42, confidence: 72, risk_rank: 2, execution_status: 'rejected', physics_validation: null },
    { id: 3, decision_time: new Date(now - 600000).toISOString(), decision_mode: 'L3', recommended_opening: 55, confidence: 91, risk_rank: 1, execution_status: 'executed', physics_validation: null },
    { id: 4, decision_time: new Date(now - 1200000).toISOString(), decision_mode: 'L2', recommended_opening: 50, confidence: 88, risk_rank: 1, execution_status: 'executed', physics_validation: null },
    { id: 5, decision_time: new Date(now - 1800000).toISOString(), decision_mode: 'L1', recommended_opening: 40, confidence: 65, risk_rank: 2, execution_status: 'failed', physics_validation: null },
    { id: 6, decision_time: new Date(now - 3600000).toISOString(), decision_mode: 'L3', recommended_opening: 60, confidence: 93, risk_rank: 1, execution_status: 'executed', physics_validation: null },
    { id: 7, decision_time: new Date(now - 7200000).toISOString(), decision_mode: 'L2', recommended_opening: 45, confidence: 82, risk_rank: 1, execution_status: 'executed', physics_validation: null },
    { id: 8, decision_time: new Date(now - 14400000).toISOString(), decision_mode: 'L1', recommended_opening: 30, confidence: 55, risk_rank: 3, execution_status: 'rejected', physics_validation: null },
  ]
}

function generateMockPrediction(term: 1 | 2 | 3): PredictionData {
  const ptCount = term === 1 ? 12 : term === 2 ? 36 : 72
  const now = Date.now()
  const step = (term === 1 ? 5 : term === 2 ? 5 : 5) * 60000
  // 给水位加点"上涨趋势"让图表更好看
  const trend = latestDecision.value?.risk_rank === 3 ? 0.015 : latestDecision.value?.risk_rank === 2 ? 0.008 : 0.003
  const water_seq = Array.from({ length: ptCount }, (_, i) => ({
    time: new Date(now + i * step).toISOString(),
    value: +(380.65 + Math.sin(i * 0.18 + mockTick * 0.2) * 0.35 + i * trend).toFixed(2),
  }))
  const flow_seq = Array.from({ length: ptCount }, (_, i) => ({
    time: water_seq[i].time,
    value: Math.round(1920 + Math.sin(i * 0.12 + mockTick * 0.1) * 120 + i * (trend * 200)),
  }))
  const accuracy = term === 1 ? 96.1 : term === 2 ? 92.4 : 85.7
  return { id: 1, base_time: new Date(now).toISOString(), predict_term: term, water_seq, flow_seq, predict_accuracy: accuracy, created_at: new Date(now).toISOString() }
}

async function refreshAll() {
  mockTick++
  // 预测数据
  try {
    const res = await getPrediction(MOCK_RESERVOIR_ID, predictTerm.value)
    if (res.data.code === 0) { prediction.value = res.data.data }
  } catch { prediction.value = generateMockPrediction(predictTerm.value) }
  // Mock 决策（模拟 AI 实时推理）
  const decision = buildMockDecision(mockTick)
  latestDecision.value = decision
  // Mock 决策历史
  records.value = buildMockRecords()
  // 动态更新状态数据
  status.value.upstreamLevel = decision.upstream_level
  status.value.downstreamLevel = decision.downstream_level
  status.value.flowRate = decision.inflow_rate
  status.value.gateOpening = decision.current_opening
  // 方案选择：保持用户手动选择的方案不变；若方案已不在新数据中或首次加载，则自动选推荐
  const existingPlan = decision.alternatives?.find((p) => p.id === selectedPlanId.value)
  if (!existingPlan) {
    const rec = decision.alternatives?.find((p) => p.recommended)
    if (rec) selectPlan(rec)
  }
  // 风险判断
  riskLevelCache.value = decision.risk_rank
}

watch(predictTerm, () => refreshAll())

// ── 操作按钮 ──

async function handleAccept() {
  if (!latestDecision.value) return
  try {
    await executeDispatch({
      reservoir_id: MOCK_RESERVOIR_ID,
      decision_id: latestDecision.value.id,
      target_opening: latestDecision.value.recommended_opening,
    })
    // Mock: 更新本地状态
    status.value.gateOpening = latestDecision.value.recommended_opening
    status.value.mode = 'auto'
    recordLog('调度决策', '采纳决策', `采纳AI建议，开度调整至 ${latestDecision.value.recommended_opening}%`, 1)
    ElMessage.success('已采纳AI建议并下发指令'); refreshAll()
  } catch { recordLog('调度决策', '采纳决策', '采纳AI建议失败', 0); ElMessage.error('指令下发失败') }
}

async function handleExecute() {
  try {
    await ElMessageBox.confirm(
      `确认将开度从 ${status.value.gateOpening}% 调整为 ${targetOpening.value}%？`,
      '确认执行', { type: 'warning' },
    )
    await executeDispatch({ reservoir_id: MOCK_RESERVOIR_ID, target_opening: targetOpening.value })
    recordLog('调度决策', '手动执行', `手动下发开度 ${targetOpening.value}%`, 1)
    ElMessage.success('指令已下发'); refreshAll()
  } catch { /* 取消 */ }
}

function handleIgnore() {
  recordLog('调度决策', '忽略建议', `忽略AI建议，原因：${ignoreReason.value || '未填写'}`, 1)
  ElMessage.info('已忽略本次建议')
  ignoreVisible.value = false
  ignoreReason.value = ''
}

function handleMidConfirm() {
  recordLog('调度决策', '确认操作', '中风险场景人工确认执行', 1)
  ElMessage.success('已确认，执行指令')
}

function handleMidReject() {
  recordLog('调度决策', '驳回操作', '中风险场景人工驳回', 1)
  ElMessage.info('已驳回')
}

function handleHighManual() {
  ElMessage.info('高风险场景，已进入人工操作模式')
}

function submitLevel() {
  status.value.autoLevel = pendingLevel.value
  recordLog('调度决策', '变更权限', `自动执行权限切换为 L${pendingLevel.value}`, 1)
  ElMessage.success('权限等级已更新')
  levelDialogVisible.value = false
}

// ── 8. 生命周期 ──
onMounted(() => {
  refreshAll()
  pollTimer = setInterval(refreshAll, 10000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="page dispatch-page">
    <div class="dispatch-body">
      <!-- ═══ 左侧：AI 决策 ═══ -->
      <div class="dispatch-left">
        <GlassPanel3D title="AI 决策详情">
          <template v-if="latestDecision">
            <div class="decision-hero decision-hero--clickable" @click="openPlanPanorama(activePlan ?? latestDecision.alternatives!.find(p => p.recommended) ?? latestDecision.alternatives![0])">
              <div>
                <span class="lbl">推荐开度</span>
                <span class="val">
                  <span class="direction-icon">{{ latestDecision.recommended_opening > (latestDecision.current_opening ?? 45) ? '↑' : latestDecision.recommended_opening < (latestDecision.current_opening ?? 45) ? '↓' : '→' }}</span>
                  {{ latestDecision.recommended_opening }}%
                </span>
                <span class="expect">
                  置信度 {{ latestDecision.confidence }}%
                  · 模式 {{ latestDecision.decision_mode }}
                  · 风险等级 {{ latestDecision.risk_rank }}
                  · 点击预览 BIM
                </span>
              </div>
            </div>

            <!-- 影响因素 -->
            <div class="section">
              <h4>影响因素</h4>
              <div class="factor-bars">
                <div v-for="f in latestDecision.factors" :key="f.name" class="factor-row">
                  <span class="fname">{{ f.name }}</span>
                  <div class="fbar">
                    <div class="fbar__fill"
                      :style="{ width: ((activePlan?.factorImpacts?.[f.name]?.weight ?? f.weight) * 100) + '%' }" />
                  </div>
                  <span class="fval" :style="{ color: activePlan?.factorImpacts?.[f.name] ? '#1890ff' : 'inherit' }">
                    {{ activePlan?.factorImpacts?.[f.name]?.value ?? f.value }}
                  </span>
                  <span class="fdir" :style="{ color: (activePlan?.factorImpacts?.[f.name] ? FACTOR_DIRECTION_MAP[activePlan!.factorImpacts![f.name].direction] : FACTOR_DIRECTION_MAP[f.direction])?.color }">
                    {{ activePlan?.factorImpacts?.[f.name] ? FACTOR_DIRECTION_MAP[activePlan!.factorImpacts![f.name].direction]?.icon : FACTOR_DIRECTION_MAP[f.direction]?.icon }}
                  </span>
                  <span class="fwt">{{ ((activePlan?.factorImpacts?.[f.name]?.weight ?? f.weight) * 100).toFixed(0) }}%</span>
                </div>
              </div>
            </div>

            <!-- 方案对比 -->
            <div class="section">
              <h4>方案对比</h4>
              <div class="plan-cards">
                <div
                  v-for="p in latestDecision.alternatives" :key="p.id"
                  class="plan-card"
                  :class="{ 'plan-card--rec': p.recommended, 'plan-card--sel': selectedPlanId === p.id }"
                  @click="openPlanPanorama(p)"
                >
                  <div class="plan-card__head"><strong>{{ p.id }}</strong><span v-if="p.recommended" class="rec-tag">AI最优</span></div>
                  <div class="plan-card__grid">
                    <div><small>开度</small><b>{{ p.opening }}%</b></div>
                    <div><small>水位</small><b>{{ p.expectedLevel }}m</b></div>
                    <div><small>发电量</small><b>{{ p.power }}kW</b></div>
                    <div><small>安全</small><b :style="{ color: p.safetyScore >= 90 ? '#2ed573' : '#ffa502' }">{{ p.safetyScore }}</b></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 置信度 -->
            <div class="section conf-section">
              <h4>置信度</h4>
              <div class="conf-ring-wrap">
                <svg viewBox="0 0 120 120" class="conf-ring">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10" />
                  <circle cx="60" cy="60" r="50" fill="none"
                    :stroke="getConfidenceColor(activePlan?.confidence ?? latestDecision.confidence)"
                    stroke-width="10"
                    :stroke-dasharray="`${((activePlan?.confidence ?? latestDecision.confidence) / 100) * 314.16} 314.16`"
                    stroke-linecap="round" transform="rotate(-90 60 60)" />
                </svg>
                <span class="conf-val" :style="{ color: getConfidenceColor(activePlan?.confidence ?? latestDecision.confidence) }">
                  {{ activePlan?.confidence ?? latestDecision.confidence }}%
                </span>
              </div>
              <p class="conf-desc">
                当前方案：{{ activePlan?.id ?? '—' }}
                · 综合评分 {{ activePlan?.totalScore ?? latestDecision.reward_score ?? '-' }}
              </p>
              <p v-if="(activePlan?.confidence ?? latestDecision.confidence) < 80" class="conf-warn">置信度偏低，建议人工复核后再执行</p>
            </div>

            <div class="decision-btns">
              <el-button type="primary" :icon="CircleCheck" @click="handleAccept">采纳建议</el-button>
              <el-button :icon="CircleClose" @click="ignoreVisible = true">忽略</el-button>
            </div>
          </template>
        </GlassPanel3D>
      </div>

      <!-- ═══ 右侧 ═══ -->
      <div class="dispatch-right">
        <GlassPanel3D title="三级风险与权限">
          <div class="risk-cards">
            <div
              v-for="card in riskCards" :key="card.key"
              class="risk-card"
              :class="{ 'risk-card--active': card.active }"
              :style="{ '--risk-color': card.color }"
            >
              <div class="risk-card__indicator" />
              <div class="risk-card__body">
                <strong>{{ card.label }}</strong>
                <p>{{ card.desc }}</p>
                <span class="risk-action">{{ card.action }}</span>
              </div>
              <div v-if="card.key === 1" class="risk-card__ctrl">
                <span v-if="autoExecEnabled" style="color:#22c55e;font-weight:600">✓ 自动执行</span>
                <span v-else style="color:#f59e0b;font-weight:600">手动模式</span>
              </div>
              <div v-else-if="card.key === 2" class="risk-card__ctrl">
                <el-button size="small" type="warning" @click="handleMidConfirm">确认</el-button>
                <el-button size="small" @click="handleMidReject">驳回</el-button>
              </div>
              <div v-else class="risk-card__ctrl">
                <el-button size="small" disabled>禁止自动</el-button>
                <el-button size="small" type="primary" @click="handleHighManual">人工操作</el-button>
              </div>
            </div>
          </div>

          <div class="level-section">
            <h4>权限等级配置</h4>
            <div
              v-for="lv in AUTO_LEVEL_OPTIONS" :key="lv.value"
              class="level-item"
              :class="{ active: status.autoLevel === lv.value }"
              :style="{ '--lv-color': lv.color }"
              @click="canModifyLevel && status.autoLevel !== lv.value && (pendingLevel = lv.value as 1 | 2 | 3, levelDialogVisible = true)"
            >
              <span class="level-dot" /><strong>{{ lv.label }}</strong><small>{{ lv.description }}</small>
            </div>
            <p v-if="!canModifyLevel" class="readonly-tip">仅管理员/算法工程师可修改</p>
          </div>
        </GlassPanel3D>

        <GlassPanel3D title="手动干预" compact>
          <div class="manual-row"><span>目标开度</span><strong>{{ targetOpening }}%</strong></div>
          <el-slider v-model="targetOpening" :min="OPENING_MIN" :max="OPENING_MAX" :step="OPENING_STEP" />
          <div class="manual-btns">
            <el-button type="primary" :disabled="targetOpening === status.gateOpening" @click="handleExecute">执行</el-button>
          </div>
        </GlassPanel3D>

        <GlassPanel3D title="调度记录" compact>
          <div class="log-scroll">
            <div v-for="log in records.slice(0, 8)" :key="log.id" class="log-line">
              <span class="log-time">{{ log.decision_time?.replace('T', ' ').substring(5, 16) ?? '-' }}</span>
              <span class="log-action">开度 {{ log.recommended_opening }}% · {{ log.decision_mode }}</span>
              <span :style="{ color: log.execution_status === 'executed' ? '#22c55e' : log.execution_status === 'failed' ? '#ef4444' : '#f59e0b' }">
                {{ log.execution_status === 'executed' ? '已执行' : log.execution_status === 'failed' ? '失败' : log.execution_status === 'rejected' ? '已拒绝' : '待执行' }}
              </span>
            </div>
            <div v-if="records.length === 0" class="log-empty">暂无调度记录</div>
          </div>
        </GlassPanel3D>
      </div>
    </div>

    <!-- ═══ LSTM 预测图 ═══ -->
    <div class="chart-panel-diy">
      <div class="chart-panel-diy__head">
        <span class="chart-panel-diy__title">LSTM 水位预测</span>
        <div class="chart-ctrl">
          <el-select v-model="predictTerm" size="small" style="width:70px">
            <el-option v-for="t in [{v:1,l:'1h'},{v:2,l:'3h'},{v:3,l:'6h'}]" :key="t.v" :label="t.l" :value="t.v" />
          </el-select>
          <el-select v-model="metricKey" size="small" style="width:80px">
            <el-option label="水位" value="water" />
            <el-option label="流量" value="flow" />
          </el-select>
          <el-button :icon="Refresh" circle size="small" @click="refreshAll" />
        </div>
      </div>
      <v-chart class="lstm-chart" :option="chartOption" autoresize />
      <div class="chart-legend">
        <span><i class="leg leg--pred" />预测曲线</span>
        <span v-if="prediction">准确率 {{ prediction.predict_accuracy }}% · {{ prediction.predict_term === 1 ? '1h' : prediction.predict_term === 2 ? '3h' : '6h' }}预测</span>
        <el-button text size="small" style="margin-left:auto" @click="showDataTable = !showDataTable">
          {{ showDataTable ? '收起数据' : '查看数据' }}
        </el-button>
      </div>
      <!-- 预测数据表 -->
      <div v-if="showDataTable" class="chart-data-table">
        <el-table
          :data="mockTableData"
          size="small" stripe border max-height="280px"
          style="width:100%;margin-top:10px;font-size:13px"
        >
          <el-table-column type="index" label="#" width="50" align="center" />
          <el-table-column label="时间" min-width="130" align="center">
            <template #default="scope">
              {{ new Date(scope.row.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
            </template>
          </el-table-column>
          <el-table-column label="水位 (m)" min-width="100" align="right">
            <template #default="scope">{{ scope.row.water.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="流量 (m³/s)" min-width="110" align="right">
            <template #default="scope">{{ scope.row.flow }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- ═══ 弹窗 ═══ -->
    <el-dialog v-model="levelDialogVisible" title="变更自动执行权限" width="460px">
      <p>确认切换为：<strong>{{ AUTO_LEVEL_OPTIONS.find(l => l.value === pendingLevel)?.label }}</strong></p>
      <p style="color:#64748b;font-size:13px">{{ AUTO_LEVEL_OPTIONS.find(l => l.value === pendingLevel)?.description }}</p>
      <template #footer><el-button @click="levelDialogVisible = false">取消</el-button><el-button type="primary" @click="submitLevel">确认</el-button></template>
    </el-dialog>

    <el-dialog v-model="ignoreVisible" title="忽略建议" width="400px">
      <el-form-item label="原因">
        <el-input v-model="ignoreReason" type="textarea" :rows="3" placeholder="请填写忽略原因" />
      </el-form-item>
      <template #footer><el-button @click="ignoreVisible = false">取消</el-button><el-button type="warning" @click="handleIgnore">确认忽略</el-button></template>
    </el-dialog>

    <DamPanoramaModal
      preview
      :visible="panoramaVisible"
      :water-level="panoramaWaterLevel"
      :downstream-level="status.downstreamLevel"
      :gate-opening="panoramaGateOpening"
      :flow-rate="status.flowRate"
      sim-scene="normal"
      :sim-speed="1"
      :sim-status="panoramaSimStatus"
      :can-start="false"
      :can-pause="false"
      elapsed-label="—"
      scene-label="常规调度"
      :status-label="panoramaStatusInfo.label"
      :status-color="panoramaStatusInfo.color"
      :level-status-color="panoramaLevelStatus.color"
      :level-status-label="panoramaLevelStatus.label"
      :preview-plan-name="previewPlan?.id"
      :preview-safety-score="previewPlan?.safetyScore"
      @close="panoramaVisible = false"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.dispatch-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 100%;
  padding-bottom: 16px;
  font-size: 15px;
}

.dispatch-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 16px;
  height: clamp(460px, calc(100vh - 150px), 620px);
  min-height: 0;
  padding: 0 16px;
  overflow: hidden;
  align-items: stretch;
}

.dispatch-left,
.dispatch-right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.dispatch-left {
  overflow: hidden;
}

.dispatch-left > :deep(.glass-panel) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dispatch-left > :deep(.glass-panel .glass-panel__body) {
  height: calc(100% - 53px);
  overflow-y: auto;
}

.dispatch-right {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
  overscroll-behavior: contain;
}

.dispatch-right::-webkit-scrollbar {
  width: 6px;
}

.dispatch-right::-webkit-scrollbar-thumb {
  background: rgba(24,144,255,0.28);
  border-radius: 999px;
}

.dispatch-right::-webkit-scrollbar-track {
  background: transparent;
}

.decision-hero {
  margin-bottom: 18px;

  &--clickable {
    padding: 12px 14px;
    margin-left: -14px;
    margin-right: -14px;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      background: rgba(24, 144, 255, 0.06);
      box-shadow: inset 0 0 0 1px rgba(24, 144, 255, 0.12);
    }
  }

  .lbl { font-size: $cockpit-font-sm; color: $cockpit-text-dim; }
  .val {
    display: flex; align-items: center; gap: 8px;
    font-size: $cockpit-font-3xl; color: $cockpit-cyan;
    @include data-value;
  }
  .direction-icon { font-size: 24px; }
  .expect { display: block; font-size: $cockpit-font-base; color: $cockpit-text-dim; margin-top: 6px; }
}

.section {
  margin-bottom: 16px;
  h4 { font-size: $cockpit-font-sm; color: $cockpit-text-dim; letter-spacing: 1px; margin-bottom: 10px; border-left: 3px solid $cockpit-cyan; padding-left: 10px; font-weight: 600; }
}

.factor-row { display: grid; grid-template-columns: 100px 1fr 80px 24px 44px; gap: 10px; align-items: center; padding: 6px 0; font-size: $cockpit-font-sm; }
.fbar { height: 8px; background: rgba(15,23,42,0.06); border-radius: 4px; overflow: hidden; &__fill { height: 100%; background: linear-gradient(90deg, $cockpit-accent, #3b82f6); border-radius: 4px; transition: width 0.6s; } }
.fwt { color: $cockpit-accent; font-family: 'SF Mono', monospace; text-align: right; font-size: $cockpit-font-sm; }
.fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fval { text-align: right; font-size: 13px; color: var(--color-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fdir { text-align: center; font-weight: 700; }

.plan-cards { display: flex; gap: 10px; }
.plan-card {
  flex: 1; padding: 14px; border: 2px solid transparent; border-radius: 10px; cursor: pointer; transition: all 0.25s; background: #fff;
  &--rec { border-color: rgba(46,213,115,0.35); background: #f0fdf4; }
  &--sel { border-color: #1890ff; background: #e6f4ff; box-shadow: 0 4px 20px rgba(24,144,255,0.25); transform: translateY(-3px); }
  &:hover:not(&--sel) { border-color: rgba(24,144,255,0.2); background: #f8fbff; }
  &__head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: $cockpit-font-md; .rec-tag { font-size: $cockpit-font-xs; padding: 4px 10px; background: rgba(46,213,115,0.2); color: #2ed573; border-radius: 4px; } }
  &__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; small { display: block; font-size: $cockpit-font-xs; color: $cockpit-text-dim; } b { font-size: $cockpit-font-base; } }
  &::after {
    content: 'BIM 预览';
    display: block;
    margin-top: 8px;
    font-size: $cockpit-font-xs;
    color: $cockpit-accent;
    opacity: 0;
    transition: opacity 0.2s ease;
  }
  &:hover::after { opacity: 1; }
}

.conf-ring-wrap { position: relative; width: 120px; height: 120px; margin: 0 auto; .conf-ring { width: 100%; height: 100%; circle { transition: stroke-dasharray 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke 0.6s ease; } } .conf-val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: $cockpit-font-xl; font-weight: 700; transition: color 0.6s ease; } }
.conf-desc { text-align: center; font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin-top: 10px; }
.conf-warn { text-align: center; font-size: $cockpit-font-sm; color: #ffa502; margin-top: 6px; }
.decision-btns { display: flex; gap: 12px; margin-top: 14px; .el-button { flex: 1; } }

.risk-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.risk-card {
  display: grid; grid-template-columns: 4px 1fr auto; gap: 12px; padding: 14px; border: 2px solid rgba(15,23,42,0.08); border-radius: 10px; align-items: center; transition: all 0.35s ease; background: #fff;
  &--active {
    border-color: var(--risk-color);
    background: #fafafa;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
    transform: scale(1.02);
    .risk-card__indicator { width: 6px; }
    .risk-card__body strong { color: var(--risk-color); font-size: $cockpit-font-md; }
  }
  &__indicator { width: 4px; height: 100%; min-height: 48px; background: var(--risk-color); border-radius: 2px; transition: all 0.35s ease; }
  &__body { strong { display: block; font-size: $cockpit-font-base; transition: all 0.35s ease; } p { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin: 4px 0; line-height: 1.4; } .risk-action { font-size: $cockpit-font-sm; color: var(--risk-color); font-weight: 600; } }
  &__ctrl { display: flex; gap: 8px; flex-direction: column; align-items: flex-end; }
}

.level-section h4 { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin-bottom: 10px; font-weight: 600; }
.level-item {
  padding: 12px 14px; border: 1px solid rgba(15,23,42,0.08); border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: #fff;
  &.active { border-color: var(--lv-color); background: #f0f9ff; }
  strong { display: block; font-size: $cockpit-font-base; }
  small { font-size: $cockpit-font-sm; color: $cockpit-text-dim; }
}
.level-dot {
  display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--lv-color); margin-right: 8px; vertical-align: middle;
}
.readonly-tip { font-size: $cockpit-font-sm; color: $cockpit-text-dim; text-align: center; }

.manual-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: $cockpit-font-base; strong { @include data-value; font-size: $cockpit-font-xl; } }
.manual-btns { display: flex; gap: 10px; margin-top: 14px; }

.log-scroll { max-height: 160px; overflow-y: auto; }
.log-line { display: flex; gap: 10px; padding: 8px 0; font-size: $cockpit-font-sm; border-bottom: 1px solid rgba(15,23,42,0.06); gap: 12px; }
.log-time { color: $cockpit-text-dim; font-family: 'SF Mono', monospace; flex-shrink: 0; }
.log-action { flex: 1; color: var(--color-text); }
.log-empty { text-align: center; color: $cockpit-text-dim; padding: 20px 0; font-size: $cockpit-font-sm; }

.chart-panel-diy {
  margin: 8px 16px 0;
  padding: 16px 18px;
  background: linear-gradient(145deg, rgba(255,255,255,0.97), rgba(248,252,255,0.94));
  border: 1px solid rgba(24,144,255,0.16);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(24,144,255,0.06), 1px 1px 0 rgba(24,144,255,0.12);
  flex-shrink: 0;

  &__head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px; padding-bottom: 10px;
    border-bottom: 1px solid rgba(24,144,255,0.1);
  }
  &__title {
    font-size: 15px; font-weight: 600; color: #1e3a5f;
    padding-left: 12px; border-left: 3px solid #1890ff;
  }
}
.chart-ctrl { display: flex; gap: 8px; }
.lstm-chart {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 300px;
  min-height: 300px;
  background: rgba(24,144,255,0.02);
  border: 1px dashed rgba(24,144,255,0.15);
  border-radius: 6px;
  overflow: visible;
}

:deep(.lstm-chart > div),
:deep(.lstm-chart canvas) {
  position: relative !important;
  z-index: 2 !important;
  opacity: 1 !important;
  visibility: visible !important;
}
.chart-legend { display: flex; gap: 20px; margin-top: 10px; font-size: $cockpit-font-sm; color: $cockpit-text-dim; .leg { display: inline-block; width: 14px; height: 4px; margin-right: 6px; vertical-align: middle; &--pred { background: #1890ff; } .leg--safe { background: #22c55e; } .leg--warn { background: #ef4444; } } }

:deep(.el-slider__bar) {
  background: linear-gradient(90deg, $cockpit-accent, #3b82f6);
  transition: width 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
:deep(.el-slider__button-wrapper) {
  transition: left 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
              transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
:deep(.el-select .el-input__wrapper), :deep(.el-input__wrapper) { background: #ffffff; border-color: rgba(24,144,255,0.2); }
:deep(.el-input__inner) { color: $cockpit-text; }
</style>
