// GateAI 调度模块 — 真实 API + Mock 降级（VITE_GATEAI_MOCK_FALLBACK 控制）
// 开发环境默认开启：后端 401/404 时自动用本地 Mock，避免设置页白屏
export const GATEAI_MOCK_FALLBACK =
  import.meta.env.VITE_GATEAI_MOCK_FALLBACK === 'true' ||
  (import.meta.env.VITE_GATEAI_MOCK_FALLBACK !== 'false' && import.meta.env.DEV)

import type {
  ModelMetricLatest,
  ModelMetricHistoryPoint,
  ModelMetricDetailRow,
  PhysicsGuardConfig,
  GateInterlockRule,
  GateInterlockLog,
  GateInterlockLogApiItem,
  ModelHealthOverviewItem,
  ModelVersionOption,
  AIHealthOverviewResponse,
} from '@/types/gateai'

import { RESERVOIR_OPTIONS } from '@/constants/settings'

import { gateaiSharedStore } from './gateaiSharedStore'

// ── 真实 API 导入 ──
import {
  getPhysicsGuard,
  updatePhysicsGuard,
  getPhysicsGuardHistory,
  rollbackPhysicsGuard as rollbackPhysicsGuardApi,
  clonePhysicsGuard as clonePhysicsGuardApi,
  getAIMetrics,
  getAIMetricsHistory,
  getAIMetricsDetail,
  getAIHealthOverview,
  getAIVersionCompare,
  getInterlockRules,
  updateInterlockRule as updateInterlockRuleApi,
  toggleInterlockRule as toggleInterlockRuleApi,
  getInterlockLogs,
  getInterlockStats,
  type AIMetricsHistoryItem,
} from './settings'
import http from './request'
import {
  normalizeInterlockRules,
  normalizeInterlockStats,
  interlockStatsCountMap,
  toGateInterlockRule,
  toInterlockUpdatePayload,
} from './interlockAdapter'

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

function extractDetailList(data: unknown): ModelMetricDetailRow[] {
  if (Array.isArray(data)) return data.map((item) => normalizeDetailRow(item as Record<string, unknown>))
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    for (const key of ['list', 'items', 'records']) {
      if (Array.isArray(obj[key])) {
        return (obj[key] as Record<string, unknown>[]).map((item) => normalizeDetailRow(item))
      }
    }
  }
  return []
}

/** 后端未部署 /settings/ai/metrics/detail 时跳过重复 404 请求 */
let metricsDetailApiAvailable: boolean | null = null

function getHttpStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object' && 'response' in e) {
    return (e as { response?: { status?: number } }).response?.status
  }
  return undefined
}

async function fetchDetailFromHistory(reservoirId: number, limit: number): Promise<ModelMetricDetailRow[]> {
  try {
    const res = await getAIMetricsHistory({ reservoir_id: reservoirId, days: 7 })
    if (res.data?.code === 0) {
      const list = extractHistoryList(res.data.data)
      return list
        .slice(-limit)
        .reverse()
        .map((item) => normalizeDetailRow(item as unknown as Record<string, unknown>))
    }
  } catch {
    /* ignore */
  }
  return []
}

export async function fetchReservoirOptions(): Promise<{ id: number; name: string }[]> {
  try {
    const overview = await fetchModelHealthOverview()
    if (overview.length > 0) {
      return overview.map((r) => ({ id: r.reservoir_id, name: r.reservoir_name }))
    }
  } catch (e) {
    if (!GATEAI_MOCK_FALLBACK) throw e
  }
  return delay(gateaiSharedStore.getReservoirs())
}

