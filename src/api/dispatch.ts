// ============================================================
// 调度决策 — API 接口层
// ============================================================
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  DispatchStatus, DecisionDetail, PredictionData, DispatchLog,
  ExecuteParams, ModeChangeParams, AutoLevelChangeParams, IgnoreParams,
} from '@/types/dispatch'
import { mockApi } from './mockStore'

async function fetchMock<T>(_url: string, _options?: RequestInit): Promise<ApiResponse<T>> {
  throw new Error('API not ready')
}

export async function getDispatchStatus(): Promise<ApiResponse<DispatchStatus>> {
  try { return fetchMock('/api/dispatch/status') } catch { return mockApi.getDispatchStatus() }
}
export async function getDecisionDetail(): Promise<ApiResponse<DecisionDetail>> {
  try { return fetchMock('/api/dispatch/decision') } catch { return mockApi.getDecisionDetail() }
}
export async function getPrediction(horizon: string): Promise<ApiResponse<PredictionData>> {
  try { return fetchMock(`/api/dispatch/prediction?horizon=${horizon}`) } catch { return mockApi.getPrediction(horizon as '1h' | '3h' | '6h') }
}
export async function executeDispatch(params: ExecuteParams): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/dispatch/execute', { method: 'POST', body: JSON.stringify(params) }) } catch { return mockApi.executeDispatch(params) }
}
export async function emergencyStop(): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/dispatch/emergency-stop', { method: 'POST' }) } catch { return mockApi.emergencyStop() }
}
export async function changeMode(params: ModeChangeParams): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/dispatch/mode', { method: 'PUT', body: JSON.stringify(params) }) } catch { return mockApi.changeMode(params) }
}
export async function changeAutoLevel(params: AutoLevelChangeParams): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/dispatch/auto-level', { method: 'PUT', body: JSON.stringify(params) }) } catch { return mockApi.changeAutoLevel(params) }
}
export async function acceptDecision(): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/dispatch/accept', { method: 'POST' }) } catch { return mockApi.acceptDecision() }
}
export async function ignoreDecision(params: IgnoreParams): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/dispatch/ignore', { method: 'POST', body: JSON.stringify(params) }) } catch { return mockApi.ignoreDecision() }
}
export async function getDispatchLogs(params: { pageNum: number; pageSize: number }): Promise<ApiResponse<PageResult<DispatchLog>>> {
  try { return fetchMock(`/api/dispatch/logs?pageNum=${params.pageNum}&pageSize=${params.pageSize}`) } catch { return mockApi.getDispatchLogs() }
}
export async function getRiskLevel(): Promise<ApiResponse<{ level: 'low' | 'medium' | 'high'; diff: number; safeMin: number; safeMax: number }>> {
  try { return fetchMock('/api/dispatch/risk') } catch { return mockApi.getRiskLevel() }
}
