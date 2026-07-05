// ============================================================
// 调度决策页 — API（后端未就绪时回退 Mock）
// ============================================================
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  DecisionDetail, DispatchRecord, DispatchStatus, PredictionData,
  PhysicsGuardSummary, PhysicsGuardHistoryItem, GateAction,
} from '@/types/dispatch'
import { mockApi } from './mockStore'

async function fetchMock<T>(_url: string, _options?: RequestInit): Promise<ApiResponse<T>> {
  throw new Error('API not ready')
}

async function withMockFallback<T>(
  url: string,
  mockFn: () => Promise<ApiResponse<T>>,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    return await fetchMock<T>(url, options)
  } catch {
    return mockFn()
  }
}

const HORIZON_MAP = { 1: '1h', 2: '3h', 3: '6h' } as const

export function fetchDispatchStatus() {
  return withMockFallback('/api/dispatch/status', () => mockApi.getDispatchStatus())
}

export function fetchDecisionDetail() {
  return withMockFallback('/api/dispatch/decision', () => mockApi.getDecisionDetail())
}

export function fetchPrediction(term: 1 | 2 | 3) {
  const horizon = HORIZON_MAP[term]
  return withMockFallback(
    `/api/dispatch/prediction?horizon=${horizon}`,
    () => mockApi.getPrediction(horizon),
  )
}

export function fetchDispatchLogs(keyword?: string) {
  return withMockFallback(
    `/api/dispatch/logs?keyword=${keyword ?? ''}`,
    () => mockApi.getDispatchLogs({ keyword }),
  )
}

export function postExecute(targetOpening: number) {
  return withMockFallback('/api/dispatch/execute', () => mockApi.executeDispatch({ targetOpening }), { method: 'POST' })
}

export function postCancelExecute() {
  return withMockFallback('/api/dispatch/cancel', () => mockApi.cancelDispatch(), { method: 'POST' })
}

export function postAcceptDecision() {
  return withMockFallback('/api/dispatch/accept', () => mockApi.acceptDecision(), { method: 'POST' })
}

export function postIgnoreDecision() {
  return withMockFallback('/api/dispatch/ignore', () => mockApi.ignoreDecision(), { method: 'POST' })
}

export function putDispatchMode(mode: 'auto' | 'manual') {
  return withMockFallback('/api/dispatch/mode', () => mockApi.changeMode({ mode }), { method: 'PUT' })
}

export function putAutoLevel(level: 1 | 2 | 3) {
  return withMockFallback('/api/dispatch/auto-level', () => mockApi.changeAutoLevel({ level }), { method: 'PUT' })
}

export function fetchPhysicsGuardSummary() {
  return withMockFallback('/api/v1/settings/physics-guard?reservoir_id=1', () => mockApi.getPhysicsGuardSummary())
}

export function fetchPhysicsGuardHistory() {
  return withMockFallback('/api/v1/settings/physics-guard/history?reservoir_id=1', () => mockApi.getPhysicsGuardHistory())
}

export function postPhysicsGuardRollback(id: number) {
  return withMockFallback(`/api/v1/settings/physics-guard/${id}/rollback`, () => mockApi.rollbackPhysicsGuardConfig(id), { method: 'POST' })
}

export function fetchGateActions(keyword?: string) {
  return withMockFallback(`/api/dispatch/gate-actions?keyword=${keyword ?? ''}`, () => mockApi.getGateActions({ keyword }))
}

export type { DecisionDetail, DispatchRecord, DispatchStatus, PredictionData, PhysicsGuardSummary, PhysicsGuardHistoryItem, GateAction, PageResult }
