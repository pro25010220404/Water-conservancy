<script setup lang="ts">
// ============================================================
// 调度决策 — 严格对照需求文档 §3.1~§3.12
// ============================================================
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElButton,
  ElSlider,
  ElSelect,
  ElOption,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElDialog,
  ElFormItem,
  ElTable,
  ElTableColumn,
  ElProgress,
  ElTag,
  ElPagination,
  ElCollapse,
  ElCollapseItem,
} from 'element-plus'
import { Refresh, CircleCheck, CircleClose, View } from '@element-plus/icons-vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import GateActionsPanel from './components/GateActionsPanel.vue'
import { XIANGJIABA_HYDRO } from '@/constants/xiangjiaba'
import {
  AUTO_LEVEL_OPTIONS,
  AUTO_LEVEL_MAP,
  DISPATCH_MODE_MAP,
  getConfidenceColor,
  FACTOR_DIRECTION_MAP,
  OPENING_MIN,
  OPENING_MAX,
  OPENING_STEP,
} from '@/constants/dispatch'
import type {
  DecisionDetail,
  DispatchRecord,
  DispatchStatus,
  PredictionData,
  PhysicsValidation,
  PhysicsGuardSummary,
  PhysicsGuardHistoryItem,
} from '@/types/dispatch'
import {
  fetchDispatchStatus,
  fetchDecisionDetail,
  fetchPrediction,
  fetchDispatchLogs,
  postExecute,
  postCancelExecute,
  postAcceptDecision,
  postIgnoreDecision,
  putDispatchMode,
  putAutoLevel,
  fetchPhysicsGuardSummary,
  fetchPhysicsGuardHistory,
  postPhysicsGuardRollback,
} from '@/api/dispatchPage'
import { useUserStore } from '@/stores/user'
import { useOperationLog } from '@/composables/useOperationLog'
import { fuzzyMatch } from '@/utils/fuzzyMatch'

use([
  LineChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  LegendComponent,
  CanvasRenderer,
])

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const { record: recordLog } = useOperationLog()

const canModifyLevel = computed(() => {
  const roles = userStore.userInfo?.roles ?? []
  return roles.includes('admin') || roles.includes('algorithm_engineer')
})

const status = ref<DispatchStatus>({
  mode: 'auto',
  autoLevel: 2,
  upstreamLevel: 380.65,
  downstreamLevel: 278.42,
  flowRate: 1920,
  gateOpening: 45,
  lastDispatchAt: null,
  isExecuting: false,
  executingTarget: null,
})
const decision = ref<DecisionDetail | null>(null)
const prediction = ref<PredictionData | null>(null)
const records = ref<DispatchRecord[]>([])

const predictTerm = ref<1 | 2 | 3>(2)
const metricKey = ref<'water' | 'flow'>('water')
const targetOpening = ref(45)
const userModifiedTarget = ref(false)
const recordKeyword = ref('')
const recordPageNum = ref(1)
const RECORD_PAGE_SIZE = 10
const expandedRecordId = ref<number | null>(null)

const decisionDialogVisible = ref(false)
const levelDialogVisible = ref(false)
const pendingLevel = ref<1 | 2 | 3>(2)
const ignoreVisible = ref(false)
const ignoreReason = ref('')
const metricsCollapse = ref(['prediction', 'decision', 'compliance'])

const physicsGuard = ref<PhysicsGuardSummary | null>(null)
const physicsHistory = ref<PhysicsGuardHistoryItem[]>([])
const historyVisible = ref(false)
const historyDetailVisible = ref(false)
const historyDetailRow = ref<PhysicsGuardHistoryItem | null>(null)

const SYNC_STATUS_MAP: Record<string, { label: string; type: 'success' | 'warning' | 'danger' }> = {
  synced: { label: '已同步', type: 'success' },
  stale: { label: '待同步', type: 'warning' },
  offline: { label: '离线缓存', type: 'danger' },
}

const physicsValidation = computed(() => decision.value?.physics_validation ?? null)

const DECISION_LEVEL_MAP: Record<string, string> = {
  L3_AUTO: 'L3 全自动',
  L2_SUGGEST: 'L2 建议模式',
  L1_MANUAL: 'L1 强制人工',
  OVERRIDE: '安全覆盖 OVERRIDE',
}

const RISK_LEVEL_MAP: Record<string, { label: string; color: string }> = {
  safe: { label: 'safe', color: '#22c55e' },
  warning: { label: 'warning', color: '#f59e0b' },
  danger: { label: 'danger', color: '#ef4444' },
  critical: { label: 'critical', color: '#dc2626' },
}

const INTERLOCK_RULE_MAP: Record<string, string> = {
  spillway_intake_mutex: '泄洪-发电互斥',
  downstream_impact_protect: '下游冲击保护',
  symmetry_constraint: '对称性约束',
  min_discharge_guarantee: '最小下泄保障',
}

function contributionClass(val: number) {
  if (val > 0.005) return 'contrib-pos'
  if (val < -0.005) return 'contrib-neg'
  return 'contrib-neutral'
}

function formatContribution(val: number) {
  const sign = val > 0 ? '+' : ''
  return `${sign}${val.toFixed(2)}`
}

function overallContributionMeta(pv: PhysicsValidation) {
  const v = pv.contribution.overall
  if (v > 0.02) return { icon: '↑', text: '正面拖升模型评分', cls: 'contrib-pos' }
  if (v < -0.05) return { icon: '↓↓', text: '明显拖累模型评分', cls: 'contrib-neg' }
  if (v < 0) return { icon: '↓', text: '轻微拖累模型评分', cls: 'contrib-neg' }
  return { icon: '→', text: '对模型评分影响轻微', cls: 'contrib-neutral' }
}

function trendLabel(pv: PhysicsValidation) {
  if (pv.trend_direction === 'match') return '↑ 预测涨实涨'
  if (pv.trend_direction === 'mismatch') return '✗ 方向相反'
  return '待下周期回填'
}

function physicsCheckLabel(pv: PhysicsValidation) {
  const steps = pv.physics_correction_steps ?? 0
  return steps > 0 ? `✗ 修正 ${steps} 步` : '✓ 通过'
}

function physicsViolationLabel(pv: PhysicsValidation) {
  const v = pv.physics_violation_m
  const status = v > 0.5 ? '超过容差 0.5m' : '正常'
  return `${v.toFixed(2)}m（${status}）`
}

