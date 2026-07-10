// ============================================================
// 水情虚拟仿真 — 简化联动计算（非 AI 训练）
// ============================================================

export interface SimulationBaseline {
  upstreamLevel: number
  downstreamLevel: number
  inflowRate: number
  outflowRate: number
  gateOpening: number
}

export interface SimulationInput {
  upstreamLevel: number
  rainfall: number
  baseline: SimulationBaseline
}

export interface SimulationDerived {
  upstreamLevel: number
  downstreamLevel: number
  inflowRate: number
  outflowRate: number
  aggregateOpening: number
  gateScale: number
  waterTrend: 'up' | 'down' | 'stable'
}

export function computeSimulationDerived(input: SimulationInput): SimulationDerived {
  const { upstreamLevel, rainfall, baseline } = input
  const upDelta = upstreamLevel - baseline.upstreamLevel

  const inflowRate = Math.max(
    0,
    Math.round(baseline.inflowRate + rainfall * 12 + upDelta * 85),
  )

  const downstreamLevel = Math.max(
    baseline.downstreamLevel - 5,
    +(baseline.downstreamLevel + upDelta * 0.12).toFixed(2),
  )

  const head = Math.max(1, upstreamLevel - downstreamLevel)
  const baseHead = Math.max(1, baseline.upstreamLevel - baseline.downstreamLevel)
  const headRatio = head / baseHead

  const outflowTarget = Math.round(baseline.outflowRate * headRatio * (0.92 + rainfall * 0.002))
  const outflowRate = Math.max(0, outflowTarget)

  const imbalance = inflowRate - outflowRate
  let waterTrend: SimulationDerived['waterTrend'] = 'stable'
  if (imbalance > 80) waterTrend = 'up'
  else if (imbalance < -80) waterTrend = 'down'

  const aggregateOpening = Math.min(
    100,
    Math.max(0, +(baseline.gateOpening * (outflowRate / Math.max(baseline.outflowRate, 1))).toFixed(1)),
  )

  const gateScale = aggregateOpening / Math.max(baseline.gateOpening, 1)

  return {
    upstreamLevel,
    downstreamLevel,
    inflowRate,
    outflowRate,
    aggregateOpening,
    gateScale,
    waterTrend,
  }
}

export function scaleGateOpening(opening: number, scale: number): number {
  return Math.min(100, Math.max(0, +(opening * scale).toFixed(1)))
}
