// ============================================================
// 调度决策 — API 接口层（字段对齐《总接口文档》§4）
// ============================================================
import http from './request'
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  PredictionData,
  DecisionDetail,
  DispatchRecord,
  GateAction,
  EmergencyStopLog,
  ExecuteParams,
  EmergencyStopParams,
} from '@/types/dispatch'

// ── §4.1 LSTM 预测数据 ──
export function getPrediction(reservoir_id: number, predict_term: 1 | 2 | 3) {
  return http.get<ApiResponse<PredictionData>>('/dispatch/predictions', {
    params: { reservoir_id, predict_term },
  })
}

// ── §4.2 AI 决策详情 ──
export function getDecisionDetail(id: number) {
  return http.get<ApiResponse<DecisionDetail>>(`/dispatch/decisions/${id}`)
}

// ── §4.3 调度决策历史列表 ──
export function getDecisions(params: {
  page?: number
  page_size?: number
  reservoir_id?: number
  decision_mode?: string
  execution_status?: string
  start_time?: string
  end_time?: string
}) {
  return http.get<ApiResponse<PageResult<DispatchRecord>>>('/dispatch/decisions', { params })
}

// ── §4.4 人工下发调度指令 ──
export function executeDispatch(data: ExecuteParams) {
  return http.post<ApiResponse<{ command_id: string }>>('/dispatch/execute', data)
}

// ── §4.5 指令全链路追踪 ──
export function getCommandTrace(command_id: string) {
  return http.get<ApiResponse<Record<string, unknown>>>(`/dispatch/commands/${command_id}/trace`)
}

// ── §4.6 闸门动作历史 ──
export function getGateActions(params: {
  page?: number
  page_size?: number
  equipment_id?: number
  action_type?: string
  start_time?: string
  end_time?: string
}) {
  return http.get<ApiResponse<PageResult<GateAction>>>('/dispatch/gate-actions', { params })
}

// ── §4.7 全局急停 ──
export function emergencyStop(data: EmergencyStopParams) {
  return http.post<ApiResponse<{ stop_log_id: number; command_id: string }>>(
    '/dispatch/emergency-stop',
    data,
  )
}

// ── §4.8 恢复自动模式 ──
export function recoverStop(id: number) {
  return http.put<ApiResponse<null>>(`/dispatch/stop-recover/${id}`)
}

// ── §4.9 急停日志列表 ──
export function getEmergencyStops(params: {
  page?: number
  page_size?: number
  reservoir_id?: number
  start_time?: string
  end_time?: string
}) {
  return http.get<ApiResponse<PageResult<EmergencyStopLog>>>('/dispatch/emergency-stops', {
    params,
  })
}
