// GateAI 调度模块 — Mock API（后端就绪后替换）

import type {

  ModelMetricLatest, ModelMetricHistoryPoint, ModelMetricDetailRow,

  PhysicsGuardConfig, GateInterlockRule,

  ModelHealthOverviewItem, ModelVersionOption,

} from '@/types/gateai'

import { gateaiSharedStore } from './gateaiSharedStore'



const METRICS: Record<number, ModelMetricLatest> = {

  1: {

    overall_score: 0.82, health_grade: 'A',

    water_level_mae_24h: 0.042, safety_override_rate: 0.08, l3_auto_rate: 0.71,

    prediction_score: 0.85, decision_score: 0.80, compliance_score: 0.81,

    metric_time: new Date().toISOString(),

  },

  2: {

    overall_score: 0.76, health_grade: 'B',

    water_level_mae_24h: 0.055, safety_override_rate: 0.12, l3_auto_rate: 0.65,

    prediction_score: 0.78, decision_score: 0.74, compliance_score: 0.75,

    metric_time: new Date().toISOString(),

  },

  3: {

    overall_score: 0.88, health_grade: 'A',

    water_level_mae_24h: 0.038, safety_override_rate: 0.06, l3_auto_rate: 0.74,

    prediction_score: 0.87, decision_score: 0.82, compliance_score: 0.84,

    metric_time: new Date().toISOString(),

  },

  4: {

    overall_score: 0.65, health_grade: 'B',

    water_level_mae_24h: 0.062, safety_override_rate: 0.15, l3_auto_rate: 0.58,

    prediction_score: 0.70, decision_score: 0.66, compliance_score: 0.68,

    metric_time: new Date().toISOString(),

  },

}



const VERSION_CATALOG: Record<number, ModelVersionOption[]> = {

  1: [

    { version: 'Physics-LSTM v5.1', source: '边缘实时', scores: {} },

    { version: 'Physics-LSTM v5.0', source: '数字孪生仿真', scores: {} },

    { version: 'Physics-LSTM v4.9', source: '历史归档', scores: {} },

  ],

}



function versionScores(reservoirId: number, version: string): Record<string, number> {

  const m = METRICS[reservoirId] ?? METRICS[1]

  const base = version.includes('5.1') ? 1 : version.includes('5.0') ? 0.96 : 0.90

  return {

    预测准确性: +(m.prediction_score * base).toFixed(2),

    决策可靠性: +(m.decision_score * base).toFixed(2),

    物理合规性: +(m.compliance_score * base).toFixed(2),

    安全覆盖率: +((1 - m.safety_override_rate) * base).toFixed(2),

    决策自主率: +(m.l3_auto_rate * base).toFixed(2),

  }

}



function historyFor(reservoirId: number): ModelMetricHistoryPoint[] {

  const base = METRICS[reservoirId]?.overall_score ?? 0.75

  return Array.from({ length: 7 }, (_, i) => {

    const d = new Date()

    d.setDate(d.getDate() - (6 - i))

    const jitter = (i - 3) * 0.01

    const point: ModelMetricHistoryPoint = {

      time: d.toISOString().slice(0, 10),

      prediction_score: +(base + 0.03 + jitter).toFixed(2),

      decision_score: +(base - 0.02 + jitter).toFixed(2),

      compliance_score: +(base + jitter * 0.5).toFixed(2),

      overall_score: +(base + jitter * 0.8).toFixed(2),

    }

    if (i === 4) point.grade_event = { from: 'B', to: 'A', label: '综合评分回升至 A 级' }

    if (i === 2) point.grade_event = { from: 'A', to: 'B', label: '安全覆盖率下降，降至 B 级' }

    return point

  })

}



function detailRows(reservoirId: number, hours = 24): ModelMetricDetailRow[] {

  const m = METRICS[reservoirId] ?? METRICS[1]

  const count = Math.min(Math.max(hours, 1), 48)

  return Array.from({ length: count }, (_, i) => ({

    metric_time: new Date(Date.now() - i * 3600000).toISOString().replace('T', ' ').slice(0, 19),

    water_level_mae_24h: +(m.water_level_mae_24h + i * 0.002).toFixed(3),

    safety_override_rate: +(m.safety_override_rate + i * 0.005).toFixed(3),

    physics_correction_rate: +(0.05 + i * 0.008).toFixed(3),

    gate_limit_touch_rate: +(0.02 + i * 0.003).toFixed(3),

    overall_score: +(m.overall_score - i * 0.008).toFixed(2),

    health_grade: m.health_grade,

  }))

}