function interlockRecordLabel(pv: PhysicsValidation | null) {
  if (!pv?.interlock?.triggered) return '—'
  return pv.interlock.rules.map((r) => INTERLOCK_RULE_MAP[r] ?? r).join(' / ')
}

async function loadPhysicsGuard() {
  const [summary, history] = await Promise.all([
    fetchPhysicsGuardSummary(),
    fetchPhysicsGuardHistory(),
  ])
  physicsGuard.value = summary.data
  physicsHistory.value = history.data.list
}

function openHistoryDetail(row: PhysicsGuardHistoryItem) {
  historyDetailRow.value = row
  historyDetailVisible.value = true
}

async function handleRollback(row: PhysicsGuardHistoryItem) {
  if (row.is_active) return
  try {
    await ElMessageBox.confirm(
      `确认回滚至版本 ${row.config_version}？边缘端下一同步周期生效。`,
      '回滚物理防护配置',
      { type: 'warning' },
    )
    const res = await postPhysicsGuardRollback(row.id)
    physicsGuard.value = res.data
    await loadPhysicsGuard()
    recordLog('调度决策', '回滚物理防护配置', `版本 → ${row.config_version}`, 1)
    ElMessage.success(`已回滚至 ${row.config_version}`)
    historyVisible.value = false
  } catch {
    /* cancel */
  }
}

function goPhysicsGuardHistorySettings() {
  historyVisible.value = false
  router.push({ path: '/settings', query: { tab: 'physics-guard-history', reservoir_id: '1' } })
}

function interlockLabel(pv: PhysicsValidation) {
  if (!pv.interlock?.triggered) return '✓ 通过'
  const names = pv.interlock.rules.map((r) => INTERLOCK_RULE_MAP[r] ?? r).join(' · ')
  return `✗ ${names} · ${pv.interlock.reason}`
}

let pollTimer: ReturnType<typeof setInterval> | null = null
let executionRefreshTimer: ReturnType<typeof setTimeout> | null = null
const HIST_LEN = 12

const recommendedPlan = computed(
  () =>
    decision.value?.alternatives?.find((p) => p.recommended) ??
    decision.value?.alternatives?.[0] ??
    null,
)

const openingDirection = computed(() => {
  if (!decision.value) return '→'
  const cur = decision.value.current_opening
  const rec = decision.value.recommended_opening
  if (rec > cur) return '↑ 增大'
  if (rec < cur) return '↓ 减小'
  return '→ 维持'
})

const expectedEffect = computed(() => {
  const p = recommendedPlan.value
  if (!p) return '—'
  return `上游水位预计 ${p.expectedLevel} m · 发电 ${p.power} kW · 安全评分 ${p.safetyScore}`
})

const canManualControl = computed(
  () => status.value.mode === 'manual' || status.value.autoLevel === 1,
)

const executingTarget = computed(() => status.value.executingTarget)

const canReDispatch = computed(
  () =>
    status.value.isExecuting &&
    executingTarget.value != null &&
    targetOpening.value !== executingTarget.value,
)

const canSubmitExecute = computed(
  () =>
    canManualControl.value &&
    !status.value.isExecuting &&
    targetOpening.value !== status.value.gateOpening,
)

const confidenceValue = computed(() => decision.value?.confidence ?? 0)
const confidenceColor = computed(() => getConfidenceColor(confidenceValue.value))

const filteredRecords = computed(() => {
  const kw = recordKeyword.value.trim()
  if (!kw) return records.value
  return records.value.filter((r) =>
    fuzzyMatch(
      kw,
      r.decision_mode,
      r.action,
      r.operator_name,
      String(r.recommended_opening),
      `${r.recommended_opening}%`,
      r.execution_status,
      statusLabel(r.execution_status),
      formatTime(r.decision_time),
    ),
  )
})

const recordTotal = computed(() => filteredRecords.value.length)

const pagedRecords = computed(() => {
  const start = (recordPageNum.value - 1) * RECORD_PAGE_SIZE
  return filteredRecords.value.slice(start, start + RECORD_PAGE_SIZE)
})

