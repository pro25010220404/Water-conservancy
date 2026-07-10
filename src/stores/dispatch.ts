// ============================================================
// 调度决策 — 跨子页共享状态（运行控制 / 节点控制 / 决策分析）
// ============================================================
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { DecisionDetail, DispatchStatus, PredictionData } from '@/types/dispatch'
import type { GateNodeControl } from '@/types/gateControl'
import {
  fetchDispatchStatus,
  fetchDecisionDetail,
  fetchPrediction,
  postExecute,
  postCancelExecute,
  postAcceptDecision,
  postIgnoreDecision,
  putDispatchMode,
  putAutoLevel,
} from '@/api/dispatchPage'
import { fetchGates, fetchRealtimeKpi } from '@/api/monitoring'
import {
  buildGateNode,
  calcAggregateOpening,
  calcImpactPreview,
  distributeTotalOpening,
  isGateOnline,
  pendingChangeCount,
  precheckGateChanges,
} from '@/utils/gateControl'
import type { GatePrecheckResult } from '@/types/gateControl'
import { useVirtualSimulationStore } from '@/stores/virtualSimulation'

export const useDispatchStore = defineStore('dispatch', () => {
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
  const gates = ref<GateNodeControl[]>([])
  const targetOpening = ref(45)
  const userModifiedTarget = ref(false)
  const selectedGateId = ref<number | null>(null)
  const gatesLoading = ref(false)
  const precheckResult = ref<GatePrecheckResult | null>(null)

  const outflowRate = ref(0)

  const canManualControl = computed(
    () => status.value.mode === 'manual' || status.value.autoLevel === 1,
  )

  const aggregateOpening = computed(() => {
    const fromGates = calcAggregateOpening(gates.value, false)
    return fromGates ?? status.value.gateOpening
  })

  const aggregateTargetOpening = computed(
    () => calcAggregateOpening(gates.value, true) ?? aggregateOpening.value,
  )

  const selectedGate = computed(
    () => gates.value.find((g) => g.id === selectedGateId.value) ?? null,
  )

  const pendingChanges = computed(() => pendingChangeCount(gates.value))

  const head = computed(
    () => Math.max(0, status.value.upstreamLevel - status.value.downstreamLevel),
  )

  const impactPreview = computed(() =>
    calcImpactPreview(gates.value, status.value.flowRate, head.value),
  )

  const interlockOk = computed(() => precheckResult.value?.passed !== false)

  function applySavedMode() {
    const saved = localStorage.getItem('dispatch_mode')
    if (saved === 'manual' || saved === 'auto') status.value.mode = saved
  }

  async function refreshGates() {
    gatesLoading.value = true
    const simStore = useVirtualSimulationStore()
    try {
      const [gateList, kpiRaw] = await Promise.all([fetchGates(1), fetchRealtimeKpi(1)])
      simStore.initBaselineFromKpi(kpiRaw)
      const kpi = simStore.overlayKpi(kpiRaw)
      gates.value = simStore.overlayGates(gateList.map(buildGateNode))
      if (!selectedGateId.value && gates.value.length) {
        selectedGateId.value = gates.value.find((g) => isGateOnline(g.status))?.id ?? gates.value[0].id
      }
      status.value.upstreamLevel = kpi.upstreamLevel
      status.value.downstreamLevel = kpi.downstreamLevel
      status.value.flowRate = kpi.inflowRate
      outflowRate.value = kpi.outflowRate
      const agg = calcAggregateOpening(gates.value, false)
      if (agg != null) status.value.gateOpening = agg
      precheckResult.value = precheckGateChanges(gates.value, head.value)
    } finally {
      gatesLoading.value = false
    }
  }

  async function refreshCore(predictTerm: 1 | 2 | 3 = 2) {
    const [st, dec, pred] = await Promise.all([
      fetchDispatchStatus(),
      fetchDecisionDetail(),
      fetchPrediction(predictTerm),
    ])
    status.value = st.data
    applySavedMode()
    decision.value = dec.data
    prediction.value = pred.data
    if (dec.data && !userModifiedTarget.value && !st.data.isExecuting) {
      targetOpening.value = dec.data.recommended_opening
    }
    await refreshGates()
  }

  function setGateTarget(gateId: number, opening: number) {
    gates.value = gates.value.map((g) =>
      g.id === gateId ? { ...g, targetOpening: Math.min(100, Math.max(0, opening)) } : g,
    )
    precheckResult.value = precheckGateChanges(gates.value, head.value)
  }

  function resetGateTarget(gateId: number) {
    const g = gates.value.find((x) => x.id === gateId)
    if (g) setGateTarget(gateId, g.currentOpening)
  }

  function resetAllGateTargets() {
    gates.value = gates.value.map((g) => ({ ...g, targetOpening: g.currentOpening }))
    precheckResult.value = precheckGateChanges(gates.value, head.value)
  }

  function syncGroupTargets(group: GateNodeControl['group'], opening: number) {
    gates.value = gates.value.map((g) =>
      g.group === group && isGateOnline(g.status)
        ? { ...g, targetOpening: opening }
        : g,
    )
    precheckResult.value = precheckGateChanges(gates.value, head.value)
  }

  function applyTotalOpeningDistribution(targetTotal: number, surfaceOnly = false) {
    gates.value = distributeTotalOpening(gates.value, targetTotal, surfaceOnly)
    precheckResult.value = precheckGateChanges(gates.value, head.value)
  }

  async function mockExecuteGate(gateId: number) {
    const idx = gates.value.findIndex((g) => g.id === gateId)
    if (idx < 0) return
    const node = gates.value[idx]
    gates.value[idx] = { ...node, status: 'executing' }
    await new Promise((r) => setTimeout(r, 1500))
    gates.value[idx] = {
      ...gates.value[idx],
      status: 'online',
      currentOpening: node.targetOpening,
    }
    const agg = calcAggregateOpening(gates.value, false)
    if (agg != null) status.value.gateOpening = agg
    precheckResult.value = precheckGateChanges(gates.value, head.value)
  }

  async function mockBatchExecute() {
    const changed = gates.value.filter(
      (g) => isGateOnline(g.status) && g.targetOpening !== g.currentOpening,
    )
    for (const g of changed) {
      await mockExecuteGate(g.id)
    }
  }

  return {
    status,
    decision,
    prediction,
    gates,
    targetOpening,
    userModifiedTarget,
    selectedGateId,
    gatesLoading,
    precheckResult,
    outflowRate,
    canManualControl,
    aggregateOpening,
    aggregateTargetOpening,
    selectedGate,
    pendingChanges,
    head,
    impactPreview,
    interlockOk,
    refreshCore,
    refreshGates,
    setGateTarget,
    resetGateTarget,
    resetAllGateTargets,
    syncGroupTargets,
    applyTotalOpeningDistribution,
    mockExecuteGate,
    mockBatchExecute,
    applySavedMode,
    // re-export API helpers for pages
    postExecute,
    postCancelExecute,
    postAcceptDecision,
    postIgnoreDecision,
    putDispatchMode,
    putAutoLevel,
  }
})
