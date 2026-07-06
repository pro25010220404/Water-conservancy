// ============================================================
// 数字孪生 — API 接口层（真实接口优先，失败回退 Mock）
// ============================================================
import http from './request'
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  SimulationParams,
  SimulationRealtimeData,
  SimulationRun,
  SimulationReport,
  SimulationStartPayload,
  SimulationStartResult,
  SimulationScenarioItem,
  SimulationResultData,
  AiModel,
  TrainingTask,
  TrainingConfig,
  FaultReview,
  FaultConclusion,
} from '@/types/simulation'
import type { PhysicsGuardSummary } from '@/types/dispatch'
import { mockApi } from './mockStore'

const V1_PREFIX = import.meta.env.VITE_API_V1_PREFIX ?? '/v1'
const SIM_BASE = `${V1_PREFIX}/simulation`
const DEFAULT_RESERVOIR_ID = 1
const DEFAULT_MODEL_ID = 2
const DEFAULT_SCENARIO_ID = 1

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

function toStartBody(payload: SimulationStartPayload) {
  return {
    scenario_id: payload.scenarioId ?? DEFAULT_SCENARIO_ID,
    model_id: payload.modelId ?? DEFAULT_MODEL_ID,
    reservoir_id: payload.reservoirId ?? DEFAULT_RESERVOIR_ID,
    duration: Math.max(60, (payload.durationMin ?? 60) * 60),
    speed: payload.speed ?? 1,
    params: {
      initial_water_level: payload.initialLevel,
      inflow_rate: payload.inflowRate,
      gate_opening: payload.gateOpening ?? 45,
    },
  }
}

/** 9.1 仿真场景列表 */
export async function getSimulationScenarios(params?: {
  page?: number
  page_size?: number
  keyword?: string
}): Promise<ApiResponse<PageResult<SimulationScenarioItem>>> {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<SimulationScenarioItem>>>(
        `${SIM_BASE}/scenarios`,
        { params: { page: 1, page_size: 50, ...params } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('scenarios failed')
      return body
    },
    async () => ({
      code: 0,
      msg: 'ok',
      success: true,
      trace_id: 'mock-scenarios',
      data: {
        list: [
          {
            id: 1,
            name: '正常工况',
            type: 'production',
            status: 'active',
            model_id: DEFAULT_MODEL_ID,
          },
        ],
        total: 1,
        pageNum: 1,
        pageSize: 50,
      },
    }),
  )
}

/** 9.2 启动仿真 */
export async function startSimulation(
  params: SimulationStartPayload,
): Promise<ApiResponse<SimulationStartResult>> {
  return withMockFallback(
    async () => {
      const res = await http.post<ApiResponse<SimulationStartResult>>(
        `${SIM_BASE}/start`,
        toStartBody(params),
      )
      const body = unwrap(res)
      if (!body?.data?.simulation_id) throw new Error('start failed')
      return body
    },
    async () => {
      await mockApi.startSimulation(params)
      const id = `MOCK-${Date.now()}`
      return {
        code: 0,
        msg: 'ok',
        success: true,
        trace_id: 'mock-sim-start',
        data: {
          simulation_id: id,
          status: 'running',
          ws_endpoint: '',
        },
      }
    },
  )
}

/** 9.4 获取仿真结果 */
export async function getSimulationResult(
  simulationId: string,
): Promise<ApiResponse<SimulationResultData>> {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<SimulationResultData>>(
        `${SIM_BASE}/${simulationId}/result`,
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('result failed')
      return body
    },
    async () => ({
      code: 0,
      msg: 'ok',
      success: true,
      trace_id: 'mock-result',
      data: { summary: {}, total: 0, points: [] },
    }),
  )
}

export async function pauseSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('pause not on api')
    },
    () => mockApi.pauseSimulation(),
  )
}

export async function resumeSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('resume not on api')
    },
    () => mockApi.resumeSimulation(),
  )
}

export async function resetSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('reset not on api')
    },
    () => mockApi.resetSimulation(),
  )
}

export async function getSimulationStatus(): Promise<ApiResponse<SimulationRealtimeData>> {
  return withMockFallback(
    async () => {
      throw new Error('status poll replaced by websocket')
    },
    () => mockApi.getSimulationStatus(),
  )
}

export async function setSimulationGateOpening(opening: number): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('gate not on api')
    },
    () => mockApi.setGateOpening(opening),
  )
}

export async function emergencyStopSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('estop not on api')
    },
    () => mockApi.emergencyStopSimulation(),
  )
}

export async function getSimulationScenes(): Promise<
  ApiResponse<Array<{ scene: string; label: string; defaultParams: SimulationParams }>>
> {
  throw new Error('API not ready')
}

export async function getModelList(): Promise<ApiResponse<AiModel[]>> {
  return withMockFallback(
    async () => {
      throw new Error('models not on api')
    },
    () => mockApi.getModelList(),
  )
}

export async function uploadModel(_formData: FormData): Promise<ApiResponse<AiModel>> {
  return withMockFallback(
    async () => {
      throw new Error('upload not on api')
    },
    () => mockApi.uploadModel(),
  )
}

export async function activateModel(id: number): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('activate not on api')
    },
    () => mockApi.activateModel(id),
  )
}

export async function startTraining(
  _config: TrainingConfig & { modelId: number },
): Promise<ApiResponse<{ taskId: string }>> {
  return withMockFallback(
    async () => {
      throw new Error('train not on api')
    },
    () => mockApi.startTraining(),
  )
}

