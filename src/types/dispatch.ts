// ============================================================
// 调度决策 — TypeScript 类型定义
// 依据：《水电站闸门智能调度系统-详细需求报告》第三章
// ============================================================

// ---------- 运行模式 ----------
export type DispatchMode = 'auto' | 'manual'

// ---------- 自动执行权限等级 ----------
export type AutoLevel = 1 | 2 | 3

// ---------- 因素影响方向 ----------
export type FactorDirection = 'up' | 'down' | 'neutral'

// ---------- 执行结果 ----------
export type DispatchResult = 'success' | 'fail' | 'timeout' | 'cancelled'

// ---------- 影响因素 ----------
export interface DecisionFactor {
  name: string
  value: string
  direction: FactorDirection
  weight: number
}

// ---------- 调度方案 ----------
export interface DispatchPlan {
  id: string
  opening: number           // 目标开度 %
  expectedLevel: number     // 预期上游水位 m
  power: number             // 预期发电量 kW
  safetyScore: number       // 安全评分 0-100
  totalScore: number        // 综合得分 0-100
  recommended: boolean      // 是否推荐
}

// ---------- AI 决策详情 ----------
export interface DecisionDetail {
  recommendedOpening: number
  openingDirection: 'up' | 'down' | 'hold'
  expectedLevel: number
  expectedFlowRate: number
  levelChange: number
  flowChange: number
  factors: DecisionFactor[]
  plans: DispatchPlan[]
  confidence: number        // 0-100
  modelVersion: string
  inferenceMs: number
  createdAt: string
}

// ---------- 当前运行状态 ----------
export interface DispatchStatus {
  mode: DispatchMode
  autoLevel: AutoLevel
  upstreamLevel: number
  downstreamLevel: number
  flowRate: number
  gateOpening: number
  lastDispatchAt: string | null
  isExecuting: boolean
}

// ---------- LSTM 预测数据 ----------
export interface PredictionData {
  horizon: '1h' | '3h' | '6h'
  waterLevels: Array<{ time: string; value: number }>
  flowRates: Array<{ time: string; value: number }>
  updatedAt: string
}

// ---------- 调度记录 ----------
export interface DispatchLog {
  id: number
  mode: DispatchMode
  action: string
  targetOpening: number | null
  result: DispatchResult
  operatorId: number
  operatorName: string
  decisionSnapshot: DecisionDetail | null
  createdAt: string
}

// ---------- 执行指令请求 ----------
export interface ExecuteParams {
  targetOpening: number
}

// ---------- 模式切换请求 ----------
export interface ModeChangeParams {
  mode: DispatchMode
}

// ---------- 权限等级变更请求 ----------
export interface AutoLevelChangeParams {
  level: AutoLevel
  reason?: string
}

// ---------- 忽略建议请求 ----------
export interface IgnoreParams {
  reason?: string
}
