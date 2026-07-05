// ============================================================
// 数字孪生 — TypeScript 类型定义
// 依据：《水电站闸门智能调度系统-详细需求报告》第四章
// ============================================================

// ---------- 仿真场景 ----------
export type SimulationScene =
  | 'normal'
  | 'flood'
  | 'dry'
  | 'rainstorm'
  | 'custom'

// ---------- 仿真状态 ----------
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'finished'

// ---------- 仿真倍速 ----------
export type SimulationSpeed = 1 | 2 | 5 | 10

// ---------- 模型类型 ----------
export type ModelType = 'LSTM' | 'DQN'

// ---------- 模型状态 ----------
export type ModelStatus = 'inactive' | 'active' | 'validating'

// ---------- 故障复盘状态 ----------
export type ReviewStatus = 'pending' | 'reviewed'

// ---------- 仿真参数 ----------
export interface SimulationParams {
  scene: SimulationScene
  initialLevel: number       // 初始水位 m
  inflowRate: number         // 入库流量 m³/s
  durationMin: number        // 仿真时长 min
}

/** 启动仿真时的完整载荷（含倍速、闸门开度） */
export interface SimulationStartPayload extends SimulationParams {
  speed?: SimulationSpeed
  gateOpening?: number
}

// ---------- 仿真实时数据 ----------
export interface SimulationRealtimeData {
  status: SimulationStatus
  elapsedSec: number
  currentLevel: number
  currentDownstreamLevel: number
  currentFlow: number
  currentOpening: number
  historyLevels: Array<{ time: number; value: number }>
  historyFlows: Array<{ time: number; value: number }>
}

// ---------- 仿真摘要 ----------
export interface SimulationSummary {
  maxLevel: number
  minLevel: number
  totalDischarge: number
  estimatedPower: number
}

// ---------- 仿真运行记录 ----------
export interface SimulationRun {
  id: number
  scene: SimulationScene
  params: SimulationParams
  status: SimulationStatus
  summary: SimulationSummary | null
  createdAt: string
}

// ---------- AI 模型 ----------
export interface AiModel {
  id: number
  type: ModelType
  version: string
  filePath: string
  status: ModelStatus
  metrics: ModelMetrics | null
  remark: string | null
  createdAt: string
  activatedAt: string | null
}

// ---------- 模型评估指标 ----------
export interface ModelMetrics {
  mae?: number
  rmse?: number
  accuracy?: number
  overallScore?: number
  healthGrade?: 'S' | 'A' | 'B' | 'C' | 'D'
  [key: string]: number | string | undefined
}

// ---------- 训练配置 ----------
export interface TrainingConfig {
  epochs?: number
  learningRate?: number
  batchSize?: number
  dataSource?: 'history' | 'csv'
  csvFile?: string
}

// ---------- 训练任务 ----------
export interface TrainingTask {
  taskId: string
  modelId: number
  config: TrainingConfig
  progress: number           // 0-100
  lossCurve: Array<{ epoch: number; loss: number }>
  status: 'running' | 'completed' | 'failed'
}

// ---------- 评估报告 ----------
export interface SimulationReport {
  id: number
  runId: number
  scene: SimulationScene
  params: SimulationParams
  summary: SimulationSummary
  content: string
  filePath: string | null
  createdAt: string
  operatorName: string
}

// ---------- 故障复盘 ----------
export interface FaultReview {
  id: number
  alarmId: number
  faultType: string
  impactScope: string
  reviewed: boolean
  timeline: FaultTimelineEvent[]
  conclusion: FaultConclusion | null
  status: ReviewStatus
  createdAt: string
}

// ---------- 复盘时间线事件 ----------
export interface FaultTimelineEvent {
  time: string
  event: string
}

// ---------- 复盘结论 ----------
export interface FaultConclusion {
  rootCause: string
  improvements: string
  responsibleDept: string
  reviewedBy: string
  reviewedAt: string
}

// ---------- 仿真控制命令 ----------
export interface SimulationControlCommand {
  action: 'start' | 'pause' | 'resume' | 'reset'
  params?: SimulationParams
}

// ---------- 预设场景配置 ----------
export interface ScenePreset {
  scene: SimulationScene
  label: string
  description: string
  defaultParams: SimulationParams
}
