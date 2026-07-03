// ============================================================
// 数字孪生 — 常量字典
// 依据：《水电站闸门智能调度系统-详细需求报告》第四章
// ============================================================
import type { DictOption } from '@/shared/types'

// ---------- 仿真场景 ----------
export const SIMULATION_SCENE_MAP: Record<string, { label: string; description: string }> = {
  normal: { label: '正常工况', description: '标准运行条件，水位/流量处于正常区间' },
  flood: { label: '洪水入库', description: '模拟暴雨后水位快速上涨场景' },
  dry: { label: '枯水期', description: '低水位条件下的发电调度' },
  rainstorm: { label: '持续暴雨', description: '连续强降雨导致的极端来水场景' },
  custom: { label: '自定义', description: '手动设定初始参数' },
}

export const SIMULATION_SCENE_OPTIONS = Object.entries(SIMULATION_SCENE_MAP).map(
  ([value, item]) => ({ ...item, value }),
)

// ---------- 仿真状态 ----------
export const SIMULATION_STATUS_MAP: Record<string, DictOption> = {
  idle: { label: '待机', value: 'idle', color: '#6b7280' },
  running: { label: '运行中', value: 'running', color: '#22c55e' },
  paused: { label: '已暂停', value: 'paused', color: '#f59e0b' },
  finished: { label: '已结束', value: 'finished', color: '#3b82f6' },
}

// ---------- 仿真倍速 ----------
export const SPEED_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '5x', value: 5 },
  { label: '10x', value: 10 },
]

// ---------- 模型状态 ----------
export const MODEL_STATUS_MAP: Record<string, DictOption> = {
  inactive: { label: '未激活', value: 'inactive', color: '#6b7280' },
  active: { label: '已激活', value: 'active', color: '#22c55e' },
  validating: { label: '验证中', value: 'validating', color: '#f59e0b' },
}

// ---------- 模型类型 ----------
export const MODEL_TYPE_OPTIONS: DictOption[] = [
  { label: 'LSTM', value: 'LSTM', color: '#3b82f6' },
  { label: 'DQN', value: 'DQN', color: '#8b5cf6' },
]

// ---------- 复盘状态 ----------
export const REVIEW_STATUS_MAP: Record<string, DictOption> = {
  pending: { label: '待复盘', value: 'pending', color: '#f59e0b' },
  reviewed: { label: '已复盘', value: 'reviewed', color: '#22c55e' },
}

// ---------- 默认训练配置 ----------
export const DEFAULT_TRAINING_CONFIG = {
  epochs: 100,
  learningRate: 0.001,
  batchSize: 32,
}

// ---------- 仿真默认参数 ----------
export const DEFAULT_SIMULATION_PARAMS = {
  initialLevel: 3.5,
  inflowRate: 10,
  durationMin: 60,
}

// ---------- 报告 Tab 枚举 ----------
export const SIMULATION_TABS = [
  { label: '仿真控制', value: 'control' },
  { label: '模型训练', value: 'model' },
  { label: '评估报告', value: 'report' },
  { label: '故障复盘', value: 'review' },
] as const

export type SimulationTab = (typeof SIMULATION_TABS)[number]['value']