const chartOption = computed(() => {
  const data = prediction.value
  if (!data) return {}
  const seq = metricKey.value === 'water' ? data.water_seq : data.flow_seq
  const isWater = metricKey.value === 'water'
  const times = seq.map((p) => {
    const d = new Date(p.time)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const histValues = seq.slice(0, HIST_LEN).map((p) => p.value)
  const predValues = seq.slice(HIST_LEN - 1).map((p) => p.value)
  const histData = [...histValues, ...Array(seq.length - HIST_LEN).fill(null)]
  const predData = [...Array(HIST_LEN - 1).fill(null), ...predValues]
  const nowLabel = times[HIST_LEN - 1] ?? ''
  const warnLevel = XIANGJIABA_HYDRO.warningLevel

  return {
    animation: false,
    backgroundColor: 'transparent',
    legend: {
      data: ['实测', '预测'],
      top: 0,
      right: 0,
      textStyle: { color: '#64748b', fontSize: 11 },
    },
    grid: { top: 36, right: 48, bottom: 48, left: 58, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { seriesName: string; value: number; axisValue: string }[]) => {
        const p = params.find((x) => x.value != null)
        if (!p) return ''
        const unit = isWater ? ' m' : ' m³/s'
        return `${p.axisValue}<br/>${p.seriesName}: ${isWater ? p.value.toFixed(2) : p.value}${unit}`
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: times,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        interval: Math.max(0, Math.floor(times.length / 8)),
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { lineStyle: { color: '#cbd5e1' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 11,
        formatter: (v: number) => (isWater ? v.toFixed(1) : String(Math.round(v))),
      },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    series: [
      {
        name: '实测',
        type: 'line',
        data: histData,
        smooth: true,
        lineStyle: { color: '#334155', width: 2 },
        itemStyle: { color: '#334155' },
        showSymbol: false,
      },
      {
        name: '预测',
        type: 'line',
        data: predData,
        smooth: true,
        lineStyle: { color: '#1890ff', width: 2, type: 'dashed' },
        itemStyle: { color: '#1890ff' },
        showSymbol: false,
        markLine: isWater
          ? {
              silent: true,
              symbol: 'none',
              data: [
                {
                  xAxis: nowLabel,
                  lineStyle: { color: '#f59e0b', type: 'solid', width: 1 },
                  label: { formatter: '当前', color: '#f59e0b', fontSize: 10 },
                },
                {
                  yAxis: warnLevel,
                  lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
                  label: { formatter: '预警', color: '#ef4444', fontSize: 10 },
                },
              ],
            }
          : {
              silent: true,
              symbol: 'none',
              data: [
                {
                  xAxis: nowLabel,
                  lineStyle: { color: '#f59e0b' },
                  label: { formatter: '当前', fontSize: 10 },
                },
              ],
            },
      },
    ],
  }
})

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return iso.replace('T', ' ').substring(0, 19)
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    executed: '成功',
    failed: '失败',
    rejected: '已取消',
    pending: '待执行',
  }
  return map[s] ?? s
}

function statusTagType(s: string) {
  if (s === 'executed') return 'success'
  if (s === 'failed') return 'danger'
  if (s === 'rejected') return 'info'
  return 'warning'
}

async function refreshAll() {
  const [st, dec, pred, logs] = await Promise.all([
    fetchDispatchStatus(),
    fetchDecisionDetail(),
    fetchPrediction(predictTerm.value),
    fetchDispatchLogs(),
    loadPhysicsGuard(),
  ])
  status.value = st.data
  decision.value = dec.data
  prediction.value = pred.data
  records.value = logs.data.list
  if (dec.data && !userModifiedTarget.value && !st.data.isExecuting) {
    targetOpening.value = dec.data.recommended_opening
  }
  if (st.data.isExecuting && !executionRefreshTimer) {
    executionRefreshTimer = setTimeout(async () => {
      executionRefreshTimer = null
      await refreshAll()
    }, 4200)
  }
}

function onTargetInput() {
  userModifiedTarget.value = true
}

async function toggleMode(next: 'auto' | 'manual') {
  if (status.value.mode === next) return
  try {
    await ElMessageBox.confirm(
      `确认切换运行模式为「${DISPATCH_MODE_MAP[next].label}」？`,
      '二次确认',
      { type: 'warning' },
    )
    await putDispatchMode(next)
    recordLog('调度决策', '切换模式', `运行模式 → ${DISPATCH_MODE_MAP[next].label}`, 1)
    ElMessage.success('运行模式已更新')
    await refreshAll()
  } catch {
    /* cancel */
  }
}

async function handleAccept() {
  if (!decision.value || status.value.isExecuting) return
  try {
    await ElMessageBox.confirm(
      `确认采纳建议，将开度调整至 ${decision.value.recommended_opening}%？`,
      '采纳建议',
      { type: 'warning' },
    )
    await postAcceptDecision()
    recordLog('调度决策', '采纳建议', `开度 → ${decision.value.recommended_opening}%`, 1)
    ElMessage.success('建议已采纳并下发')
    decisionDialogVisible.value = false
    await refreshAll()
  } catch {
    /* cancel */
  }
}

async function handleExecute() {
  if (!canManualControl.value) {
    ElMessage.warning('自动模式下请切换为手动或 L1 权限后再手动干预')
    return
  }
  if (status.value.isExecuting) {
    ElMessage.warning('指令执行中，请先取消或改派')
    return
  }
  const delta = targetOpening.value - status.value.gateOpening
  try {
    await ElMessageBox.confirm(
      `目标开度 ${targetOpening.value}%（较当前 ${delta >= 0 ? '+' : ''}${delta}%）`,
      '确认执行',
      { type: 'warning' },
    )
    await postExecute(targetOpening.value)
    userModifiedTarget.value = false
    recordLog('调度决策', '手动执行', `开度 ${targetOpening.value}%`, 1)
    ElMessage.success('指令已下发')
    await refreshAll()
  } catch {
    /* cancel */
  }
}

async function handleCancelExecute() {
  if (!status.value.isExecuting) return
  try {
    await ElMessageBox.confirm(
      executingTarget.value != null
        ? `确认取消正在执行的指令（目标 ${executingTarget.value}%）？`
        : '确认取消正在执行的指令？',
      '取消执行',
      { type: 'warning' },
    )
    await postCancelExecute()
    recordLog(
      '调度决策',
      '取消执行',
      executingTarget.value != null ? `目标 ${executingTarget.value}%` : '执行中指令',
      1,
    )
    ElMessage.success('已取消执行')
    await refreshAll()
  } catch {
    /* cancel */
  }
}

async function handleReDispatch() {
  if (!canReDispatch.value) return
  const from = executingTarget.value!
  const to = targetOpening.value
  try {
    await ElMessageBox.confirm(`取消当前执行（${from}%）并改派为 ${to}%？`, '改派执行', {
      type: 'warning',
    })
    await postCancelExecute()
    await postExecute(to)
    userModifiedTarget.value = false
    recordLog('调度决策', '改派执行', `${from}% → ${to}%`, 1)
    ElMessage.success('已改派并重新下发')
    await refreshAll()
  } catch {
    /* cancel */
  }
}

async function handleIgnore() {
  await postIgnoreDecision()
  recordLog('调度决策', '忽略建议', ignoreReason.value || '未填写原因', 1)
  ElMessage.info('已忽略本次建议')
  ignoreVisible.value = false
  ignoreReason.value = ''
  decisionDialogVisible.value = false
}

async function submitLevel() {
  try {
    await ElMessageBox.confirm(
      `确认切换自动执行权限为 ${AUTO_LEVEL_MAP[pendingLevel.value].label}？`,
      '二次确认',
      { type: 'warning' },
    )
    const res = await putAutoLevel(pendingLevel.value)
    const autoResult = res.data as { executed?: boolean; message?: string } | null
    recordLog('调度决策', '变更权限', AUTO_LEVEL_MAP[pendingLevel.value].label, 1)
    levelDialogVisible.value = false
    await refreshAll()
    if (autoResult?.executed) {
      ElMessage.success(autoResult.message ?? '已自动执行调度建议')
      if (status.value.isExecuting) {
        window.setTimeout(() => refreshAll(), 4200)
      }
    } else if (autoResult?.message && pendingLevel.value >= 2) {
      ElMessage.warning(autoResult.message)
    } else {
      ElMessage.success('权限等级已更新')
    }
  } catch {
    /* cancel */
  }
}

function toggleRecordExpand(id: number) {
  expandedRecordId.value = expandedRecordId.value === id ? null : id
}

watch(predictTerm, () => refreshAll())
watch(recordKeyword, () => {
  recordPageNum.value = 1
  expandedRecordId.value = null
})
watch(recordPageNum, () => {
  expandedRecordId.value = null
})

function applyRecordQuery() {
  const id = Number(route.query.recordId)
  if (id > 0) expandedRecordId.value = id
}

watch(() => route.query.recordId, applyRecordQuery)

onMounted(() => {
  refreshAll()
  applyRecordQuery()
  pollTimer = setInterval(refreshAll, 10000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (executionRefreshTimer) clearTimeout(executionRefreshTimer)
})
</script>

<template>
  <div class="page dispatch-page">
    <!-- §3.2 上行：运行控制区（三合一）+ 调度建议 -->
    <div class="dispatch-top">
      <div class="dispatch-control-group">
        <GlassPanel3D title="当前运行状态"
class="panel-status">
          <div class="mode-row">
            <span class="lbl">运行模式</span>
            <div class="mode-btns">
              <button
                type="button"
                class="mode-btn"
                :class="{ active: status.mode === 'auto' }"
                @click="toggleMode('auto')"
              >
                自动
              </button>
              <button
                type="button"
                class="mode-btn"
                :class="{ active: status.mode === 'manual' }"
                @click="toggleMode('manual')"
              >
                手动
              </button>
            </div>
            <ElTag v-if="status.isExecuting"
type="warning" size="small" effect="plain">
              执行中
            </ElTag>
          </div>
          <div class="metric-grid metric-grid--compact">
            <div class="metric">
              <span>上游水位</span><strong>{{ status.upstreamLevel.toFixed(2) }} m</strong>
            </div>
            <div class="metric">
              <span>下游水位</span><strong>{{ status.downstreamLevel.toFixed(2) }} m</strong>
            </div>
            <div class="metric">
              <span>入库流量</span><strong>{{ status.flowRate }} m³/s</strong>
            </div>
            <div class="metric">
              <span>闸门开度</span><strong>{{ status.gateOpening }}%</strong>
            </div>
          </div>
          <div class="status-foot">末次调度：{{ formatTime(status.lastDispatchAt) }}</div>
        </GlassPanel3D>

        <GlassPanel3D title="三级自动执行权限">
          <div
            v-for="lv in AUTO_LEVEL_OPTIONS"
            :key="lv.value"
            class="level-card"
            :class="{ active: status.autoLevel === lv.value }"
            :style="{ '--lv-color': lv.color }"
            @click="
              canModifyLevel &&
                status.autoLevel !== lv.value &&
                ((pendingLevel = lv.value as 1 | 2 | 3), (levelDialogVisible = true))
            "
          >
            <strong>{{ lv.label }}</strong>
            <p>{{ lv.description }}</p>
          </div>
          <p
v-if="!canModifyLevel" class="readonly-tip">仅管理员/算法工程师可修改</p>
        </GlassPanel3D>

        <GlassPanel3D title="手动干预">
          <p
v-if="!canManualControl" class="manual-tip">自动模式且非 L1 时，手动控制已锁定</p>
          <div v-if="status.isExecuting"
class="manual-exec-banner">
            <span>执行中：目标 <strong>{{ executingTarget ?? targetOpening }}%</strong> · 当前开度
              {{ status.gateOpening }}%</span>
          </div>
          <div class="manual-row">
            <span>目标开度</span>
            <ElInputNumber
              v-model="targetOpening"
              :min="OPENING_MIN"
              :max="OPENING_MAX"
              :step="OPENING_STEP"
              :disabled="!canManualControl"
              controls-position="right"
              class="manual-input"
              @change="onTargetInput"
            />
            <span class="unit">%</span>
            <span class="delta">Δ {{ targetOpening - status.gateOpening >= 0 ? '+' : ''
            }}{{ targetOpening - status.gateOpening }}%</span>
          </div>
          <ElSlider
            v-model="targetOpening"
            :min="OPENING_MIN"
            :max="OPENING_MAX"
            :step="OPENING_STEP"
            :disabled="!canManualControl"
            @change="onTargetInput"
          />
          <p
            v-if="canManualControl && !status.isExecuting && targetOpening === status.gateOpening"
            class="manual-hint"
          >
            与当前开度相同，调整目标值后可执行
          </p>
          <div class="manual-actions">
            <template v-if="status.isExecuting">
              <ElButton type="warning"
class="manual-action-btn" @click="handleCancelExecute">
                取消执行
              </ElButton>
              <ElButton
                v-if="canReDispatch"
                type="primary"
                class="manual-action-btn"
                @click="handleReDispatch"
              >
                改派执行
              </ElButton>
            </template>
            <ElButton
              v-else
              type="primary"
              block
              class="manual-exec"
              :disabled="!canSubmitExecute"
              @click="handleExecute"
            >
              执行
            </ElButton>
          </div>
        </GlassPanel3D>
      </div>

      <GlassPanel3D v-if="decision"
title="调度建议" class="panel-decision">
        <div class="decision-summary">
          <div class="decision-action">
            <span class="lbl">推荐动作</span>
            <p class="action-val">
              闸门开至 <strong>{{ decision.recommended_opening }}%</strong>
              <em>{{ openingDirection }}</em>
            </p>
            <span class="lbl">预期效果</span>
            <p class="effect-val">
              {{ expectedEffect }}
            </p>
          </div>
          <div class="decision-conf">
            <div class="conf-head">
              <span>置信度</span>
              <strong :style="{ color: confidenceColor }">{{ confidenceValue }}%</strong>
            </div>
            <ElProgress
              :percentage="confidenceValue"
              :color="confidenceColor"
              :stroke-width="10"
              :show-text="false"
            />
            <p
v-if="confidenceValue < 60" class="conf-warn">建议人工复核后再执行</p>
          </div>
        </div>
        <div class="decision-btns">
          <ElButton type="primary"
:icon="View" @click="decisionDialogVisible = true">
            查看详情
          </ElButton>
          <ElButton
            type="success"
            :icon="CircleCheck"
            :disabled="status.isExecuting"
            @click="handleAccept"
          >
            采纳建议
          </ElButton>
          <ElButton
:icon="CircleClose" @click="ignoreVisible = true"> 忽略 </ElButton>
        </div>
      </GlassPanel3D>
    </div>

    <!-- §3.6 LSTM 预测图 -->
    <GlassPanel3D title="LSTM 预测"
class="panel-chart">
      <div class="chart-toolbar">
        <ElSelect v-model="predictTerm"
size="small" style="width: 72px">
          <ElOption :value="1"
label="1h" /><ElOption :value="2"
label="3h" /><ElOption
            :value="3"
            label="6h"
          />
        </ElSelect>
        <ElSelect v-model="metricKey"
size="small" style="width: 80px">
          <ElOption label="水位"
value="water" /><ElOption label="流量"
value="flow" />
        </ElSelect>
        <ElButton :icon="Refresh"
circle size="small" @click="refreshAll" />
        <span v-if="prediction"
class="chart-meta">
          准确率 {{ prediction.predict_accuracy }}% · 更新 {{ formatTime(prediction.created_at) }}
        </span>
      </div>
      <VChart class="lstm-chart"
:option="chartOption" autoresize />
    </GlassPanel3D>

    <!-- 物理防护配置摘要（文档 §2.5） -->
    <GlassPanel3D title="物理防护配置"
class="panel-physics-guard">
      <template v-if="physicsGuard">
        <div class="physics-guard-bar">
          <ElTag
type="info" effect="plain"> v{{ physicsGuard.config_version }} </ElTag>
          <ElTag :type="SYNC_STATUS_MAP[physicsGuard.sync_status]?.type ?? 'info'"
size="small">
            {{ SYNC_STATUS_MAP[physicsGuard.sync_status]?.label ?? physicsGuard.sync_status }}
          </ElTag>
          <span>紧急 <strong>{{ physicsGuard.upstream_emergency }} m</strong></span>
          <span>危险 <strong>{{ physicsGuard.upstream_danger }} m</strong></span>
          <span>预警 <strong>{{ physicsGuard.upstream_warning }} m</strong></span>
          <span>L3 置信度 <strong>{{ physicsGuard.fusion_l3_confidence }}</strong></span>
          <span v-if="physicsGuard.last_sync_at"
class="physics-sync">
            同步 {{ formatTime(physicsGuard.last_sync_at) }}
          </span>
          <ElButton
size="small" @click="historyVisible = true"> 变更历史 </ElButton>
        </div>
      </template>
    </GlassPanel3D>

    <!-- §3.8 调度记录 — 底部全宽 -->
    <GlassPanel3D title="调度记录"
class="panel-records">
      <ElInput
        v-model="recordKeyword"
        placeholder="搜索模式、动作、操作人、结果..."
        clearable
        class="record-search"
      />
      <div class="record-table-wrap">
        <div class="record-head">
          <span>时间</span><span>模式</span><span>动作</span><span>目标开度</span><span>互锁</span><span>结果</span><span>操作人</span>
        </div>
        <template v-for="row in pagedRecords"
:key="row.id">
          <div class="record-row"
@click="toggleRecordExpand(row.id)">
            <span class="mono">{{ formatTime(row.decision_time) }}</span>
            <span>{{ row.decision_mode }}</span>
            <span>{{ row.action ?? '—' }}</span>
            <span>{{ row.recommended_opening }}%</span>
            <span class="record-interlock">
              <ElTag
                v-if="row.physics_validation?.interlock?.triggered"
                type="warning"
                size="small"
                effect="plain"
              >
                {{ interlockRecordLabel(row.physics_validation) }}
              </ElTag>
              <span v-else
class="record-interlock--ok">—</span>
            </span>
            <span><ElTag :type="statusTagType(row.execution_status)"
size="default">{{
                statusLabel(row.execution_status)
            }}</ElTag></span>
            <span>{{ row.operator_name ?? '—' }}</span>
          </div>
          <div v-if="expandedRecordId === row.id && row.snapshot"
class="record-expand">
            <p>
              <strong>决策快照</strong> · 置信度 {{ row.snapshot.confidence }}% · 推荐开度
              {{ row.snapshot.recommended_opening }}%
            </p>
            <div v-if="row.physics_validation"
class="snap-validation">
              <span>推理指标</span>
              <span>等级
                {{
                  DECISION_LEVEL_MAP[row.physics_validation.decision_level] ??
                    row.physics_validation.decision_level
                }}</span>
              <span>综合贡献
                {{ formatContribution(row.physics_validation.contribution.overall) }}</span>
              <ElTag
                v-if="row.physics_validation.interlock?.triggered"
                type="warning"
                size="small"
                effect="plain"
              >
                互锁 ·
                {{
                  row.physics_validation.interlock.rules
                    .map((r) => INTERLOCK_RULE_MAP[r] ?? r)
                    .join(' / ')
                }}
              </ElTag>
              <ElTag
v-else type="success" size="small" effect="plain"> 互锁通过 </ElTag>
            </div>
            <div class="snap-factors">
              <span
v-for="f in row.snapshot.factors" :key="f.name"
              >{{ f.name }} {{ f.value }} ({{ (f.weight * 100).toFixed(0) }}%)</span>
            </div>
            <div class="snap-plans">
              <span
v-for="p in row.snapshot.plans" :key="p.id" :class="{ rec: p.recommended }"
                >{{ p.id }} {{ p.opening }}% 得分{{ p.totalScore }}</span
              >
            </div>
          </div>
        </template>
        <div
v-if="filteredRecords.length === 0" class="record-empty">暂无匹配记录</div>
      </div>
      <div v-if="recordTotal > 0"
class="record-footer">
        <ElPagination
          v-model:current-page="recordPageNum"
          :page-size="RECORD_PAGE_SIZE"
          :total="recordTotal"
          layout="total, prev, pager, next"
          background
          class="record-pagination"
        />
      </div>
    </GlassPanel3D>

    <GlassPanel3D title="闸门动作历史"
class="panel-gate-actions">
      <GateActionsPanel />
    </GlassPanel3D>

    <!-- 决策详情弹窗 §3.4 -->
    <ElDialog
      v-model="decisionDialogVisible"
      title="调度决策详情"
      width="1200px"
      top="3vh"
      class="decision-detail-dialog"
      destroy-on-close
    >
      <template v-if="decision">
        <div class="detail-block">
          <h4>推荐动作与预期效果</h4>
          <p class="detail-summary">
            开度 <strong>{{ decision.recommended_opening }}%</strong>（当前
            {{ decision.current_opening }}%）· {{ expectedEffect }}
          </p>
        </div>
        <div class="detail-block">
          <h4>影响因素</h4>
          <ElTable :data="decision.factors"
border stripe class="detail-table">
            <ElTableColumn prop="name"
label="名称" width="180" />
            <ElTableColumn prop="value"
label="当前值" min-width="160" />
            <ElTableColumn label="方向"
width="90" align="center">
              <template #default="{ row }">
                <span
                  class="factor-dir"
                  :style="{ color: FACTOR_DIRECTION_MAP[row.direction]?.color }"
                >{{ FACTOR_DIRECTION_MAP[row.direction]?.icon }}</span>
              </template>
            </ElTableColumn>
            <ElTableColumn label="权重"
width="100" align="right">
              <template #default="{ row }"> {{ (row.weight * 100).toFixed(0) }}% </template>
            </ElTableColumn>
          </ElTable>
        </div>
        <div class="detail-block">
          <h4>方案对比</h4>
          <ElTable
            :data="decision.alternatives"
            border
            stripe
            class="detail-table"
            :row-class-name="({ row }) => (row.recommended ? 'row-rec' : '')"
          >
            <ElTableColumn prop="id"
label="方案" width="120" />
            <ElTableColumn prop="opening"
label="目标开度(%)" width="130" align="right" />
            <ElTableColumn prop="expectedLevel"
label="预期水位(m)" width="140" align="right" />
            <ElTableColumn prop="power"
label="发电量(kW)" width="130" align="right" />
            <ElTableColumn prop="safetyScore"
label="安全评分" width="110" align="right" />
            <ElTableColumn prop="totalScore"
label="综合得分" width="110" align="right" />
            <ElTableColumn label="推荐"
width="90" align="center">
              <template #default="{ row }">
                {{ row.recommended ? '是' : '—' }}
              </template>
            </ElTableColumn>
          </ElTable>
        </div>
        <div class="detail-block detail-conf">
          <h4>置信度</h4>
          <ElProgress :percentage="confidenceValue"
:color="confidenceColor" :stroke-width="20" />
          <p
v-if="confidenceValue < 60" class="conf-warn">建议人工复核后再执行</p>
          <p class="detail-meta">
            trace: {{ decision.trace_id }} · 决策时间 {{ formatTime(decision.decision_time) }}
          </p>
        </div>

        <!-- 本次推理指标 — 三维评判体系 -->
        <div v-if="physicsValidation"
class="detail-block inference-metrics">
          <h4>本次推理指标</h4>
          <ElCollapse v-model="metricsCollapse">
            <ElCollapseItem title="预测准确性（LSTM 这一步的表现）"
name="prediction">
              <dl class="metric-dl">
                <div class="metric-dl__row">
                  <dt>物理校验</dt>
                  <dd
                    :class="{
                      'is-abnormal': (physicsValidation.physics_correction_steps ?? 0) > 0,
                    }"
                  >
                    {{ physicsCheckLabel(physicsValidation) }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>物理偏差</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.physics_violation_m > 0.5 }">
                    {{ physicsViolationLabel(physicsValidation) }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>趋势方向</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.trend_direction === 'mismatch' }">
                    {{ trendLabel(physicsValidation) }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>贡献</dt>
                  <dd :class="contributionClass(physicsValidation.contribution.prediction)">
                    {{
                      formatContribution(physicsValidation.contribution.prediction)
                    }}（Prediction_Score）
                  </dd>
                </div>
              </dl>
            </ElCollapseItem>

            <ElCollapseItem title="决策可靠性（DQN + 安全层这一步的表现）"
name="decision">
              <dl class="metric-dl">
                <div class="metric-dl__row">
                  <dt>安全约束</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.safety_overridden }">
                    {{
                      physicsValidation.safety_overridden
                        ? `✗ 覆盖 · ${physicsValidation.safety_override_reason || '安全规则一票否决'}`
                        : '✓ 通过'
                    }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>决策等级</dt>
                  <dd
                    :class="{
                      'is-abnormal': ['L1_MANUAL', 'OVERRIDE'].includes(
                        physicsValidation.decision_level,
                      ),
                    }"
                  >
                    {{
                      DECISION_LEVEL_MAP[physicsValidation.decision_level] ??
                        physicsValidation.decision_level
                    }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>影子风险</dt>
                  <dd>
                    <span :style="{ color: RISK_LEVEL_MAP[physicsValidation.risk_level]?.color }">
                      {{ physicsValidation.risk_level }}
                    </span>
                    · p={{ physicsValidation.risk_probability.toFixed(2) }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>指令平滑</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.command_smoothed }">
                    {{
                      physicsValidation.command_smoothed
                        ? `✗ 过滤 · ${physicsValidation.smooth_reason || '变化率超限'}`
                        : '✓ 通过'
                    }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>互锁约束</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.interlock?.triggered }">
                    {{ interlockLabel(physicsValidation) }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>贡献</dt>
                  <dd :class="contributionClass(physicsValidation.contribution.decision)">
                    {{
                      formatContribution(physicsValidation.contribution.decision)
                    }}（Decision_Score）
                  </dd>
                </div>
              </dl>
            </ElCollapseItem>

            <ElCollapseItem title="物理合规性（设备 + 物理边界这一步的表现）"
name="compliance">
              <dl class="metric-dl">
                <div class="metric-dl__row">
                  <dt>水量平衡偏差</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.physics_violation_m > 0.5 }">
                    {{ physicsValidation.physics_violation_m.toFixed(2) }}m
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>闸门限位</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.gate_limit_touched }">
                    {{ physicsValidation.gate_limit_touched ? '✗ 已触碰限位' : '✓ 未触碰' }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>变化率超限</dt>
                  <dd :class="{ 'is-abnormal': physicsValidation.rate_exceeded }">
                    {{ physicsValidation.rate_exceeded ? '✗ 变化率超限' : '✓ 未超限' }}
                  </dd>
                </div>
                <div class="metric-dl__row">
                  <dt>贡献</dt>
                  <dd :class="contributionClass(physicsValidation.contribution.compliance)">
                    {{
                      formatContribution(physicsValidation.contribution.compliance)
                    }}（Compliance_Score）
                  </dd>
                </div>
              </dl>
            </ElCollapseItem>
          </ElCollapse>

          <div class="inference-overall"
:class="overallContributionMeta(physicsValidation).cls">
            <span class="inference-overall__icon">{{
              overallContributionMeta(physicsValidation).icon
            }}</span>
            <span>
              本次综合贡献 {{ formatContribution(physicsValidation.contribution.overall) }} ·
              {{ overallContributionMeta(physicsValidation).text }}
            </span>
          </div>
        </div>
      </template>
      <template #footer>
        <ElButton
size="large" @click="ignoreVisible = true"> 忽略 </ElButton>
        <ElButton
size="large" @click="decisionDialogVisible = false"> 关闭 </ElButton>
        <ElButton size="large"
type="primary" :disabled="status.isExecuting" @click="handleAccept">
          采纳建议
        </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="levelDialogVisible"
title="变更自动执行权限" width="480px">
      <p>
        确认切换为：<strong>{{ AUTO_LEVEL_MAP[pendingLevel]?.label }}</strong>
      </p>
      <p class="sub">
        {{ AUTO_LEVEL_MAP[pendingLevel]?.description }}
      </p>
      <template #footer>
        <ElButton @click="levelDialogVisible = false"> 取消 </ElButton>
        <ElButton
type="primary" @click="submitLevel"> 确认 </ElButton>
      </template>
    </ElDialog>

    <ElDialog v-model="ignoreVisible"
title="忽略建议" width="420px">
      <ElFormItem label="原因（选填）">
        <ElInput v-model="ignoreReason" type="textarea" :rows="3" placeholder="可填写忽略原因" />
      </ElFormItem>
      <template #footer>
        <ElButton @click="ignoreVisible = false"> 取消 </ElButton>
        <ElButton
type="warning" @click="handleIgnore"> 确认忽略 </ElButton>
      </template>
    </ElDialog>

    <!-- 物理防护配置变更历史（当前水库快捷查看） -->
    <ElDialog v-model="historyVisible"
title="物理防护配置变更历史" width="860px">
      <p class="history-dialog-hint">当前水库的配置版本记录，可在此查看详情或回滚。</p>
      <ElTable :data="physicsHistory"
border stripe size="small">
        <ElTableColumn prop="config_version"
label="版本号" width="96" />
        <ElTableColumn prop="changed_at"
label="变更时间" width="168">
          <template #default="{ row }">
            {{ formatTime(row.changed_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="changed_by_name"
label="变更人" width="100" />
        <ElTableColumn prop="description"
label="变更说明" min-width="200" show-overflow-tooltip />
        <ElTableColumn label="状态"
width="88" align="center">
          <template #default="{ row }">
            <ElTag :type="row.is_active ? 'success' : 'info'"
size="small">
              {{ row.is_active ? '生效中' : '历史' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作"
width="140" align="center" fixed="right">
          <template #default="scope">
            <ElButton
              link
              type="primary"
              @click="openHistoryDetail(scope.row as PhysicsGuardHistoryItem)"
            >
              详情
            </ElButton>
            <ElButton
              v-if="!(scope.row as PhysicsGuardHistoryItem).is_active"
              link
              type="warning"
              @click="handleRollback(scope.row as PhysicsGuardHistoryItem)"
            >
              回滚
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <template #footer>
        <div class="history-dialog-footer">
          <span class="history-dialog-footer-hint">需切换水库或编辑配置？</span>
          <ElButton link
type="primary" @click="goPhysicsGuardHistorySettings">
            前往设置页管理 →
          </ElButton>
        </div>
      </template>
    </ElDialog>

    <ElDialog v-model="historyDetailVisible"
title="配置变更详情" width="520px">
      <template v-if="historyDetailRow">
        <p class="history-detail-meta">
          <strong>v{{ historyDetailRow.config_version }}</strong>
          · {{ historyDetailRow.changed_by_name }} · {{ formatTime(historyDetailRow.changed_at) }}
        </p>
        <p>{{ historyDetailRow.description }}</p>
        <ElTable :data="historyDetailRow.changes"
border size="small" style="margin-top: 12px">
          <ElTableColumn prop="label"
label="字段" width="120" />
          <ElTableColumn prop="before"
label="变更前" width="100" />
          <ElTableColumn prop="after"
label="变更后" width="100" />
        </ElTable>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.dispatch-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0 16px 16px;
  font-size: 15px;
}

.dispatch-top {
  display: grid;
  grid-template-columns: 1.35fr 0.85fr;
  gap: 14px;
  align-items: stretch;
  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
}

.dispatch-control-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  min-width: 0;
  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
}

.panel-decision {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.lbl {
  font-size: 13px;
  color: $cockpit-text-dim;
  display: block;
  margin-bottom: 4px;
}

.mode-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
  .lbl {
    margin: 0;
  }
}
.mode-btns {
  display: flex;
  gap: 6px;
}
.mode-btn {
  padding: 7px 18px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 14px;
  &.active {
    background: #1890ff;
    border-color: #1890ff;
    color: #fff;
    font-weight: 600;
  }
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 12px;
  &--compact {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 700px) {
    grid-template-columns: repeat(2, 1fr);
  }
}
.metric {
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  span {
    display: block;
    font-size: 13px;
    color: $cockpit-text-dim;
    margin-bottom: 4px;
  }
  strong {
    font-size: 19px;
    color: #1e293b;
    font-family: 'SF Mono', monospace;
  }
}
.status-foot {
  font-size: 14px;
  color: $cockpit-text-dim;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}

.decision-summary {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 16px;
  margin-bottom: 14px;
  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
}
.action-val {
  margin: 0 0 12px;
  font-size: 16px;
  color: #1e293b;
  strong {
    font-size: 26px;
    color: #1890ff;
  }
  em {
    font-style: normal;
    color: #64748b;
    margin-left: 8px;
    font-size: 14px;
  }
}
.effect-val {
  margin: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}
.conf-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}
.conf-warn {
  margin: 8px 0 0;
  font-size: 13px;
  color: #d97706;
}
.decision-btns {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.chart-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.chart-meta {
  margin-left: auto;
  font-size: 12px;
  color: $cockpit-text-dim;
}
.lstm-chart {
  width: 100%;
  height: 340px;
}

.level-card {
  padding: 14px 16px;
  margin-bottom: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  background: #fff;
  transition: border-color 0.2s;
  strong {
    display: block;
    font-size: 16px;
    margin-bottom: 6px;
  }
  p {
    margin: 0;
    font-size: 14px;
    color: $cockpit-text-dim;
    line-height: 1.55;
  }
  &.active {
    border-color: var(--lv-color);
    background: #f8fafc;
    box-shadow: inset 3px 0 0 var(--lv-color);
  }
}
.readonly-tip,
.manual-tip {
  font-size: 13px;
  color: $cockpit-text-dim;
  text-align: center;
  margin-top: 8px;
}

.manual-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 15px;
  flex-wrap: wrap;
  .unit {
    font-size: 16px;
    font-weight: 600;
    color: #1890ff;
  }
  .delta {
    font-size: 14px;
    color: #64748b;
    margin-left: auto;
  }
}
.manual-input {
  width: 120px;
  :deep(.el-input__inner) {
    font-size: 18px;
    font-weight: 600;
    text-align: center;
  }
}
.manual-exec-banner {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  font-size: 14px;
  color: #92400e;
  strong {
    color: #b45309;
    font-size: 18px;
  }
}
.manual-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #64748b;
  text-align: center;
}
.manual-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}
.manual-action-btn {
  flex: 1;
  min-width: 0;
  height: 40px;
  font-size: 15px;
}
.manual-exec {
  margin-top: 0;
  height: 40px;
  font-size: 15px;
}

.panel-gate-actions {
  flex-shrink: 0;
  margin-top: 12px;
}
.panel-records {
  flex: 1;
  min-height: 320px;
}
.record-search {
  margin-bottom: 14px;
  max-width: 420px;
}
.record-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}
.record-head,
.record-row {
  display: grid;
  grid-template-columns: 168px 72px 1fr 100px 120px 100px 100px;
  gap: 16px;
  padding: 16px 20px;
  font-size: 16px;
  align-items: center;
  @media (max-width: 900px) {
    grid-template-columns: 140px 60px 1fr 80px 100px 88px 80px;
    font-size: 14px;
    gap: 10px;
    padding: 12px 14px;
  }
}
.record-interlock {
  font-size: 13px;
  &--ok {
    color: #94a3b8;
  }
}
.physics-guard-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  font-size: 14px;
  color: #475569;
  strong {
    color: #1e293b;
    font-family: 'SF Mono', monospace;
  }
  .physics-sync {
    margin-left: auto;
    font-size: 13px;
    color: #64748b;
  }
  @media (max-width: 900px) {
    .physics-sync {
      margin-left: 0;
      width: 100%;
    }
  }
}
.panel-physics-guard {
  flex-shrink: 0;
}
.history-detail-meta {
  margin: 0 0 8px;
  font-size: 15px;
  color: #334155;
}
.history-dialog-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #64748b;
}
.history-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
  .history-dialog-footer-hint {
    font-size: 13px;
    color: #94a3b8;
  }
}
.record-head {
  color: $cockpit-accent;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: #f8fafc;
  z-index: 1;
}
.record-row {
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  background: #fff;
  &:hover {
    background: #f8fafc;
  }
}
.record-expand {
  padding: 14px 18px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 14px;
  .snap-validation {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
    font-size: 13px;
    color: #475569;
    > span:first-child {
      font-weight: 600;
      color: #334155;
    }
  }
  .snap-factors,
  .snap-plans {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 10px;
    color: #475569;
  }
  .rec {
    color: #16a34a;
    font-weight: 600;
  }
}
.record-empty {
  text-align: center;
  padding: 32px;
  color: $cockpit-text-dim;
  font-size: 15px;
}
.record-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.record-pagination {
  :deep(.el-pagination__total) {
    font-size: 15px;
    color: #475569;
  }
  :deep(.btn-prev),
  :deep(.btn-next),
  :deep(.el-pager li) {
    min-width: 36px;
    height: 36px;
    line-height: 36px;
    font-size: 15px;
  }
}
.mono {
  font-family: 'SF Mono', monospace;
  font-size: 14px;
}

