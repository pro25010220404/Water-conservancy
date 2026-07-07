// GateAI 调度模块 — AI 健康度走真实 API，物理防护/闸门互锁纯 Mock

import type {
  ModelMetricLatest,
  ModelMetricHistoryPoint,
  ModelMetricDetailRow,
  PhysicsGuardConfig,
  GateInterlockRule,
  ModelHealthOverviewItem,
  ModelVersionOption,
  AIHealthOverviewResponse,
} from '@/types/gateai'

import { RESERVOIR_OPTIONS } from '@/constants/settings'
import { gateaiSharedStore } from './gateaiSharedStore'

// AI 健康度 + 物理防护保存 + 互锁日志 — 真实 API
import {
  getAIMetrics,
  getAIMetricsHistory,
  getAIMetricsDetail,
  getAIHealthOverview,
  getAIVersionCompare,
  updatePhysicsGuard,
  getInterlockLogs,
  type AIMetricsHistoryItem,
} from './settings'
import { toGateInterlockLog, type ApiInterlockLog } from './interlockAdapter'
import type { GateInterlockLog } from '@/types/gateai'

const METRICS: Record<number, ModelMetricLatest> = {
  1: {
    overall_score: 0.82,
    health_grade: 'A',

    water_level_mae_24h: 0.042,
    safety_override_rate: 0.08,
    l3_auto_rate: 0.71,

    prediction_score: 0.85,
    decision_score: 0.8,
    compliance_score: 0.81,

    metric_time: new Date().toISOString(),
  },

  2: {
    overall_score: 0.76,
    health_grade: 'B',

    water_level_mae_24h: 0.055,
    safety_override_rate: 0.12,
    l3_auto_rate: 0.65,

    prediction_score: 0.78,
    decision_score: 0.74,
    compliance_score: 0.75,

    metric_time: new Date().toISOString(),
  },

  3: {
    overall_score: 0.88,
    health_grade: 'A',

    water_level_mae_24h: 0.038,
    safety_override_rate: 0.06,
    l3_auto_rate: 0.74,

    prediction_score: 0.87,
    decision_score: 0.82,
    compliance_score: 0.84,

    metric_time: new Date().toISOString(),
  },

  4: {
    overall_score: 0.65,
    health_grade: 'B',

    water_level_mae_24h: 0.062,
    safety_override_rate: 0.15,
    l3_auto_rate: 0.58,

    prediction_score: 0.7,
    decision_score: 0.66,
    compliance_score: 0.68,

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

  const base = version.includes('5.1') ? 1 : version.includes('5.0') ? 0.96 : 0.9

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

export function fetchReservoirOptions(): Promise<{ id: number; name: string }[]> {
  return fetchModelHealthOverview().then((list) =>
    list.length > 0
      ? list.map((r) => ({ id: r.reservoir_id, name: r.reservoir_name }))
      : gateaiSharedStore.getReservoirs(),
  )
}

type AIMetricsLatestRaw = {
  overall_score?: number
  health_grade?: string
  water_level_mae_24h?: number
  safety_override_rate?: number
  l3_auto_rate?: number
  prediction_score?: number
  decision_score?: number
  compliance_score?: number
  metric_time?: string
  decision_level_dist?: Partial<Record<'L1' | 'L2' | 'L3' | 'OVERRIDE', number>>
}

function reservoirNameById(id: number): string {
  return (
    RESERVOIR_OPTIONS.find((r) => r.value === id)?.label
    ?? gateaiSharedStore.getReservoirs().find((r) => r.id === id)?.name
    ?? `水库 #${id}`
  )
}

function normalizeModelMetricsLatest(raw: AIMetricsLatestRaw): ModelMetricLatest {
  const dist = raw.decision_level_dist
  return {
    overall_score: raw.overall_score ?? 0,
    health_grade: (raw.health_grade ?? 'C') as ModelMetricLatest['health_grade'],
    water_level_mae_24h: raw.water_level_mae_24h ?? 0,
    safety_override_rate: raw.safety_override_rate ?? 0,
    l3_auto_rate: raw.l3_auto_rate ?? dist?.L3 ?? 0,
    prediction_score: raw.prediction_score ?? 0,
    decision_score: raw.decision_score ?? 0,
    compliance_score: raw.compliance_score ?? 0,
    metric_time: raw.metric_time ?? '',
  }
}

function normalizeHistoryPoint(raw: AIMetricsHistoryItem | ModelMetricHistoryPoint): ModelMetricHistoryPoint {
  const item = raw as AIMetricsHistoryItem & ModelMetricHistoryPoint
  return {
    time: item.metric_time ?? item.time ?? '',
    prediction_score: item.prediction_score,
    decision_score: item.decision_score,
    compliance_score: item.compliance_score,
    overall_score: item.overall_score,
    health_grade: (item.health_grade as ModelMetricHistoryPoint['health_grade']) ?? undefined,
    grade_event: item.grade_event,
  }
}

function extractHistoryList(data: unknown): AIMetricsHistoryItem[] {
  if (Array.isArray(data)) return data as AIMetricsHistoryItem[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of ['list', 'items', 'records', 'history']) {
      if (Array.isArray(obj[key])) return obj[key] as AIMetricsHistoryItem[]
    }
  }
  return []
}

function normalizeDetailRow(raw: Record<string, unknown>): ModelMetricDetailRow {
  return {
    metric_time: String(raw.metric_time ?? raw.time ?? ''),
    water_level_mae_24h: Number(raw.water_level_mae_24h ?? raw.water_level_mae ?? 0),
    safety_override_rate: Number(raw.safety_override_rate ?? 0),
    physics_correction_rate: Number(raw.physics_correction_rate ?? 0),
    gate_limit_touch_rate: Number(raw.gate_limit_touch_rate ?? 0),
    overall_score: Number(raw.overall_score ?? 0),
    health_grade: String(raw.health_grade ?? 'C') as ModelMetricDetailRow['health_grade'],
  }
}

function normalizeHealthOverview(data: unknown): ModelHealthOverviewItem[] {
  if (Array.isArray(data)) {
    return data.map((item) => {
      const row = item as ModelHealthOverviewItem
      return {
        ...row,
        reservoir_name: row.reservoir_name || reservoirNameById(row.reservoir_id),
      }
    })
  }
  if (data && typeof data === 'object' && Array.isArray((data as AIHealthOverviewResponse).reservoirs)) {
    return (data as AIHealthOverviewResponse).reservoirs.map((item) => ({
      reservoir_id: item.reservoir_id,
      reservoir_name: item.reservoir_name || reservoirNameById(item.reservoir_id),
      overall_score: item.overall_score,
      health_grade: item.health_grade as ModelHealthOverviewItem['health_grade'],
      metric_time: item.metric_time,
    }))
  }
  return []
}

/** 明细接口未部署时跳过重复 404，改用历史趋势数据 */
let metricsDetailApiAvailable: boolean | null = null

function getHttpStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { status?: number } }).response?.status
  }
  return undefined
}

