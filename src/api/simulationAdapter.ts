// ============================================================
// 数字孪生 — 场景 / 故障复盘 API 字段映射
// ============================================================
import { getScenePreset } from '@/constants/simulation'
import type {
  FaultConclusion,
  FaultReview,
  FaultTimelineEvent,
  SimulationParams,
  SimulationScene,
  SimulationScenarioItem,
} from '@/types/simulation'

export interface BackendScenarioItem {
  id: number
  name: string
  type: string
  description?: string | null
  status: string
  model_id?: number | null
  scenario_config?: Record<string, unknown> | null
  duration?: number
  speed?: number
  created_by?: number
  created_at?: string
  updated_at?: string
  usage_count?: number
}

export function mapBackendScenario(raw: BackendScenarioItem): SimulationScenarioItem {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    description: raw.description ?? null,
    status: raw.status,
    model_id: raw.model_id ?? null,
    duration: raw.duration,
    speed: raw.speed,
    scenario_config: raw.scenario_config ?? null,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    usage_count: raw.usage_count,
  }
}

// ---------- 9.6 / 9.7 故障复盘 ----------

export interface BackendIncidentItem {
  id: number
  incident_name: string
  severity: string
  equipment_id?: number
  occurred_at: string
  resolved_at?: string | null
  duration?: number
  root_cause?: string | null
  description?: string | null
  raw_data?: Record<string, unknown> | null
  scenario_config?: Record<string, unknown> | null
}

const SEVERITY_LABEL: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

function formatIncidentTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatDurationSec(sec?: number): string {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

function inferSceneFromIncident(raw: BackendIncidentItem): SimulationScene {
  const name = (raw.incident_name ?? '').toLowerCase()
  if (name.includes('洪水') || name.includes('暴雨') || name.includes('汛')) return 'flood'
  if (name.includes('枯水') || name.includes('生态') || name.includes('缺水')) return 'dry'
  if (raw.severity === 'critical' || raw.severity === 'high') return 'flood'
  if (raw.severity === 'low') return 'dry'
  return 'custom'
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

function buildConclusion(raw: BackendIncidentItem): FaultConclusion | null {
  if (!raw.root_cause) return null
  return {
    rootCause: raw.root_cause,
    improvements: (raw.description as string) || '',
    responsibleDept: '',
    reviewedBy: '',
    reviewedAt: raw.resolved_at ?? raw.occurred_at,
  }
}

export function buildIncidentTimeline(raw: BackendIncidentItem): FaultTimelineEvent[] {
  const fromRaw = raw.raw_data?.timeline
  if (Array.isArray(fromRaw) && fromRaw.length) {
    return fromRaw.map((item) => {
      const row = item as Record<string, unknown>
      return {
        time: String(row.time ?? row.timestamp ?? '—'),
        event: String(row.event ?? row.description ?? row.msg ?? ''),
      }
    })
  }

  const events: FaultTimelineEvent[] = []
  if (raw.occurred_at) {
    events.push({
      time: formatIncidentTime(raw.occurred_at),
      event: `故障发生：${raw.incident_name}`,
    })
  }
  if (raw.duration) {
    events.push({
      time: formatIncidentTime(raw.occurred_at),
      event: `持续 ${formatDurationSec(raw.duration)}`,
    })
  }
  if (raw.resolved_at) {
    events.push({
      time: formatIncidentTime(raw.resolved_at),
      event: '故障恢复',
    })
  }
  if (raw.root_cause) {
    events.push({
      time: formatIncidentTime(raw.resolved_at ?? raw.occurred_at),
      event: `根因分析：${raw.root_cause}`,
    })
  }
  return events.length ? events : [{ time: '—', event: raw.incident_name || '故障记录' }]
}

export function mapBackendIncident(raw: BackendIncidentItem): FaultReview {
  const reviewed = Boolean(raw.root_cause)
  const severityLabel = SEVERITY_LABEL[raw.severity] ?? raw.severity
  const equipmentLabel = raw.equipment_id ? `设备 #${raw.equipment_id}` : '关联设备'
  return {
    id: raw.id,
    alarmId: raw.equipment_id ?? 0,
    faultType: raw.incident_name,
    impactScope: `${equipmentLabel} · ${severityLabel}级`,
    reviewed,
    status: reviewed ? 'reviewed' : 'pending',
    createdAt: raw.occurred_at,
    timeline: buildIncidentTimeline(raw),
    conclusion: buildConclusion(raw),
  }
}

/** 从故障 raw_data / scenario_config 提取仿真初始参数 */
export function incidentToSimulationParams(raw: BackendIncidentItem): SimulationParams {
  const scene = inferSceneFromIncident(raw)
  const preset = getScenePreset(scene)
  const data = {
    ...(raw.scenario_config ?? {}),
    ...(raw.raw_data ?? {}),
  }
  const durationRaw = data.duration ?? data.duration_sec ?? data.durationMin
  let durationMin = preset.durationMin
  if (durationRaw != null) {
    const d = num(durationRaw, preset.durationMin)
    durationMin = d > 180 ? Math.round(d / 60) : Math.round(d)
  } else if (raw.duration) {
    durationMin = Math.max(10, Math.round(raw.duration / 60))
  }

  return {
    scene,
    initialLevel: num(
      data.initial_water_level ?? data.initialLevel ?? data.upstream_level,
      preset.initialLevel,
    ),
    inflowRate: num(data.inflow_rate ?? data.inflowRate ?? data.inflow, preset.inflowRate),
    durationMin: Math.min(240, Math.max(10, durationMin)),
  }
}

export function toBackendIncidentQuery(params: {
  pageNum: number
  pageSize: number
  type?: string
  startTime?: string
  endTime?: string
}) {
  return {
    page: params.pageNum,
    page_size: params.pageSize,
    severity: params.type || undefined,
    start_time: params.startTime,
    end_time: params.endTime,
    reservoir_id: 1,
  }
}
