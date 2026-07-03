// ============================================================
// 调度决策 — TypeScript 类型定义
// 字段严格对齐《总接口文档》§4.1-4.9
// ============================================================

// ---------- 决策模式 / 风险等级 ----------
export type DecisionMode = 'L1' | 'L2' | 'L3'
export type RiskRank = 1 | 2 | 3 // 1低 2中 3高
export type ExecutionStatus = 'pending' | 'executed' | 'rejected' | 'failed'
export type ActionType = 'open' | 'close' | 'maintain' | 'emergency'
export type ActionSource = 'dqn_auto' | 'manual' | 'emergency_override' | 'physics_corrected'

// ---------- 影响因素 ----------
export interface DecisionFactor {
  name: string
  value: number | string
  direction: 'up' | 'down' | 'neutral'
  weight: number
}

// ---------- 方案对比（alternatives 内部结构）----------
export interface DispatchPlan {
  id: string
  opening: number
  expectedLevel: number
  power: number
  safetyScore: number
  totalScore: number
  recommended: boolean
  /** 该方案对应的置信度 */
  confidence: number
  /** 该方案对关键因素的影响（切换方案时动画更新） */
  factorImpacts?: Record<string, { direction: 'up' | 'down' | 'neutral'; value: string; weight?: number }>
}

// ---------- 权重配置 ----------
export interface WeightsUsed {
  power_weight: number
  safety_weight: number
  ecology_weight: number
}

// ---------- AI 决策详情（§4.2）----------
export interface DecisionDetail {
  id: number
  trace_id: string
  reservoir_id: number
  decision_time: string
  decision_mode: DecisionMode
  risk_rank: RiskRank
  upstream_level: number
  downstream_level: number
  inflow_rate: number
  current_opening: number
  lstm_predictions: Record<string, { level: number; flow: number }>
  recommended_opening: number
  confidence: number
  factors: DecisionFactor[]
  alternatives: DispatchPlan[]       // 文档中为 alternatives
  weights_used: WeightsUsed
  reward_score: number
  physics_validation: Record<string, unknown> | null
  execution_status: ExecutionStatus
  executed_opening: number | null
  actual_level_after: number | null
  actual_power_after: number | null
  created_at: string
}

// ---------- LSTM 预测数据（§4.1）----------
export interface PredictionPoint {
  time: string
  value: number
}

export interface PredictionData {
  id: number
  base_time: string
  predict_term: 1 | 2 | 3     // 1=1h 2=3h 3=6h
  water_seq: PredictionPoint[] // 水位时序
  flow_seq: PredictionPoint[]  // 流量时序
  predict_accuracy: number
  created_at: string
}

// ---------- 调度记录（决策列表 §4.3）----------
export interface DispatchRecord {
  id: number
  decision_time: string
  decision_mode: DecisionMode
  recommended_opening: number
  confidence: number
  risk_rank: RiskRank
  execution_status: ExecutionStatus
  physics_validation: Record<string, unknown> | null
}

// ---------- 闸门动作历史（§4.6）----------
export interface GateAction {
  id: number
  equipment_id: number
  previous_opening: number
  target_opening: number
  actual_opening: number
  action_type: ActionType
  action_source: ActionSource
  duration_ms: number
  is_smoothed: number
  acted_at: string
}

// ---------- 急停日志（§4.9）----------
export interface EmergencyStopLog {
  id: number
  trigger_user_id: number
  trigger_time: string
  edge_ack_time: string | null
  plc_shut_time: string | null
  recover_time: string | null
  stop_reason: string
}

// ---------- 当前运行状态（页面需要，综合多个接口）----------
export interface DispatchStatus {
  mode: 'auto' | 'manual'
  autoLevel: 1 | 2 | 3       // 前端本地维护的自动执行级别
  upstreamLevel: number
  downstreamLevel: number
  flowRate: number            // 入库流量
  gateOpening: number
  lastDispatchAt: string | null
  isExecuting: boolean
}

// ---------- 请求体类型 ----------

/** 人工下发指令（§4.4）*/
export interface ExecuteParams {
  reservoir_id: number
  decision_id?: number
  target_opening: number
  operate_note?: string
}

/** 急停（§4.7）*/
export interface EmergencyStopParams {
  reservoir_id: number
  stop_reason: string
}