async function detailFromHistory(reservoirId: number, limit: number): Promise<ModelMetricDetailRow[]> {
  try {
    const res = await getAIMetricsHistory({ reservoir_id: reservoirId, days: 7 })
    if (res.data?.code === 0) {
      return extractHistoryList(res.data.data)
        .slice(-limit)
        .reverse()
        .map((item) => normalizeDetailRow(item as unknown as Record<string, unknown>))
    }
  } catch {
    /* ignore */
  }
  return []
}

// ═══ AI 模型健康度 ═══
export async function fetchModelMetricsLatest(reservoirId: number): Promise<ModelMetricLatest> {
  try {
    const res = await getAIMetrics({ reservoir_id: reservoirId })
    if (res.data?.code === 0 && res.data.data) {
      return normalizeModelMetricsLatest(res.data.data as AIMetricsLatestRaw)
    }
  } catch { /* 降级 Mock */ }
  return delay(METRICS[reservoirId] ?? METRICS[1])
}

export async function fetchModelMetricsHistory(
  reservoirId: number,
  days = 7,
): Promise<ModelMetricHistoryPoint[]> {
  try {
    const res = await getAIMetricsHistory({ reservoir_id: reservoirId, days })
    if (res.data?.code === 0) {
      const list = extractHistoryList(res.data.data)
      if (list.length > 0) return list.map((item) => normalizeHistoryPoint(item))
    }
  } catch { /* 降级 Mock */ }
  return delay(historyFor(reservoirId))
}