// ═══ AI 模型健康度 ═══
export async function fetchModelMetricsLatest(reservoirId: number): Promise<ModelMetricLatest> {
  try {
    const res = await getAIMetrics({ reservoir_id: reservoirId })
    if (res.data?.code === 0 && res.data.data) {
      return normalizeModelMetricsLatest(res.data.data as AIMetricsLatestRaw)
    }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(METRICS[reservoirId] ?? METRICS[1])
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

function normalizeHistoryPoint(raw: AIMetricsHistoryItem | ModelMetricHistoryPoint): ModelMetricHistoryPoint {
  const item = raw as AIMetricsHistoryItem & ModelMetricHistoryPoint
  const time = item.metric_time ?? item.time ?? ''
  return {
    time,
    prediction_score: item.prediction_score,
    decision_score: item.decision_score,
    compliance_score: item.compliance_score,
    overall_score: item.overall_score,
    health_grade: (item.health_grade as ModelMetricHistoryPoint['health_grade']) ?? undefined,
    grade_event: item.grade_event,
  }
}

export async function fetchModelMetricsHistory(
  reservoirId: number,
  days = 7,
): Promise<ModelMetricHistoryPoint[]> {
  try {
    const res = await getAIMetricsHistory({ reservoir_id: reservoirId, days })
    if (res.data?.code === 0) {
      const list = extractHistoryList(res.data.data)
      return list.map((item) => normalizeHistoryPoint(item))
    }
  } catch (e) {
    if (!GATEAI_MOCK_FALLBACK) throw e
  }
  return delay(historyFor(reservoirId))
}

export async function fetchModelMetricsDetail(
  reservoirId: number,
  params?: { hours?: number; page?: number; page_size?: number },
): Promise<ModelMetricDetailRow[]> {
  const limit = params?.page_size ?? params?.hours ?? 24

  if (metricsDetailApiAvailable === false) {
    return fetchDetailFromHistory(reservoirId, limit)
  }

  try {
    const res = await getAIMetricsDetail({
      reservoir_id: reservoirId,
      page: params?.page,
      page_size: limit,
    })
    if (res.data?.code === 0 && res.data.data) {
      const list = extractDetailList(res.data.data)
      if (list.length > 0) {
        metricsDetailApiAvailable = true
        return list
      }
    }
  } catch (e) {
    if (getHttpStatus(e) === 404) {
      metricsDetailApiAvailable = false
      if (import.meta.env.DEV) {
        console.info('[API] 指标明细接口尚未部署(404)，已改用历史趋势数据填充明细表')
      }
      return fetchDetailFromHistory(reservoirId, limit)
    }
    if (!GATEAI_MOCK_FALLBACK) throw e
  }

  const fromHistory = await fetchDetailFromHistory(reservoirId, limit)
  if (fromHistory.length > 0) return fromHistory

  if (GATEAI_MOCK_FALLBACK) return delay(detailRows(reservoirId, limit))
  return []
}

function reservoirNameById(id: number): string {
  return (
    RESERVOIR_OPTIONS.find((r) => r.value === id)?.label
    ?? gateaiSharedStore.getReservoirs().find((r) => r.id === id)?.name
    ?? `水库 #${id}`
  )
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

export async function fetchModelHealthOverview(): Promise<ModelHealthOverviewItem[]> {
  try {
    const res = await getAIHealthOverview()
    if (res.data?.code === 0 && res.data.data) {
      const list = normalizeHealthOverview(res.data.data)
      if (list.length > 0) return list
    }
  } catch (e) {
    if (!GATEAI_MOCK_FALLBACK) throw e
  }
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
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
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

// ═══ 物理防护配置 ═══
export async function fetchPhysicsGuardConfig(reservoirId: number): Promise<PhysicsGuardConfig> {
  try {
    const res = await getPhysicsGuard({ reservoir_id: reservoirId })
    if (res.data?.code === 0 && res.data.data) {
      return res.data.data as unknown as PhysicsGuardConfig
    }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
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
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  gateaiSharedStore.savePhysicsConfig(config, meta)
  return delay(null)
}

export async function fetchPhysicsGuardHistory(reservoirId: number) {
  try {
    const res = await getPhysicsGuardHistory({ reservoir_id: reservoirId })
    if (res.data?.code === 0 && Array.isArray(res.data.data)) {
      // 后端 ConfigHistoryItem → gateai PhysicsGuardHistoryItem，字段有差异用类型断言
      return res.data.data as unknown as ReturnType<typeof gateaiSharedStore.getPhysicsHistory> extends Promise<infer T> ? T : never
    }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(gateaiSharedStore.getPhysicsHistory(reservoirId))
}

export async function fetchPhysicsGuardHistoryVersions(reservoirId: number) {
  // 后端未提供独立的版本列表接口，复用 history 接口
  return fetchPhysicsGuardHistory(reservoirId)
}

export async function rollbackPhysicsGuard(reservoirId: number, historyId: number) {
  try {
    const res = await rollbackPhysicsGuardApi(historyId)
    if (res.data?.code === 0) return { new_version: (res.data.data as Record<string, unknown>)?.new_version ?? '' }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(gateaiSharedStore.rollbackPhysics(reservoirId, historyId))
}

export async function clonePhysicsGuardConfig(fromId: number, toId: number, _version?: string) {
  try {
    const res = await clonePhysicsGuardApi({ source_reservoir_id: fromId, target_reservoir_id: toId })
    if (res.data?.code === 0 && res.data.data) {
      return res.data.data as unknown as PhysicsGuardConfig
    }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(gateaiSharedStore.clonePhysics(fromId, toId))
}

// ═══ 闸门互锁 ═══
export async function fetchInterlockRules(reservoirId: number): Promise<GateInterlockRule[]> {
  try {
    const [rulesRes, statsRes] = await Promise.all([
      getInterlockRules({ reservoir_id: reservoirId }),
      getInterlockStats({ reservoir_id: reservoirId, days: 7 }),
    ])
    if (rulesRes.data?.code === 0 && rulesRes.data.data) {
      const statsMap = statsRes.data?.code === 0 && statsRes.data.data
        ? interlockStatsCountMap(normalizeInterlockStats(statsRes.data.data))
        : new Map<number, number>()
      return normalizeInterlockRules(rulesRes.data.data).map((raw) => {
        const rule = toGateInterlockRule(raw)
        rule.trigger_count_7d = statsMap.get(rule.id) ?? 0
        return rule
      })
    }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(gateaiSharedStore.getInterlockRules(reservoirId))
}

export async function toggleInterlockRule(ruleId: number, enabled: boolean): Promise<boolean> {
  try {
    const res = await toggleInterlockRuleApi(ruleId, enabled)
    if (res.data?.code === 0) {
      return res.data.data?.enabled ?? enabled
    }
    throw new Error('toggle failed')
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  gateaiSharedStore.toggleInterlockRule(ruleId, enabled)
  return delay(enabled)
}

export async function updateInterlockRule(ruleId: number, patch: Partial<GateInterlockRule>) {
  try {
    const res = await updateInterlockRuleApi(ruleId, toInterlockUpdatePayload(patch))
    if (res.data?.code === 0) return res.data
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(gateaiSharedStore.updateInterlockRule(ruleId, patch))
}

export function createInterlockRule(data: Omit<GateInterlockRule, 'id' | 'trigger_count_7d'>) {
  // 后端暂无独立的创建接口，使用 POST /v1/settings/gate-interlock/rules（如存在）
  return delay(gateaiSharedStore.createInterlockRule(data))
}

export function reorderInterlockRules(orderedIds: number[]) {
  gateaiSharedStore.reorderInterlockRules(orderedIds)
  return delay(null)
}

function parseOpening(value: string | number | undefined): number {
  const n = Number(value)
  if (Number.isNaN(n)) return 0
  return n <= 1 ? +(n * 100).toFixed(1) : +n.toFixed(1)
}

function parseLevel(value: string | number | undefined): number {
  const n = Number(value)
  return Number.isNaN(n) ? 0 : +n.toFixed(2)
}

function toDateParam(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value.slice(0, 10)
}

function normalizeInterlockLog(raw: GateInterlockLogApiItem): GateInterlockLog {
  const openingsBefore = [
    parseOpening(raw.gate1_opening_before),
    parseOpening(raw.gate2_opening_before),
    parseOpening(raw.gate3_opening_before),
  ]
  const openingsAfter = [
    parseOpening(raw.gate1_opening_after),
    parseOpening(raw.gate2_opening_after),
    parseOpening(raw.gate3_opening_after),
  ]
  const changedGates = openingsBefore
    .map((before, index) => (before !== openingsAfter[index] ? index : -1))
    .filter((index) => index >= 0)

  const ruleName = raw.rule?.rule_name ?? raw.action_detail?.triggered_rule ?? '互锁规则'
  const ruleCode = raw.rule?.rule_code ?? raw.action_detail?.triggered_rule

  return {
    id: raw.id,
    trigger_time: raw.trigger_time,
    reservoir_id: raw.reservoir_id,
    reservoir_name: reservoirNameById(raw.reservoir_id),
    rule_name: ruleName,
    rule_code: ruleCode,
    decision_id: raw.decision_id,
    upstream_level: parseLevel(raw.upstream_level),
    downstream_level: parseLevel(raw.downstream_level),
    inflow_rate: parseLevel(raw.inflow_rate),
    openings_before: openingsBefore,
    openings_after: openingsAfter,
    changed_gates: changedGates,
    reason: raw.action_detail?.reason ?? ruleName,
  }
}

export async function fetchInterlockLogs(params?: {
  reservoirId?: number
  ruleCodes?: string[]
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}): Promise<GateInterlockLog[]> {
  try {
    const res = await getInterlockLogs({
      reservoir_id: params?.reservoirId ?? 1,
      page: params?.page ?? 1,
      page_size: params?.pageSize ?? 50,
      start_time: params?.startTime ? toDateParam(params.startTime) : undefined,
      end_time: params?.endTime ? toDateParam(params.endTime) : undefined,
    })
    if (res.data?.code === 0 && res.data.data) {
      let list = (res.data.data.list ?? []).map(normalizeInterlockLog)
      if (params?.ruleCodes?.length) {
        list = list.filter((item) => params.ruleCodes!.includes(item.rule_code ?? ''))
      }
      return list
    }
  } catch (e) {
    if (!GATEAI_MOCK_FALLBACK) throw e
  }
  return delay(gateaiSharedStore.getInterlockLogs(params))
}

export async function fetchInterlockStats(
  reservoirId: number,
): Promise<{ enabled_count: number; trigger_24h: number; trigger_7d: number }> {
  try {
    const [statsRes, rulesRes] = await Promise.all([
      getInterlockStats({ reservoir_id: reservoirId, days: 7 }),
      getInterlockRules({ reservoir_id: reservoirId }),
    ])
    if (statsRes.data?.code === 0 && Array.isArray(statsRes.data.data)) {
      const stats = normalizeInterlockStats(statsRes.data.data)
      const rules = rulesRes.data?.code === 0 && rulesRes.data.data
        ? normalizeInterlockRules(rulesRes.data.data)
        : []
      return {
        enabled_count: rules.filter((r) => r.enabled).length,
        trigger_24h: stats.filter((s) => {
          if (!s.last_triggered) return false
          const t = new Date(s.last_triggered).getTime()
          return !isNaN(t) && Date.now() - t < 86400000
        }).reduce((sum, s) => sum + s.trigger_count, 0),
        trigger_7d: stats.reduce((sum, s) => sum + (s.trigger_count || 0), 0),
      }
    }
  } catch (e) { if (!GATEAI_MOCK_FALLBACK) throw e }
  return delay(gateaiSharedStore.getInterlockStats(reservoirId))
}

/** 仪表盘互锁摘要：24h 触发数 + 最近触发的规则 */
export async function fetchInterlockDashboardSummary(reservoirId: number): Promise<{
  trigger_24h: number
  recent_rule: { name: string; time: string } | null
}> {
  try {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().replace('T', ' ').slice(0, 19)
    const [statsRes, logsRes] = await Promise.allSettled([
      getInterlockStats({ reservoir_id: reservoirId, days: 7 }),
      getInterlockLogs({
        reservoir_id: reservoirId,
        page: 1,
        page_size: 1,
        start_time: weekAgo.slice(0, 10),
        end_time: now.slice(0, 10),
      }),
    ])

    let trigger_24h = 0
    if (statsRes.status === 'fulfilled' && statsRes.value.data?.code === 0 && Array.isArray(statsRes.value.data.data)) {
      const stats = normalizeInterlockStats(statsRes.value.data.data)
      trigger_24h = stats.filter((s) => {
        if (!s.last_triggered) return false
        const t = new Date(s.last_triggered).getTime()
        return !isNaN(t) && Date.now() - t < 86400000
      }).reduce((sum, s) => sum + s.trigger_count, 0)
    }

    let recent_rule: { name: string; time: string } | null = null
    if (logsRes.status === 'fulfilled' && logsRes.value.data?.code === 0 && logsRes.value.data.data) {
      const list = (logsRes.value.data.data.list ?? []).map(normalizeInterlockLog)
      if (list.length > 0) {
        recent_rule = {
          name: list[0].rule_name,
          time: list[0].trigger_time,
        }
      }
    }

    return { trigger_24h, recent_rule }
  } catch (e) {
    if (!GATEAI_MOCK_FALLBACK) throw e
  }

  const stats = gateaiSharedStore.getInterlockStats(reservoirId)
  const logs = gateaiSharedStore.getInterlockLogs({ reservoirId })
  return {
    trigger_24h: stats.trigger_24h ?? 0,
    recent_rule:
      logs && logs.length > 0
        ? {
            name: logs[0].rule_name ?? '—',
            time: logs[0].trigger_time ?? new Date().toISOString(),
          }
        : null,
  }
}

export function fetchEdgeSyncStatus(edgeNodeId: number) {
  // 边缘同步状态暂无后端接口，使用 Mock
  return delay(gateaiSharedStore.getEdgeSyncStatus(edgeNodeId))
}
