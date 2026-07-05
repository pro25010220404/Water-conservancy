// ============================================================
// 数字孪生 — API 接口层
// ============================================================
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  SimulationParams, SimulationRealtimeData, SimulationRun, SimulationReport,
  SimulationStartPayload,
  AiModel, TrainingTask, TrainingConfig, FaultReview, FaultConclusion,
} from '@/types/simulation'
import type { PhysicsGuardSummary } from '@/types/dispatch'
import { mockApi } from './mockStore'

async function fetchMock<T>(_url: string, _options?: RequestInit): Promise<ApiResponse<T>> {
  throw new Error('API not ready')
}

/** 真实 API 未就绪时回退 Mock（必须 await，否则 catch 捕获不到 Promise 拒绝） */
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

export async function startSimulation(params: SimulationStartPayload): Promise<ApiResponse<{ runId: number }>> {
  return withMockFallback('/api/simulation/start', () => mockApi.startSimulation(params), {
    method: 'POST',
    body: JSON.stringify(params),
  })
}
export async function pauseSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback('/api/simulation/pause', () => mockApi.pauseSimulation(), { method: 'POST' })
}
export async function resumeSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback('/api/simulation/resume', () => mockApi.resumeSimulation(), { method: 'POST' })
}
export async function resetSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback('/api/simulation/reset', () => mockApi.resetSimulation(), { method: 'POST' })
}
export async function getSimulationStatus(): Promise<ApiResponse<SimulationRealtimeData>> {
  return withMockFallback('/api/simulation/status', () => mockApi.getSimulationStatus())
}
export async function setSimulationGateOpening(opening: number): Promise<ApiResponse<null>> {
  return withMockFallback('/api/simulation/gate', () => mockApi.setGateOpening(opening), {
    method: 'PUT',
    body: JSON.stringify({ opening }),
  })
}
export async function emergencyStopSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback('/api/simulation/emergency-stop', () => mockApi.emergencyStopSimulation(), {
    method: 'POST',
  })
}
export async function getSimulationScenes(): Promise<ApiResponse<Array<{ scene: string; label: string; defaultParams: SimulationParams }>>> {
  return fetchMock('/api/simulation/scenes')
}
export async function getModelList(): Promise<ApiResponse<AiModel[]>> {
  return withMockFallback('/api/models', () => mockApi.getModelList())
}
export async function uploadModel(_formData: FormData): Promise<ApiResponse<AiModel>> {
  return withMockFallback('/api/models/upload', () => mockApi.uploadModel(), { method: 'POST' })
}
export async function activateModel(id: number): Promise<ApiResponse<null>> {
  return withMockFallback(`/api/models/${id}/activate`, () => mockApi.activateModel(id), { method: 'PUT' })
}
export async function startTraining(config: TrainingConfig & { modelId: number }): Promise<ApiResponse<{ taskId: string }>> {
  return withMockFallback('/api/models/train', () => mockApi.startTraining(), {
    method: 'POST',
    body: JSON.stringify(config),
  })
}
export async function getTrainingProgress(taskId: string): Promise<ApiResponse<TrainingTask>> {
  return withMockFallback(`/api/models/train/${taskId}`, () => mockApi.getTrainingProgress(taskId))
}
export async function generateReport(runId: number): Promise<ApiResponse<SimulationReport>> {
  return withMockFallback('/api/simulation/report', () => mockApi.generateReport(), {
    method: 'POST',
    body: JSON.stringify({ runId }),
  })
}
export async function getReportList(params: { pageNum: number; pageSize: number; scene?: string }): Promise<ApiResponse<PageResult<SimulationReport>>> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  ).toString()
  return withMockFallback(`/api/simulation/reports?${q}`, () => mockApi.getReportList())
}
export async function downloadReport(_id: number): Promise<Blob> {
  try {
    throw new Error('API not ready')
  } catch {
    return mockApi.downloadReport()
  }
}
export async function getFaultReviewList(params: { pageNum: number; pageSize: number; type?: string; startTime?: string; endTime?: string }): Promise<ApiResponse<PageResult<FaultReview>>> {
  const q = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
  ).toString()
  return withMockFallback(`/api/fault-review/list?${q}`, () => mockApi.getFaultReviewList())
}
export async function getFaultReviewDetail(id: number): Promise<ApiResponse<FaultReview>> {
  return withMockFallback(`/api/fault-review/${id}`, () => mockApi.getFaultReviewDetail(id))
}
export async function submitFaultConclusion(id: number, conclusion: FaultConclusion): Promise<ApiResponse<null>> {
  return withMockFallback(`/api/fault-review/${id}`, () => mockApi.submitFaultConclusion(id, conclusion), {
    method: 'PUT',
    body: JSON.stringify(conclusion),
  })
}
export async function importToSimulation(id: number): Promise<ApiResponse<SimulationParams>> {
  return withMockFallback(`/api/fault-review/${id}/import-simulation`, () => mockApi.importToSimulation(), { method: 'POST' })
}
export async function getSimulationRuns(params: { pageNum: number; pageSize: number }): Promise<ApiResponse<PageResult<SimulationRun>>> {
  return withMockFallback(
    `/api/simulation/runs?pageNum=${params.pageNum}&pageSize=${params.pageSize}`,
    () => mockApi.getSimulationRuns(),
  )
}
export async function getCockpitKpi(): Promise<ApiResponse<Record<string, unknown>>> {
  return withMockFallback('/api/cockpit/kpi', () => mockApi.getCockpitKpi())
}

export async function getPhysicsGuardSummary(): Promise<ApiResponse<PhysicsGuardSummary>> {
  return withMockFallback('/api/v1/settings/physics-guard?reservoir_id=1', () => mockApi.getPhysicsGuardSummary())
}