export async function fetchModelMetricsDetail(
  reservoirId: number,
  params?: { hours?: number; page?: number; page_size?: number },
): Promise<ModelMetricDetailRow[]> {
  const limit = params?.page_size ?? params?.hours ?? 24

  if (metricsDetailApiAvailable === false) {
    return detailFromHistory(reservoirId, limit)
  }

  try {
    const res = await getAIMetricsDetail({
      reservoir_id: reservoirId,
      page: params?.page,
      page_size: limit,
    })
    if (res.data?.code === 0 && res.data.data) {
      const raw = res.data.data
      const list = Array.isArray(raw)
        ? raw.map((item) => normalizeDetailRow(item as unknown as Record<string, unknown>))
        : Array.isArray((raw as { list?: unknown[] }).list)
          ? ((raw as { list: unknown[] }).list).map((item) =>
              normalizeDetailRow(item as Record<string, unknown>),
            )
          : []
      if (list.length > 0) {
        metricsDetailApiAvailable = true
        return list
      }
    }
  } catch (e) {
    if (getHttpStatus(e) === 404) {
      metricsDetailApiAvailable = false
      return detailFromHistory(reservoirId, limit)
    }
  }

  const fromHistory = await detailFromHistory(reservoirId, limit)
  if (fromHistory.length > 0) return fromHistory
  return delay(detailRows(reservoirId, limit))
}