.detail-block {
  margin-bottom: 24px;
  h4 {
    font-size: 18px;
    color: #1e293b;
    margin: 0 0 14px;
    padding-left: 12px;
    border-left: 4px solid #1890ff;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: #475569;
    font-size: 16px;
    line-height: 1.65;
  }
}
.detail-summary strong {
  font-size: 22px;
  color: #1890ff;
}
.factor-dir {
  font-size: 20px;
  font-weight: 600;
}
.detail-meta {
  margin-top: 12px;
  font-size: 14px;
  color: $cockpit-text-dim;
}
.detail-conf .conf-warn {
  font-size: 15px;
}
.sub {
  color: #64748b;
  font-size: 14px;
}

.inference-metrics {
  :deep(.el-collapse-item__header) {
    font-size: 15px;
    font-weight: 600;
    color: #334155;
  }
  :deep(.el-collapse-item__content) {
    padding-bottom: 8px;
  }
}
.metric-dl {
  margin: 0;
  padding: 0;
  &__row {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 15px;
    &:last-child {
      border-bottom: none;
    }
  }
  dt {
    color: #64748b;
  }
  dd {
    margin: 0;
    color: #334155;
    font-weight: 500;
  }
  .is-abnormal {
    color: #dc2626;
  }
}
.contrib-pos {
  color: #16a34a !important;
}
.contrib-neg {
  color: #dc2626 !important;
}
.contrib-neutral {
  color: #64748b !important;
}
.inference-overall {
  margin-top: 16px;
  padding: 14px 16px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  &.contrib-pos {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }
  &.contrib-neg {
    background: #fef2f2;
    border-color: #fecaca;
  }
  &__icon {
    font-size: 18px;
  }
}

