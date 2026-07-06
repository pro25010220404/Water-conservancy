// ============================================================
// 调度决策页 — API（真实接口优先，失败回退 Mock）
// ============================================================
import http from './request'
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  DecisionDetail,
  DispatchRecord,
  DispatchStatus,
  PredictionData,
  PhysicsGuardSummary,
  PhysicsGuardHistoryItem,
  GateAction,
  CommandTrace,
  EmergencyStopLog,
} from '@/types/dispatch'
import { mockApi } from './mockStore'
import {
  mapBackendPrediction,
  mapBackendDecision,
  mapBackendDispatchRecord,
  mapBackendGateAction,
  mapBackendCommandTrace,
  mapBackendEmergencyStopLog,
  pickDecisionId,
  type BackendPredictionItem,
  type BackendDecisionItem,
  type BackendGateActionItem,
  type BackendCommandTraceItem,
  type BackendEmergencyStopItem,
} from './dispatchAdapter'

const V1_PREFIX = import.meta.env.VITE_API_V1_PREFIX ?? '/v1'
const DISPATCH_BASE = `${V1_PREFIX}/dispatch`
const DEFAULT_RESERVOIR_ID = 1

const HORIZON_MAP = { 1: '1h', 2: '3h', 3: '6h' } as const

function unwrap<T>(res: { data: ApiResponse<T> }): ApiResponse<T> | null {
  if (res.data?.code === 0) return res.data
  return null
}

async function withMockFallback<T>(
  apiFn: () => Promise<ApiResponse<T>>,
  mockFn: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  try {
    return await apiFn()
  } catch {
    return mockFn()
  }
}