export async function getTrainingProgress(taskId: string): Promise<ApiResponse<TrainingTask>> {
  return withMockFallback(
    async () => {
      throw new Error('train progress not on api')
    },
    () => mockApi.getTrainingProgress(taskId),
  )
}

export async function generateReport(
  simulationId: string | number,
): Promise<ApiResponse<SimulationReport>> {
  const id = String(simulationId)
  return withMockFallback(
    async () => {
      const res = await http.post<ApiResponse<SimulationReport>>(
        `${SIM_BASE}/${id}/report`,
        { report_type: 'full', format: 'pdf', include_charts: true },
      )
      const body = unwrap(res)
      if (!body) throw new Error('report failed')
      return body
    },
    () => mockApi.generateReport(),
  )
}

export async function getReportList(_params: {
  pageNum: number
  pageSize: number
  scene?: string
}): Promise<ApiResponse<PageResult<SimulationReport>>> {
  return withMockFallback(
    async () => {
      throw new Error('reports not on api')
    },
    () => mockApi.getReportList(),
  )
}

export async function downloadReport(_id: number): Promise<Blob> {
  return mockApi.downloadReport()
}

export async function getFaultReviewList(_params: {
  pageNum: number
  pageSize: number
  type?: string
  startTime?: string
  endTime?: string
}): Promise<ApiResponse<PageResult<FaultReview>>> {
  return withMockFallback(
    async () => {
      throw new Error('fault list not on api')
    },
    () => mockApi.getFaultReviewList(),
  )
}

export async function getFaultReviewDetail(id: number): Promise<ApiResponse<FaultReview>> {
  return withMockFallback(
    async () => {
      throw new Error('fault detail not on api')
    },
    () => mockApi.getFaultReviewDetail(id),
  )
}

export async function submitFaultConclusion(
  id: number,
  conclusion: FaultConclusion,
): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      throw new Error('fault conclusion not on api')
    },
    () => mockApi.submitFaultConclusion(id, conclusion),
  )
}

export async function importToSimulation(_id: number): Promise<ApiResponse<SimulationParams>> {
  return withMockFallback(
    async () => {
      throw new Error('import not on api')
    },
    () => mockApi.importToSimulation(),
  )
}

export async function getSimulationRuns(_params: {
  pageNum: number
  pageSize: number
}): Promise<ApiResponse<PageResult<SimulationRun>>> {
  return withMockFallback(
    async () => {
      throw new Error('runs not on api')
    },
    () => mockApi.getSimulationRuns(),
  )
}

export async function getCockpitKpi(): Promise<ApiResponse<Record<string, unknown>>> {
  return withMockFallback(
    async () => {
      throw new Error('kpi not on api')
    },
    () => mockApi.getCockpitKpi(),
  )
}

export async function getPhysicsGuardSummary(): Promise<ApiResponse<PhysicsGuardSummary>> {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PhysicsGuardSummary>>(
        `${import.meta.env.VITE_API_V1_PREFIX ?? '/v1'}/settings/physics-guard`,
        { params: { reservoir_id: DEFAULT_RESERVOIR_ID } },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('physics guard failed')
      return body
    },
    () => mockApi.getPhysicsGuardSummary(),
  )
}

/** 按前端场景名匹配后端 scenario_id */
export function resolveScenarioId(
  scene: string,
  scenarios: SimulationScenarioItem[],
): { scenarioId: number; modelId: number } {
  const keywords: Record<string, string[]> = {
    normal: ['正常', '工况'],
    flood: ['洪水', '汛'],
    dry: ['枯水'],
    rainstorm: ['暴雨'],
  }
  const keys = keywords[scene] ?? []
  const matched = scenarios.find(
    (s) =>
      s.status === 'active' &&
      keys.some((k) => s.name.includes(k) || (s.description ?? '').includes(k)),
  )
  const pick = matched ?? scenarios.find((s) => s.status === 'active') ?? scenarios[0]
  return {
    scenarioId: pick?.id ?? DEFAULT_SCENARIO_ID,
    modelId: pick?.model_id ?? DEFAULT_MODEL_ID,
  }
}

/** 将 9.4 结果点写入实时状态（仿真结束后） */
export function applyResultToRealtime(
  points: SimulationResultData['points'],
  durationSec: number,
): SimulationRealtimeData {
  if (!points.length) {
    return {
      status: 'finished',
      elapsedSec: durationSec,
      currentLevel: 0,
      currentDownstreamLevel: 0,
      currentFlow: 0,
      currentOpening: 0,
      historyLevels: [],
      historyFlows: [],
    }
  }
  const last = points[points.length - 1].values
  const historyLevels = points.map((p, i) => ({
    time: Math.round((i / Math.max(points.length - 1, 1)) * durationSec),
    value: p.values.upstream_level ?? 0,
  }))
  const historyFlows = points.map((p, i) => ({
    time: Math.round((i / Math.max(points.length - 1, 1)) * durationSec),
    value: p.values.inflow_rate ?? 0,
  }))
  return {
    status: 'finished',
    elapsedSec: durationSec,
    currentLevel: last.upstream_level ?? 0,
    currentDownstreamLevel: last.downstream_level ?? 0,
    currentFlow: last.inflow_rate ?? 0,
    currentOpening: Math.round(last.gate_opening ?? 0),
    historyLevels,
    historyFlows,
  }
}
