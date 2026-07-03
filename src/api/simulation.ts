// ============================================================
// 数字孪生 — API 接口层
// ============================================================
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  SimulationParams, SimulationRealtimeData, SimulationRun, SimulationReport,
  AiModel, TrainingTask, TrainingConfig, FaultReview, FaultConclusion,
} from '@/types/simulation'
import { mockApi } from './mockStore'

async function fetchMock<T>(_url: string, _options?: RequestInit): Promise<ApiResponse<T>> {
  throw new Error('API not ready')
}

export async function startSimulation(params: SimulationParams): Promise<ApiResponse<{ runId: number }>> {
  try { return fetchMock('/api/simulation/start', { method: 'POST', body: JSON.stringify(params) }) } catch { return mockApi.startSimulation(params) }
}
export async function pauseSimulation(): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/simulation/pause', { method: 'POST' }) } catch { return mockApi.pauseSimulation() }
}
export async function resumeSimulation(): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/simulation/resume', { method: 'POST' }) } catch { return mockApi.resumeSimulation() }
}
export async function resetSimulation(): Promise<ApiResponse<null>> {
  try { return fetchMock('/api/simulation/reset', { method: 'POST' }) } catch { return mockApi.resetSimulation() }
}
export async function getSimulationStatus(): Promise<ApiResponse<SimulationRealtimeData>> {
  try { return fetchMock('/api/simulation/status') } catch { return mockApi.getSimulationStatus() }
}
export async function getSimulationScenes(): Promise<ApiResponse<Array<{ scene: string; label: string; defaultParams: SimulationParams }>>> {
  return fetchMock('/api/simulation/scenes')
}
export async function getModelList(): Promise<ApiResponse<AiModel[]>> {
  try { return fetchMock('/api/models') } catch { return mockApi.getModelList() }
}
export async function uploadModel(_formData: FormData): Promise<ApiResponse<AiModel>> {
  try { return fetchMock('/api/models/upload', { method: 'POST' }) } catch { return mockApi.uploadModel() }
}
export async function activateModel(id: number): Promise<ApiResponse<null>> {
  try { return fetchMock(`/api/models/${id}/activate`, { method: 'PUT' }) } catch { return mockApi.activateModel(id) }
}
export async function startTraining(config: TrainingConfig & { modelId: number }): Promise<ApiResponse<{ taskId: string }>> {
  try { return fetchMock('/api/models/train', { method: 'POST', body: JSON.stringify(config) }) } catch { return mockApi.startTraining() }
}
export async function getTrainingProgress(taskId: string): Promise<ApiResponse<TrainingTask>> {
  try { return fetchMock(`/api/models/train/${taskId}`) } catch { return mockApi.getTrainingProgress(taskId) }
}
export async function generateReport(runId: number): Promise<ApiResponse<SimulationReport>> {
  try { return fetchMock('/api/simulation/report', { method: 'POST', body: JSON.stringify({ runId }) }) } catch { return mockApi.generateReport() }
}
export async function getReportList(params: { pageNum: number; pageSize: number; scene?: string }): Promise<ApiResponse<PageResult<SimulationReport>>> {
  try {
    const q = new URLSearchParams(Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    return fetchMock(`/api/simulation/reports?${q}`)
  } catch { return mockApi.getReportList() }
}
export async function downloadReport(_id: number): Promise<Blob> {
  try { throw new Error('API not ready') } catch { return mockApi.downloadReport() }
}
export async function getFaultReviewList(params: { pageNum: number; pageSize: number; type?: string; startTime?: string; endTime?: string }): Promise<ApiResponse<PageResult<FaultReview>>> {
  try {
    const q = new URLSearchParams(Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    return fetchMock(`/api/fault-review/list?${q}`)
  } catch { return mockApi.getFaultReviewList() }
}
export async function getFaultReviewDetail(id: number): Promise<ApiResponse<FaultReview>> {
  try { return fetchMock(`/api/fault-review/${id}`) } catch { return mockApi.getFaultReviewDetail(id) }
}
export async function submitFaultConclusion(id: number, conclusion: FaultConclusion): Promise<ApiResponse<null>> {
  try { return fetchMock(`/api/fault-review/${id}`, { method: 'PUT', body: JSON.stringify(conclusion) }) } catch { return mockApi.submitFaultConclusion(id, conclusion) }
}
export async function importToSimulation(id: number): Promise<ApiResponse<SimulationParams>> {
  try { return fetchMock(`/api/fault-review/${id}/import-simulation`, { method: 'POST' }) } catch { return mockApi.importToSimulation() }
}
export async function getSimulationRuns(params: { pageNum: number; pageSize: number }): Promise<ApiResponse<PageResult<SimulationRun>>> {
  try { return fetchMock(`/api/simulation/runs?pageNum=${params.pageNum}&pageSize=${params.pageSize}`) } catch { return mockApi.getSimulationRuns() }
}
export async function getCockpitKpi(): Promise<ApiResponse<Record<string, unknown>>> {
  try { return fetchMock('/api/cockpit/kpi') } catch { return mockApi.getCockpitKpi() }
}
