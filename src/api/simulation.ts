// ============================================================
// 数字孪生 — API 接口层（真实接口优先，失败回退 Mock）
// ============================================================
import http from './request'
import type { ApiResponse, PageResult } from '@/shared/types'
import type {
  SimulationParams,
  SimulationRealtimeData,
  SimulationReport,
  SimulationStartPayload,
  SimulationStartResult,
  SimulationScenarioItem,
  SimulationScenarioPayload,
  SimulationResultData,
  SimulationScene,
  AiModel,
  TrainingConfig,
  FaultReview,
  FaultConclusion,
} from '@/types/simulation'
import type { PhysicsGuardSummary } from '@/types/dispatch'
import { mockApi } from './mockStore'
import {
  mapBackendScenario,
  mapBackendIncident,
  incidentToSimulationParams,
  toBackendIncidentQuery,
  buildSimulationReport,
  type BackendScenarioItem,
  type BackendIncidentItem,
  type BackendReportTask,
} from './simulationAdapter'
import {
  getModels as getSettingsModels,
  uploadModel as uploadSettingsModel,
  activateModel as activateSettingsModel,
} from './settings'
import type { ModelInfo } from '@/shared/types'

// ── ModelInfo（settings API）→ AiModel（simulation 类型）映射 ──
function modelInfoToAiModel(m: ModelInfo): AiModel {
  const typeMap: Record<string, AiModel['type']> = {
    lstm_prediction: 'LSTM',
    dqn_decision: 'DQN',
    fault_detection: 'LSTM',
    general: 'DQN',
  }
  const statusMap: Record<string, AiModel['status']> = {
    uploaded: 'inactive',
    validating: 'validating',
    ready: 'inactive',
    active: 'active',
    deprecated: 'inactive',
  }
  return {
    id: m.id,
    type: typeMap[m.type] ?? 'LSTM',
    version: m.version,
    filePath: '',
    status: statusMap[m.status] ?? 'inactive',
    metrics: {
      accuracy: m.accuracy ?? 0,
      overallScore: m.overall_score ?? 0,
      healthGrade: (m.health_grade as 'S' | 'A' | 'B' | 'C' | 'D') ?? 'B',
    },
    remark: null,
    createdAt: m.training_date ?? '',
    activatedAt: m.is_active ? new Date().toISOString() : null,
  }
}

const V1_PREFIX = import.meta.env.VITE_API_V1_PREFIX ?? '/v1'
// 场景列表 GET 无 v1；创建/更新/删除用 v1（Apifox §9.1 vs §9.2-9.4）
const SIM_V1_BASE = `${V1_PREFIX}/simulation`
// 仿真接口统一走 /api/v1/simulation/*
const SIM_BASE = '/simulation'
const REPORTS_STORAGE_KEY = 'simulation_reports_v1'
const DEFAULT_RESERVOIR_ID = 1
const DEFAULT_MODEL_ID = 2
const DEFAULT_SCENARIO_ID = 1

/** 列表拉取后缓存，供详情 / 导入仿真回退 */
const incidentCache = new Map<number, BackendIncidentItem>()

function cacheIncidents(list: BackendIncidentItem[]) {
  list.forEach((item) => incidentCache.set(item.id, item))
}

// 9.6 故障复盘 — 固定 GET /api/v1/simulation/incidents
const INCIDENTS_V1 = `${SIM_V1_BASE}/incidents`

async function fetchIncidentById(id: number): Promise<BackendIncidentItem | null> {
  const cached = incidentCache.get(id)
  if (cached) return cached

  try {
    const res = await http.get<ApiResponse<PageResult<BackendIncidentItem>>>(INCIDENTS_V1, {
      params: { page: 1, page_size: 100, reservoir_id: DEFAULT_RESERVOIR_ID },
    })
    const body = unwrap(res)
    const list = body?.data?.list ?? []
    cacheIncidents(list)
    return list.find((item) => item.id === id) ?? null
  } catch {
    return null
  }
}

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

