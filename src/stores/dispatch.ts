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
  const gatesInitialLoading = ref(false)
  const coreReady = ref(false)
  const precheckResult = ref<GatePrecheckResult | null>(null)

  let coreLoadPromise: Promise<void> | null = null
  let gatesRefreshPromise: Promise<void> | null = null

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
    if (saved === 'manual' || saved === 'auto') {
      status.value.mode = saved
    } else if (import.meta.env.DEV) {
      status.value.mode = 'manual'
    }
  }

  async function refreshGates(options?: { silent?: boolean }) {
    if (gatesRefreshPromise) return gatesRefreshPromise

    const silent = options?.silent ?? false
    const showLoading = !silent && gates.value.length === 0
    if (showLoading) gatesInitialLoading.value = true

    gatesRefreshPromise = (async () => {
      const simStore = useVirtualSimulationStore()
      const prevTargets = new Map(gates.value.map((g) => [g.id, g.targetOpening]))
      const hadPending = pendingChangeCount(gates.value) > 0
      try {
        const [gateList, kpiRaw] = await Promise.all([fetchGates(1), fetchRealtimeKpi(1)])
        simStore.initBaselineFromKpi(kpiRaw)
        const kpi = simStore.overlayKpi(kpiRaw)
        gates.value = simStore.overlayGates(gateList.map(buildGateNode))
        if (hadPending) {
          gates.value = gates.value.map((g) => ({
            ...g,
            targetOpening: prevTargets.get(g.id) ?? g.targetOpening,
          }))
        }
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
        if (showLoading) gatesInitialLoading.value = false
      }
    })().finally(() => {
      gatesRefreshPromise = null
    })

    return gatesRefreshPromise
  }

  async function refreshCore(predictTerm: 1 | 2 | 3 = 2) {
    const [st, dec, pred] = await Promise.all([
      fetchDispatchStatus(),
      fetchDecisionDetail(),
      fetchPrediction(predictTerm),
    ])
    status.value = {
      ...status.value,
      ...st.data,
      autoLevel: status.value.autoLevel,
    }
    applySavedMode()
    decision.value = dec.data
    prediction.value = pred.data
    if (dec.data && !userModifiedTarget.value && !st.data.isExecuting) {
      targetOpening.value = dec.data.recommended_opening
    }
    await refreshGates({ silent: gates.value.length > 0 })
    coreReady.value = true
  }

  async function ensureCoreLoaded(predictTerm: 1 | 2 | 3 = 2, force = false) {
    if (coreReady.value && !force) return
    if (coreLoadPromise) return coreLoadPromise
    coreLoadPromise = refreshCore(predictTerm).finally(() => {
      coreLoadPromise = null
    })
    return coreLoadPromise
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

  /** 表孔一键拉齐：以在线表孔当前开度均值（或指定值）同步目标 */
  function alignSurfaceTargets(opening?: number) {
    const surface = gates.value.filter((g) => g.group === 'surface' && isGateOnline(g.status))
    if (!surface.length) return
    const val = opening ?? Math.round(
      surface.reduce((s, g) => s + g.currentOpening, 0) / surface.length,
    )
    syncGroupTargets('surface', Math.min(100, Math.max(0, val)))
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
    if (!changed.length) return
    const ids = new Set(changed.map((g) => g.id))
    gates.value = gates.value.map((g) =>
      ids.has(g.id) ? { ...g, status: 'executing' as const } : g,
    )
    await new Promise((r) => setTimeout(r, 600))
    gates.value = gates.value.map((g) =>
      ids.has(g.id)
        ? { ...g, status: 'online' as const, currentOpening: g.targetOpening }
        : g,
    )
    const agg = calcAggregateOpening(gates.value, false)
    if (agg != null) status.value.gateOpening = agg
    precheckResult.value = precheckGateChanges(gates.value, head.value)
  }

  return {
    status,
    decision,
    prediction,
    gates,
    targetOpening,
    userModifiedTarget,
    selectedGateId,
    gatesInitialLoading,
    coreReady,
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
    ensureCoreLoaded,
    refreshGates,
    setGateTarget,
    resetGateTarget,
    resetAllGateTargets,
    syncGroupTargets,
    alignSurfaceTargets,
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