.decision-detail-dialog {
  :deep(.el-dialog) {
    --el-bg-color: #ffffff;
    max-width: calc(100vw - 48px);
  }
  :deep(.el-dialog__header) {
    padding: 20px 28px 12px;
    margin-right: 0;
  }
  :deep(.el-dialog__title) {
    font-size: 22px;
    font-weight: 700;
    color: #1e293b;
  }
  :deep(.el-dialog__body) {
    padding: 8px 28px 24px;
    max-height: calc(100vh - 180px);
    overflow-y: auto;
  }
  :deep(.el-dialog__footer) {
    padding: 16px 28px 24px;
  }
  :deep(.el-dialog__footer .el-button) {
    min-width: 108px;
    font-size: 15px;
  }
  :deep(.detail-table) {
    font-size: 16px;
  }
  :deep(.detail-table th.el-table__cell) {
    font-size: 16px;
    font-weight: 600;
    color: #334155;
    padding: 16px 0;
    background: #f8fafc;
  }
  :deep(.detail-table td.el-table__cell) {
    padding: 14px 0;
    font-size: 16px;
    color: #1e293b;
  }
  :deep(.el-progress__text) {
    font-size: 16px !important;
    font-weight: 600;
  }
}

:deep(.row-rec) {
  background: #f0fdf4 !important;
}
:deep(.el-slider__bar) {
  background: #1890ff;
}
</style>