function loadStoredReports(): SimulationReport[] {
  try {
    const raw = localStorage.getItem(REPORTS_STORAGE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as SimulationReport[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveStoredReport(report: SimulationReport) {
  const list = loadStoredReports().filter((r) => r.id !== report.id)
  list.unshift(report)
  localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(list.slice(0, 50)))
}

/** 生产/联调统一走 /api/v1/simulation/* */
function simPaths(suffix: string): string[] {
  return [`${SIM_V1_BASE}${suffix}`]
}

async function getSimPaths<T>(
  paths: string[],
  config?: { params?: Record<string, unknown> },
): Promise<ApiResponse<T>> {
  let lastErr: unknown
  for (const path of paths) {
    try {
      const res = await http.get<ApiResponse<T>>(path, config)
      const body = unwrap(res)
      if (body) return body
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('request failed')
}

async function postSimPaths<T>(paths: string[], data?: unknown): Promise<ApiResponse<T>> {
  let lastErr: unknown
  for (const path of paths) {
    try {
      const res = await http.post<ApiResponse<T>>(path, data)
      const body = unwrap(res)
      if (body) return body
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('request failed')
}

async function putSimPaths<T>(paths: string[], data?: unknown): Promise<ApiResponse<T>> {
  let lastErr: unknown
  for (const path of paths) {
    try {
      const res = await http.put<ApiResponse<T>>(path, data)
      const body = unwrap(res)
      if (body) return body
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('request failed')
}

/** 结果/报告接口：优先 v1（生产 4088），再试无 v1 */
async function getSimulationResultApi(simulationId: string) {
  return getSimPaths<SimulationResultData>(
    simPaths(`/${simulationId}/result`),
    { params: { aggregation: 'raw' } },
  )
}

async function postSimulationReportApi(
  simulationId: string,
  body: { report_type: string; format: string; include_charts: boolean },
) {
  return postSimPaths<BackendReportTask>(simPaths(`/${simulationId}/report`), body)
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

/** 9.1 仿真场景列表 — GET /api/v1/simulation/scenarios */
export async function getSimulationScenarios(params?: {
  page?: number
  page_size?: number
  keyword?: string
}): Promise<ApiResponse<PageResult<SimulationScenarioItem>>> {
  const queryParams = { page: 1, page_size: 50, ...params }

  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<BackendScenarioItem>>>(
        `${SIM_V1_BASE}/scenarios`,
        { params: queryParams },
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('scenarios failed')
      const list = (body.data.list ?? []).map(mapBackendScenario)
      return { ...body, data: { list, total: body.data.total ?? list.length } }
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
      },
    }),
  )
}

/** 创建仿真场景（不走 Mock 假成功） */
export async function createSimulationScenario(
  payload: SimulationScenarioPayload,
): Promise<ApiResponse<SimulationScenarioItem>> {
  const res = await http.post<ApiResponse<BackendScenarioItem>>(
    `${SIM_V1_BASE}/scenarios`,
    payload,
  )
  const body = unwrap(res)
  if (!body?.data) throw new Error('创建场景失败')
  return { ...body, data: mapBackendScenario(body.data) }
}

/** 更新仿真场景 */
export async function updateSimulationScenario(
  id: number,
  payload: Partial<SimulationScenarioPayload>,
): Promise<ApiResponse<SimulationScenarioItem>> {
  return withMockFallback(
    async () => {
      const res = await http.put<ApiResponse<BackendScenarioItem>>(
        `${SIM_V1_BASE}/scenarios/${id}`,
        payload,
      )
      const body = unwrap(res)
      if (!body?.data) throw new Error('update scenario failed')
      return { ...body, data: mapBackendScenario(body.data) }
    },
    async () => ({
      code: 0,
      msg: 'ok',
      success: true,
      trace_id: 'mock-update-scenario',
      data: {
        id,
        name: payload.name ?? '场景',
        type: payload.type ?? 'production',
        status: payload.status ?? 'draft',
        model_id: payload.model_id ?? null,
      },
    }),
  )
}

/** 删除仿真场景（不走 Mock 降级，避免假成功） */
export async function deleteSimulationScenario(id: number): Promise<ApiResponse<null>> {
  const res = await http.delete<ApiResponse<null>>(`${SIM_V1_BASE}/scenarios/${id}`)
  const body = unwrap(res)
  if (!body) throw new Error('删除场景失败')
  return body
}

/** 9.2 启动仿真 */
export async function startSimulation(
  params: SimulationStartPayload,
): Promise<ApiResponse<SimulationStartResult>> {
  return withMockFallback(
    async () => {
      const body = await postSimPaths<SimulationStartResult>(simPaths('/start'), toStartBody(params))
      if (!body.data?.simulation_id) throw new Error('start failed')
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
  return getSimulationResultApi(simulationId)
}

export async function pauseSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => postSimPaths<null>(simPaths('/pause')),
    () => mockApi.pauseSimulation(),
  )
}

export async function resumeSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => postSimPaths<null>(simPaths('/resume')),
    () => mockApi.resumeSimulation(),
  )
}

export async function resetSimulation(): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => postSimPaths<null>(simPaths('/reset')),
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
    async () =>
      putSimPaths<null>(simPaths('/gate'), { gate_opening: Math.round(opening) }),
    () => mockApi.setGateOpening(opening),
  )
}

export async function getModelList(): Promise<ApiResponse<AiModel[]>> {
  return withMockFallback(
    async () => {
      const res = await getSettingsModels({ page: 1, page_size: 100, status: 'active' })
      if (res.data?.code === 0 && res.data?.data) {
        const list = res.data.data.list ?? []
        return {
          code: 0,
          msg: 'ok',
          success: true,
          trace_id: res.data.trace_id,
          data: list.map(modelInfoToAiModel),
        }
      }
      throw new Error('模型列表为空')
    },
    () => mockApi.getModelList(),
  )
}

export async function uploadModel(formData: FormData): Promise<ApiResponse<AiModel>> {
  return withMockFallback(
    async () => {
      const res = await uploadSettingsModel(formData)
      if (res.data?.code === 0 && res.data?.data) {
        return {
          code: 0,
          msg: 'ok',
          success: true,
          trace_id: res.data.trace_id,
          data: modelInfoToAiModel(res.data.data),
        }
      }
      throw new Error('上传模型失败')
    },
    () => mockApi.uploadModel(),
  )
}

export async function activateModel(id: number): Promise<ApiResponse<null>> {
  return withMockFallback(
    async () => {
      const res = await activateSettingsModel(id)
      if (res.data?.code === 0) {
        return { code: 0, msg: 'ok', success: true, trace_id: res.data.trace_id, data: null }
      }
      throw new Error('激活模型失败')
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

export async function generateReport(
  simulationId: string | number,
  context?: {
    scene?: SimulationScene
    params?: SimulationParams
    operatorName?: string
  },
): Promise<ApiResponse<SimulationReport>> {
  const id = String(simulationId)
  const reportTask = await postSimulationReportApi(id, {
    report_type: 'full',
    format: 'pdf',
    include_charts: true,
  })

  const resultRes = await getSimulationResultApi(id)
  const summary = resultRes.data.summary ?? {}

  const report = buildSimulationReport({
    simulationId: id,
    scene: context?.scene ?? 'normal',
    simParams: context?.params ?? {
      scene: 'normal',
      initialLevel: summary.max_upstream_level ?? 380,
      inflowRate: summary.max_inflow_rate ?? 1900,
      durationMin: 60,
    },
    resultSummary: summary,
    downloadUrl: reportTask.data?.download_url ?? null,
    operatorName: context?.operatorName ?? '当前用户',
    reportId: reportTask.data?.report_id,
  })

  saveStoredReport(report)
  return {
    code: 0,
    msg: reportTask.msg || '报告已生成',
    success: true,
    trace_id: reportTask.trace_id,
    data: report,
  }
}

export async function getReportList(_params: {
  pageNum: number
  pageSize: number
  scene?: string
}): Promise<ApiResponse<PageResult<SimulationReport>>> {
  const list = loadStoredReports()
  return {
    code: 0,
    msg: 'ok',
    success: true,
    trace_id: 'local-reports',
    data: { list, total: list.length, pageNum: 1, pageSize: list.length || 10 },
  }
}

export async function downloadReport(id: number): Promise<Blob> {
  const report = loadStoredReports().find((r) => r.id === id)
  if (!report?.filePath) {
    throw new Error('报告暂无下载地址，请稍后重试或联系管理员')
  }

  const token = localStorage.getItem('token')
  const url = report.filePath.startsWith('http')
    ? report.filePath
    : `${import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') ?? ''}${report.filePath}`

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`下载失败 (${res.status})`)
  return await res.blob()
}

export async function getFaultReviewList(params: {
  pageNum: number
  pageSize: number
  type?: string
  startTime?: string
  endTime?: string
}): Promise<ApiResponse<PageResult<FaultReview>>> {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PageResult<BackendIncidentItem>>>(INCIDENTS_V1, {
        params: toBackendIncidentQuery(params),
      })
      const body = unwrap(res)
      if (!body?.data) throw new Error('incidents failed')
      const list = body.data.list ?? []
      cacheIncidents(list)
      return {
        ...body,
        data: {
          list: list.map(mapBackendIncident),
          total: body.data.total ?? list.length,
        },
      }
    },
    () => mockApi.getFaultReviewList(params),
  )
}

export async function getFaultReviewDetail(id: number): Promise<ApiResponse<FaultReview>> {
  return withMockFallback(
    async () => {
      const raw = await fetchIncidentById(id)
      if (!raw) throw new Error('incident not found')
      return { code: 0, msg: 'ok', success: true, trace_id: '', data: mapBackendIncident(raw) }
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

export async function importToSimulation(id: number): Promise<ApiResponse<SimulationParams>> {
  return withMockFallback(
    async () => {
      // 先用 GET 获取故障详情
      const raw = await fetchIncidentById(id)
      if (!raw) throw new Error('incident not found')
      // 再调 POST /api/simulation/import-incident 触发后端导入
      try {
        await http.post(`${SIM_BASE}/import-incident`, {
          incident_name: raw.incident_name ?? `故障 #${id}`,
          severity: raw.severity ?? 'medium',
          equipment_id: raw.equipment_id,
          occurred_at: raw.occurred_at,
          raw_data: raw,
        })
      } catch {
        // import-incident 接口可选降级，不影响结果
      }
      return {
        code: 0,
        msg: 'ok',
        success: true,
        trace_id: '',
        data: incidentToSimulationParams(raw),
      }
    },
    () => mockApi.importToSimulation(),
  )
}

export async function getPhysicsGuardSummary(): Promise<ApiResponse<PhysicsGuardSummary>> {
  return withMockFallback(
    async () => {
      const res = await http.get<ApiResponse<PhysicsGuardSummary>>(
        `${import.meta.env.VITE_API_V1_PREFIX ?? '/v1'}/admin/physics-guard`,
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
    dry: ['枯水', '淡水'],
    rainstorm: ['暴雨'],
  }
  const typeMap: Record<string, string> = {
    normal: 'production',
    flood: 'production',
    dry: 'energy',
    rainstorm: 'production',
  }
  const keys = keywords[scene] ?? []
  const matched = scenarios.find(
    (s) =>
      (s.status === 'active' || s.status === 'draft') &&
      (s.type === typeMap[scene] ||
        keys.some((k) => s.name.includes(k) || (s.description ?? '').includes(k))),
  )
  const pick =
    matched ??
    scenarios.find((s) => s.status === 'active') ??
    scenarios.find((s) => s.status === 'draft') ??
    scenarios[0]
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
