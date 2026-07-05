// GateAI 调度模块 — 前端类型（对照改动方案文档）

export type HealthGrade = 'S' | 'A' | 'B' | 'C' | 'D'

export interface ModelMetricLatest {
  overall_score: number
  health_grade: HealthGrade
  water_level_mae_24h: number
  safety_override_rate: number
  l3_auto_rate: number
  prediction_score: number
  decision_score: number
  compliance_score: number
  metric_time: string
}

export interface ModelMetricHistoryPoint {
  time: string
  prediction_score: number
  decision_score: number
  compliance_score: number
  overall_score: number
  grade_event?: { from: HealthGrade; to: HealthGrade; label: string }
}

export interface ModelMetricDetailRow {
  metric_time: string
  water_level_mae_24h: number
  safety_override_rate: number
  physics_correction_rate: number
  gate_limit_touch_rate: number
  overall_score: number
  health_grade: HealthGrade
}

export interface PhysicsGuardConfig {
  id: number
  reservoir_id: number
  config_version: string
  upstream_danger: number
  upstream_emergency: number
  upstream_warning: number
  upstream_min: number
  ideal_min: number
  ideal_max: number
  downstream_danger: number
  downstream_max: number
  downstream_min: number
  eco_flow_min: number
  max_level_change_per_hour: number
  shadow_danger_offset: number
  deadband_percent: number
  max_rate_per_hour: number
  fusion_l3_confidence: number
  fusion_l3_risk: number
  fusion_l2_confidence: number
  fusion_l2_risk: number
  gate_max_discharge: number[]
  reservoir_area?: number
  shadow_lookahead_steps?: number
  description?: string
}

export interface GateInterlockRule {
  id: number
  reservoir_id: number | null
  rule_code: string
  rule_name: string
  description: string
  enabled: boolean
  priority: number
  trigger_label: string
  action_label: string
  trigger_count_7d: number
}

export interface GateInterlockLog {
  id: number
  trigger_time: string
  reservoir_id?: number
  reservoir_name: string
  rule_name: string
  rule_code?: string
  decision_id?: number
  upstream_level: number
  downstream_level: number
  openings_before: number[]
  openings_after: number[]
  changed_gates?: number[]
  reason: string
}

export interface ModelHealthOverviewItem {
  reservoir_id: number
  reservoir_name: string
  overall_score: number
  health_grade: HealthGrade
  metric_time: string
}

export interface ModelVersionOption {
  version: string
  source: string
  scores: Record<string, number>
}

export interface ModelMetricCompare {
  current: { version: string; source: string; scores: Record<string, number> }
  previous: { version: string; source: string; scores: Record<string, number> }
}

export interface PhysicsGuardHistoryChange {
  field: string
  label: string
  before: string | number
  after: string | number
}

export interface PhysicsGuardHistoryItem {
  id: number
  reservoir_id: number
  config_version: string
  changed_at: string
  changed_by_name: string
  description: string
  is_active: boolean
  changes: PhysicsGuardHistoryChange[]
}