function delay<T>(data: T, ms = 150): Promise<T> {

  return new Promise((r) => setTimeout(() => r(data), ms))

}



export function fetchReservoirOptions() {

  return delay(gateaiSharedStore.getReservoirs())

}



export function fetchModelMetricsLatest(reservoirId: number) {

  return delay(METRICS[reservoirId] ?? METRICS[1])

}



export function fetchModelMetricsHistory(reservoirId: number) {

  return delay(historyFor(reservoirId))

}



export function fetchModelMetricsDetail(reservoirId: number, params?: { hours?: number }) {

  return delay(detailRows(reservoirId, params?.hours ?? 24))

}



export function fetchModelHealthOverview() {

  const list: ModelHealthOverviewItem[] = gateaiSharedStore.getReservoirs().map((r) => {

    const m = METRICS[r.id] ?? METRICS[1]

    return {

      reservoir_id: r.id,

      reservoir_name: r.name,

      overall_score: m.overall_score,

      health_grade: m.health_grade,

      metric_time: m.metric_time,

    }

  })

  return delay(list)

}



export function fetchModelVersionOptions(reservoirId: number) {

  const opts = (VERSION_CATALOG[reservoirId] ?? VERSION_CATALOG[1]).map((v) => ({

    ...v,

    scores: versionScores(reservoirId, v.version),

  }))

  return delay(opts)

}



export function fetchModelCompare(reservoirId: number, currentVer?: string, previousVer?: string) {

  const opts = (VERSION_CATALOG[reservoirId] ?? VERSION_CATALOG[1])

  const cur = currentVer ?? opts[0].version

  const prev = previousVer ?? opts[1]?.version ?? opts[0].version

  const curOpt = opts.find((o) => o.version === cur) ?? opts[0]

  const prevOpt = opts.find((o) => o.version === prev) ?? opts[1] ?? opts[0]

  return delay({

    current: { version: curOpt.version, source: curOpt.source, scores: versionScores(reservoirId, curOpt.version) },

    previous: { version: prevOpt.version, source: prevOpt.source, scores: versionScores(reservoirId, prevOpt.version) },

  })

}



export function fetchPhysicsGuardConfig(reservoirId: number) {

  return delay(gateaiSharedStore.getPhysicsConfig(reservoirId))

}



export function savePhysicsGuardConfig(config: PhysicsGuardConfig, meta?: { description?: string; changed_by_name?: string }) {

  gateaiSharedStore.savePhysicsConfig(config, meta)

  return delay(null)

}



export function fetchPhysicsGuardHistory(reservoirId: number) {

  return delay(gateaiSharedStore.getPhysicsHistory(reservoirId))

}



export function fetchPhysicsGuardHistoryVersions(reservoirId: number) {

  return delay(gateaiSharedStore.getPhysicsHistoryVersions(reservoirId))

}



export function rollbackPhysicsGuard(reservoirId: number, historyId: number) {

  return delay(gateaiSharedStore.rollbackPhysics(reservoirId, historyId))

}



export function clonePhysicsGuardConfig(fromId: number, toId: number, version?: string) {

  return delay(gateaiSharedStore.clonePhysics(fromId, toId, version))

}



export function fetchInterlockRules(reservoirId: number) {

  return delay(gateaiSharedStore.getInterlockRules(reservoirId))

}



export function toggleInterlockRule(ruleId: number, enabled: boolean) {

  gateaiSharedStore.toggleInterlockRule(ruleId, enabled)

  return delay(null)

}



export function updateInterlockRule(ruleId: number, patch: Partial<GateInterlockRule>) {

  return delay(gateaiSharedStore.updateInterlockRule(ruleId, patch))

}



export function createInterlockRule(data: Omit<GateInterlockRule, 'id' | 'trigger_count_7d'>) {

  return delay(gateaiSharedStore.createInterlockRule(data))

}



export function reorderInterlockRules(orderedIds: number[]) {

  gateaiSharedStore.reorderInterlockRules(orderedIds)

  return delay(null)

}



export function fetchInterlockLogs(params?: { reservoirId?: number; ruleCodes?: string[]; startTime?: string; endTime?: string }) {

  return delay(gateaiSharedStore.getInterlockLogs(params))

}



export function fetchInterlockStats(reservoirId: number) {

  return delay(gateaiSharedStore.getInterlockStats(reservoirId))

}



export function fetchEdgeSyncStatus(edgeNodeId: number) {

  return delay(gateaiSharedStore.getEdgeSyncStatus(edgeNodeId))

}


