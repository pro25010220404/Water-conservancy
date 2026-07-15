// ============================================================
// 水情虚拟仿真 — 全局状态（跨页面联动）
// ============================================================
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RealtimeKpi } from '@/types/monitoring'
import type { GateNodeControl } from '@/types/gateControl'
import {
  clampOpening,
  computeSimulationDerived,
  openingJitter,
  scaleGateOpening,
  type SimulationBaseline,
} from '@/utils/virtualSimulationEngine'

/** 应用仿真后开度随机刷新间隔 */
const GATE_JITTER_INTERVAL_MS = 1800

export const useVirtualSimulationStore = defineStore('virtualSimulation', () => {
  const active = ref(false)
  const locked = ref(false)

  const baseline = ref<SimulationBaseline>({
    upstreamLevel: 175.7,
    downstreamLevel: 121.0,
    inflowRate: 1920,
    outflowRate: 302,
    gateOpening: 47,
  })

  const upstreamLevel = ref(baseline.value.upstreamLevel)
  const downstreamLevel = ref(baseline.value.downstreamLevel)
  const rainfall = ref(0)

  /** 递增后驱动开度伪随机刷新 */
  const jitterTick = ref(0)
  let jitterTimer: ReturnType<typeof setInterval> | null = null

  const derived = computed(() => {
    const base = computeSimulationDerived({
      upstreamLevel: upstreamLevel.value,
      downstreamLevel: downstreamLevel.value,
      rainfall: rainfall.value,
      baseline: baseline.value,
    })
    if (!active.value) return base
    // 聚合开度随 tick 微动；gateScale 保持工况基准，避免各孔同相位抖动
    return {
      ...base,
      aggregateOpening: clampOpening(
        base.aggregateOpening + openingJitter(0, jitterTick.value, 4),
      ),
    }
  })

  function startGateJitter() {
    if (jitterTimer != null) return
    jitterTick.value = 1
    jitterTimer = setInterval(() => {
      jitterTick.value += 1
    }, GATE_JITTER_INTERVAL_MS)
  }

  function stopGateJitter() {
    if (jitterTimer != null) {
      clearInterval(jitterTimer)
      jitterTimer = null
    }
    jitterTick.value = 0
  }

  function initBaselineFromKpi(kpi: RealtimeKpi) {
    if (active.value) return
    // 若接口上下游反挂，按常用向家坝量级纠正，避免剖面水头差为负
    let up = kpi.upstreamLevel
    let down = kpi.downstreamLevel
    if (down > up) {
      ;[up, down] = [down, up]
    }
    baseline.value = {
      upstreamLevel: up,
      downstreamLevel: down,
      inflowRate: kpi.inflowRate,
      outflowRate: kpi.outflowRate,
      gateOpening: Math.max(kpi.gateOpening, 5),
    }
    upstreamLevel.value = up
    downstreamLevel.value = down
  }

  function applySimulation() {
    active.value = true
    startGateJitter()
  }

  function resetSimulation() {
    active.value = false
    stopGateJitter()
    upstreamLevel.value = baseline.value.upstreamLevel
    downstreamLevel.value = baseline.value.downstreamLevel
    rainfall.value = 0
  }

  function toggleLock() {
    locked.value = !locked.value
  }

  /** 单孔开度：工况缩放 + 独立随机微动 */
  function overlayGateOpening(gateId: number, opening: number): number {
    if (!active.value) return opening
    const scaled = scaleGateOpening(opening, derived.value.gateScale)
    return clampOpening(scaled + openingJitter(gateId, jitterTick.value, 6))
  }

  /** 将仿真结果叠加到 KPI */
  function overlayKpi(kpi: RealtimeKpi): RealtimeKpi {
    if (!active.value) return kpi
    const d = derived.value
    return {
      ...kpi,
      upstreamLevel: d.upstreamLevel,
      downstreamLevel: d.downstreamLevel,
      inflowRate: d.inflowRate,
      outflowRate: d.outflowRate,
      gateOpening: d.aggregateOpening,
    }
  }

  /** 将仿真结果叠加到闸门节点 */
  function overlayGates(gates: GateNodeControl[]): GateNodeControl[] {
    if (!active.value) return gates
    const scale = derived.value.gateScale
    const tick = jitterTick.value
    return gates.map((g) => {
      const cur = clampOpening(
        scaleGateOpening(g.currentOpening, scale) + openingJitter(g.id, tick, 6),
      )
      const tgt = clampOpening(
        scaleGateOpening(g.targetOpening, scale) + openingJitter(g.id + 1000, tick, 4),
      )
      const head = Math.max(0, derived.value.upstreamLevel - derived.value.downstreamLevel)
      const flowFactor =
        head / Math.max(1, baseline.value.upstreamLevel - baseline.value.downstreamLevel)
      return {
        ...g,
        currentOpening: cur,
        targetOpening: tgt,
        flowRate: Math.round(g.flowRate * flowFactor * (cur / Math.max(g.currentOpening, 1))),
      }
    })
  }

  return {
    active,
    locked,
    baseline,
    upstreamLevel,
    downstreamLevel,
    rainfall,
    jitterTick,
    derived,
    initBaselineFromKpi,
    applySimulation,
    resetSimulation,
    toggleLock,
    overlayGateOpening,
    overlayKpi,
    overlayGates,
  }
})