export function fetchDispatchStatus() {
  return withMockFallback(
    async () => {
      const listRes = await http.get<ApiResponse<PageResult<BackendDecisionItem>>>(
        `${DISPATCH_BASE}/decisions`,
        { params: { page: 1, page_size: 50, reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const listBody = unwrap(listRes)
      const rawList = listBody?.data?.list ?? []
      const id = pickDecisionId(rawList)
      if (!id) throw new Error('no decision for status')
      const detailRes = await http.get<ApiResponse<BackendDecisionItem>>(
        `${DISPATCH_BASE}/decisions/${id}`,
      )
      const detailRaw = unwrap(detailRes)?.data
      if (!detailRaw) throw new Error('decision detail failed')
      const detail = mapBackendDecision(detailRaw)
      const mockStatus = (await mockApi.getDispatchStatus()).data
      return {
        code: 0,
        msg: 'ok',
        success: true,
        trace_id: listBody!.trace_id,
        data: {
          ...mockStatus,
          upstreamLevel: detail.upstream_level,
          downstreamLevel: detail.downstream_level,
          flowRate: detail.inflow_rate,
          gateOpening: detail.current_opening,
          lastDispatchAt: detail.decision_time,
          isExecuting: detail.execution_status === 'pending',
          executingTarget:
            detail.execution_status === 'pending' ? detail.recommended_opening : null,
        },
      }
    },
    () => mockApi.getDispatchStatus(),
  )
}

export function fetchDecisionDetail() {
  return withMockFallback(
    async () => {
      const listRes = await http.get<ApiResponse<PageResult<BackendDecisionItem>>>(
        `${DISPATCH_BASE}/decisions`,
        { params: { page: 1, page_size: 50, reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const listBody = unwrap(listRes)
      const rawList = listBody?.data?.list ?? []
      const id = pickDecisionId(rawList)
      if (!id) throw new Error('no decision')
      const res = await http.get<ApiResponse<BackendDecisionItem>>(
        `${DISPATCH_BASE}/decisions/${id}`,
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('decision failed')
      return { ...body, data: mapBackendDecision(body.data) }
    },
    () => mockApi.getDecisionDetail(),
  )
}

export function fetchPrediction(term: 1 | 2 | 3) {
  const horizon = HORIZON_MAP[term]
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<BackendPredictionItem>>(
        `${DISPATCH_BASE}/predictions`,
        { params: { reservoir_id: DEFAULT_RESERVOIR_ID, predict_term: term } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('prediction failed')
      return { ...body, data: mapBackendPrediction(body.data) }
    },
    () => mockApi.getPrediction(horizon),
  )
}

export function fetchDispatchLogs(keyword?: string) {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<BackendDecisionItem>>>(
        `${DISPATCH_BASE}/decisions`,
        { params: { page: 1, page_size: 50, reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('decisions failed')
      let list = (body.data.list ?? []).map(mapBackendDispatchRecord)
      const total = body.data.total ?? list.length
      if (keyword) {
        const kw = keyword.toLowerCase()
        list = list.filter(
          (r) =>
            r.decision_mode?.toLowerCase().includes(kw) ||
            r.decision_mode_label?.toLowerCase().includes(kw) ||
            r.action?.toLowerCase().includes(kw) ||
            String(r.recommended_opening).includes(kw) ||
            r.execution_status?.toLowerCase().includes(kw) ||
            String(r.confidence).includes(kw),
        )
        return { ...body, data: { list, total: list.length } }
      }
      return { ...body, data: { list, total } }
    },
    () => mockApi.getDispatchLogs({ keyword }),
  )
}

export function postExecute(targetOpening: number, decisionId?: number) {
  return withMockFallback(
    async () => {
      const res = await http.post<ApiResponse<{ command_id: string }>>(
        `${DISPATCH_BASE}/execute`,
        {
          reservoir_id: DEFAULT_RESERVOIR_ID,
          target_opening: targetOpening,
          ...(decisionId != null ? { decision_id: decisionId } : {}),
        },
      )
      const body = unwrap(res)
      if (!body?.data?.command_id) throw new Error('execute failed')
      return body
    },
    () => mockApi.executeDispatch({ targetOpening }),
  )
}

export function postCancelExecute() {
  return withMockFallback(
    async () => {
      throw new Error('cancel not on api')
    },
    () => mockApi.cancelDispatch(),
  )
}

export function postAcceptDecision(decisionId: number, targetOpening: number) {
  return postExecute(targetOpening, decisionId)
}

export function postIgnoreDecision() {
  return withMockFallback(
    async () => {
      throw new Error('ignore not on api')
    },
    () => mockApi.ignoreDecision(),
  )
}

export function putDispatchMode(mode: 'auto' | 'manual') {
  return withMockFallback(
    async () => {
      throw new Error('mode not on api')
    },
    () => mockApi.changeMode({ mode }),
  )
}

export function putAutoLevel(level: 1 | 2 | 3) {
  return withMockFallback(
    async () => {
      throw new Error('auto-level not on api')
    },
    () => mockApi.changeAutoLevel({ level }),
  )
}

export function fetchPhysicsGuardSummary() {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PhysicsGuardSummary>>(
        `${V1_PREFIX}/settings/physics-guard`,
        { params: { reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('physics guard failed')
      return body
    },
    () => mockApi.getPhysicsGuardSummary(),
  )
}

export function fetchPhysicsGuardHistory() {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<PhysicsGuardHistoryItem>>>(
        `${V1_PREFIX}/settings/physics-guard/history`,
        { params: { reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('physics guard history failed')
      return body
    },
    () => mockApi.getPhysicsGuardHistory(),
  )
}

export function postPhysicsGuardRollback(id: number) {
  return withMockFallback(
    async () => {
      const res = await http.post<ApiResponse<null>>(
        `${V1_PREFIX}/settings/physics-guard/${id}/rollback`,
      )
      const body = unwrap(res)
      if (!body) throw new Error('rollback failed')
      return body
    },
    () => mockApi.rollbackPhysicsGuardConfig(id),
  )
}

export function fetchGateActions(keyword?: string) {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<BackendGateActionItem>>>(
        `${DISPATCH_BASE}/gate-actions`,
        { params: { page: 1, page_size: 100 } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('gate actions failed')
      let list = (body.data.list ?? []).map(mapBackendGateAction)
      const total = body.data.total ?? list.length
      if (keyword) {
        const kw = keyword.toLowerCase()
        list = list.filter(
          (a) =>
            a.action_type?.toLowerCase().includes(kw) ||
            a.action_source?.toLowerCase().includes(kw) ||
            a.interlock_rule_name?.toLowerCase().includes(kw) ||
            String(a.equipment_id).includes(kw) ||
            String(a.target_opening).includes(kw) ||
            String(a.previous_opening).includes(kw),
        )
        return { ...body, data: { list, total: list.length } }
      }
      return { ...body, data: { list, total } }
    },
    () => mockApi.getGateActions({ keyword }),
  )
}

export function fetchCommandTrace(commandId: string) {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<BackendCommandTraceItem>>(
        `${DISPATCH_BASE}/commands/${encodeURIComponent(commandId)}/trace`,
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('command trace failed')
      return { ...body, data: mapBackendCommandTrace(body.data) }
    },
    () => mockApi.getCommandTrace(commandId),
  )
}

export function fetchEmergencyStopLogs() {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<BackendEmergencyStopItem>>>(
        `${DISPATCH_BASE}/emergency-stops`,
        { params: { page: 1, page_size: 50, reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('emergency stops failed')
      const list = (body.data.list ?? []).map(mapBackendEmergencyStopLog)
      return { ...body, data: { list, total: body.data.total ?? list.length } }
    },
    () => mockApi.getEmergencyStops(),
  )
}

export function postRecoverStop(stopLogId: number) {
  return withMockFallback(
    async () => {
      const res = await http.put<ApiResponse<null>>(
        `${DISPATCH_BASE}/stop-recover/${stopLogId}`,
      )
      const body = unwrap(res)
      if (!body) throw new Error('recover failed')
      return body
    },
    () => mockApi.recoverEmergencyStop(stopLogId),
  )
}

export type {
  DecisionDetail,
  DispatchRecord,
  DispatchStatus,
  PredictionData,
  PhysicsGuardSummary,
  PhysicsGuardHistoryItem,
  GateAction,
  PageResult,
  CommandTrace,
  EmergencyStopLog,
}