export async function fetchModelHealthOverview(): Promise<ModelHealthOverviewItem[]> {
  try {
    const res = await getAIHealthOverview()
    if (res.data?.code === 0 && res.data.data) {
      const list = normalizeHealthOverview(res.data.data)
      if (list.length > 0) return list
    }
  } catch { /* 降级 Mock */ }
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

export async function fetchModelVersionOptions(reservoirId: number) {
  // 版本列表暂无后端接口，使用 Mock
  const opts = (VERSION_CATALOG[reservoirId] ?? VERSION_CATALOG[1]).map((v) => ({
    ...v,
    scores: versionScores(reservoirId, v.version),
  }))
  return delay(opts)
}

export async function fetchModelCompare(
  reservoirId: number,
  currentVer?: string,
  previousVer?: string,
) {
  try {
    if (currentVer && previousVer) {
      const res = await getAIVersionCompare({ reservoir_id: reservoirId, version1: currentVer, version2: previousVer })
      if (res.data?.code === 0 && res.data.data) return res.data.data as unknown as { current: { version: string; source: string; scores: Record<string, number> }; previous: { version: string; source: string; scores: Record<string, number> } }
    }
  } catch { /* 降级 Mock */ }
  const opts = VERSION_CATALOG[reservoirId] ?? VERSION_CATALOG[1]
  const cur = currentVer ?? opts[0].version
  const prev = previousVer ?? opts[1]?.version ?? opts[0].version
  const curOpt = opts.find((o) => o.version === cur) ?? opts[0]
  const prevOpt = opts.find((o) => o.version === prev) ?? opts[1] ?? opts[0]
  return delay({
    current: { version: curOpt.version, source: curOpt.source, scores: versionScores(reservoirId, curOpt.version) },
    previous: { version: prevOpt.version, source: prevOpt.source, scores: versionScores(reservoirId, prevOpt.version) },
  })
}

// ═══ 物理防护配置（后端不会部署，纯 Mock）═══
export async function fetchPhysicsGuardConfig(reservoirId: number): Promise<PhysicsGuardConfig> {
  return delay(gateaiSharedStore.getPhysicsConfig(reservoirId))
}

export async function savePhysicsGuardConfig(
  config: PhysicsGuardConfig,
  meta?: { description?: string; changed_by_name?: string },
): Promise<null> {
  try {
    const id = (config as unknown as Record<string, unknown>).id as number
    if (id) {
      const res = await updatePhysicsGuard(id, config as unknown as Record<string, unknown>)
      if (res.data?.code === 0) return null
    }
  } catch { /* 降级 Mock */ }
  gateaiSharedStore.savePhysicsConfig(config, meta)
  return delay(null)
}

export async function fetchPhysicsGuardHistory(reservoirId: number) {
  return delay(gateaiSharedStore.getPhysicsHistory(reservoirId))
}

export async function fetchPhysicsGuardHistoryVersions(reservoirId: number) {
  return fetchPhysicsGuardHistory(reservoirId)
}

export async function rollbackPhysicsGuard(reservoirId: number, historyId: number) {
  return delay(gateaiSharedStore.rollbackPhysics(reservoirId, historyId))
}

export async function clonePhysicsGuardConfig(fromId: number, toId: number, _version?: string) {
  return delay(gateaiSharedStore.clonePhysics(fromId, toId))
}

// ═══ 闸门互锁（后端不会部署，纯 Mock）═══
export async function fetchInterlockRules(reservoirId: number): Promise<GateInterlockRule[]> {
  return delay(gateaiSharedStore.getInterlockRules(reservoirId))
}

export async function toggleInterlockRule(ruleId: number, enabled: boolean): Promise<null> {
  gateaiSharedStore.toggleInterlockRule(ruleId, enabled)
  return delay(null)
}

export async function updateInterlockRule(ruleId: number, patch: Partial<GateInterlockRule>) {
  return delay(gateaiSharedStore.updateInterlockRule(ruleId, patch))
}

export function createInterlockRule(data: Omit<GateInterlockRule, 'id' | 'trigger_count_7d'>) {
  return delay(gateaiSharedStore.createInterlockRule(data))
}

export function reorderInterlockRules(orderedIds: number[]) {
  gateaiSharedStore.reorderInterlockRules(orderedIds)
  return delay(null)
}

export async function fetchInterlockLogs(params?: {
  reservoirId?: number
  ruleCodes?: string[]
  startTime?: string
  endTime?: string
  pageSize?: number
}): Promise<GateInterlockLog[]> {
  try {
    const res = await getInterlockLogs({
      reservoir_id: params?.reservoirId ?? 1,
      page: 1,
      page_size: params?.pageSize ?? 100,
      start_time: params?.startTime,
      end_time: params?.endTime,
    })
    if (res.data?.code === 0 && res.data.data) {
      const raw = res.data.data
      const list: ApiInterlockLog[] = Array.isArray(raw)
        ? (raw as ApiInterlockLog[])
        : Array.isArray((raw as { list?: unknown[] }).list)
          ? ((raw as { list: ApiInterlockLog[] }).list)
          : []
      return list.map(toGateInterlockLog)
    }
  } catch {
    /* 降级 Mock */
  }
  return delay(gateaiSharedStore.getInterlockLogs(params))
}

export async function fetchInterlockStats(
  reservoirId: number,
): Promise<{ enabled_count: number; trigger_24h: number; trigger_7d: number }> {
  return delay(gateaiSharedStore.getInterlockStats(reservoirId))
}

/** 仪表盘互锁摘要：24h 触发数 + 最近触发的规则 */
export async function fetchInterlockDashboardSummary(reservoirId: number): Promise<{
  trigger_24h: number
  recent_rule: { name: string; time: string } | null
}> {
  const stats = gateaiSharedStore.getInterlockStats(reservoirId)
  const logs = gateaiSharedStore.getInterlockLogs({ reservoirId })
  return {
    trigger_24h: stats.trigger_24h ?? 0,
    recent_rule: logs?.length > 0
      ? { name: logs[0].rule_name ?? '—', time: logs[0].trigger_time ?? new Date().toISOString() }
      : null,
  }
}

export function fetchEdgeSyncStatus(edgeNodeId: number) {
  // 边缘同步状态暂无后端接口，使用 Mock
  return delay(gateaiSharedStore.getEdgeSyncStatus(edgeNodeId))
}
