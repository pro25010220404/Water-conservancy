// ============================================================
// 系统设置 API
// 对接后端 §8 系统设置模块 + §12 物理配置（总接口文档 v2.2）
// ============================================================
import http from './request'
import type {
  ApiResponse,
  PageResult,
  ThresholdRule,
  ThresholdUpdateParams,
  WeightConfig,
  WeightUpdateParams,
  ModelInfo,
  ModelActivateParams,
  ModelRollbackParams,
  ModelDeployParams,
  SystemUser,
  CreateUserParams,
  UpdateUserParams,
  ResetPasswordParams,
  LockUserParams,
  UnlockUserParams,
} from '@/shared/types'
import type { WeightHistoryItem } from '@/stores/settings'
import type {
  HealthOverview,
  TrendPoint,
  MetricsDetailItem,
  CompareResult,
} from '@/stores/aiHealth'
import type { PhysicsGuardConfig, ConfigHistoryItem } from '@/stores/physicsGuard'
import type { InterlockRule } from '@/stores/gateInterlock'
import type { AIHealthOverviewResponse } from '@/types/gateai'
import type { ApiInterlockRule, ApiInterlockStat } from './interlockAdapter'

/** v1 路径前缀，由 .env 中 VITE_API_V1_PREFIX 控制 */
const V1 = import.meta.env.VITE_API_V1_PREFIX ?? '/v1'

// ════════════════════════════════════════════════════════════
// Tab1: 告警阈值 §8.1
// ════════════════════════════════════════════════════════════

export function getThresholds(params?: { reservoir_id?: number; metric?: string }) {
  return http.get<ApiResponse<ThresholdRule[]>>(`${V1}/settings/thresholds`, { params })
}

export function updateThreshold(id: number, data: ThresholdUpdateParams) {
  return http.put<ApiResponse<null>>(`${V1}/settings/thresholds/${id}`, data)
}

// ════════════════════════════════════════════════════════════
// Tab2: 多目标权重 §8.2
// ════════════════════════════════════════════════════════════

export function getWeights() {
  return http.get<ApiResponse<WeightConfig>>(`${V1}/settings/weights`)
}

export function updateWeights(data: WeightUpdateParams) {
  return http.put<ApiResponse<null>>(`${V1}/settings/weights`, data)
}

export function getWeightHistory(params?: { page?: number; page_size?: number }) {
  return http.get<ApiResponse<WeightHistoryItem[]>>(`${V1}/settings/weights/history`, { params })
}

// ════════════════════════════════════════════════════════════
// Tab3: AI 模型管理 §8.3
// ════════════════════════════════════════════════════════════

export function getModels(params?: {
  page?: number
  page_size?: number
  type?: string
  status?: string
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<ModelInfo>>>(`${V1}/settings/models`, { params })
}

export function uploadModel(formData: FormData) {
  return http.post<ApiResponse<ModelInfo>>(`${V1}/settings/models/upload`, formData)
}

export function activateModel(id: number, data?: ModelActivateParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/models/${id}/activate`, data)
}

export function rollbackModel(id: number, data?: ModelRollbackParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/models/${id}/rollback`, data)
}

export function deleteModel(id: number) {
  return http.delete<ApiResponse<null>>(`${V1}/settings/models/${id}`)
}

export function deployModel(id: number, data: ModelDeployParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/models/${id}/deploy`, data)
}

export function getModelDetail(id: number) {
  return http.get<ApiResponse<ModelInfo>>(`${V1}/settings/models/${id}`)
}

// ════════════════════════════════════════════════════════════
// Tab4: AI 模型健康度（前端扩展，后端文档暂未定义）
// ════════════════════════════════════════════════════════════

export function getAIMetrics(params: { reservoir_id: number }) {
  return http.get<ApiResponse<HealthOverview>>(`${V1}/settings/ai/metrics`, { params })
}

export function getAIMetricsHistory(params: { reservoir_id: number; days?: number }) {
  return http.get<ApiResponse<AIMetricsHistoryItem[]>>(`${V1}/settings/ai/metrics/history`, { params })
}

/** 历史趋势单条记录（与后端字段一致） */
export interface AIMetricsHistoryItem {
  metric_time: string
  prediction_score: number
  decision_score: number
  compliance_score: number
  overall_score: number
  health_grade: string
  water_level_mae_24h?: number
  physics_correction_rate?: number
  safety_override_rate?: number
  avg_physics_violation?: number
}

export function getAIHealthOverview() {
  return http.get<ApiResponse<AIHealthOverviewResponse>>(`${V1}/settings/ai/health`)
}

/** 模型指标明细（Apifox: GET 模型指标明细；若后端未部署则 404） */
export function getAIMetricsDetail(params: {
  reservoir_id: number
  page?: number
  page_size?: number
}) {
  return http.get<ApiResponse<PageResult<MetricsDetailItem> | MetricsDetailItem[]>>(
    `${V1}/settings/ai/metrics/detail`,
    { params },
  )
}

export function getAIVersionCompare(params: {
  reservoir_id: number
  version1: string
  version2: string
}) {
  return http.get<ApiResponse<CompareResult>>(`${V1}/settings/ai/compare`, { params })
}

// ════════════════════════════════════════════════════════════
// Tab5: 物理防护配置 §12 物理配置接口
// ════════════════════════════════════════════════════════════

export function getPhysicsGuard(params: { reservoir_id: number }) {
  return http.get<ApiResponse<PhysicsGuardConfig>>(`${V1}/settings/physics-guard`, { params })
}

export function updatePhysicsGuard(id: number, data: Partial<PhysicsGuardConfig>) {
  return http.put<ApiResponse<{ new_version: string }>>(`${V1}/settings/physics-guard/${id}`, data)
}

export function getPhysicsGuardHistory(params: { reservoir_id: number }) {
  return http.get<ApiResponse<ConfigHistoryItem[]>>(`${V1}/settings/physics-guard/history`, {
    params,
  })
}

export function rollbackPhysicsGuard(id: number) {
  return http.post<ApiResponse<{ new_version: string }>>(
    `${V1}/settings/physics-guard/${id}/rollback`,
  )
}

export function clonePhysicsGuard(data: {
  source_reservoir_id: number
  target_reservoir_id: number
}) {
  return http.post<ApiResponse<PhysicsGuardConfig>>(`${V1}/settings/physics-guard/clone`, data)
}

// ════════════════════════════════════════════════════════════
// Tab6: 闸门互锁规则（前端扩展，后端文档暂未定义）
// ════════════════════════════════════════════════════════════

export function getInterlockRules(params: { reservoir_id: number }) {
  return http.get<ApiResponse<InterlockRule[]>>(`${V1}/settings/gate-interlock/rules`, { params })
}

export function updateInterlockRule(id: number, data: Record<string, unknown>) {
  return http.put<ApiResponse<ApiInterlockRule>>(`${V1}/settings/gate-interlock/rules/${id}`, data)
}

export function toggleInterlockRule(id: number, enabled: boolean) {
  return http.post<ApiResponse<ApiInterlockRule>>(
    `${V1}/settings/gate-interlock/rules/${id}/toggle`,
    { enabled },
  )
}

export function getInterlockLogs(params: {
  reservoir_id: number
  page?: number
  page_size?: number
  rule_ids?: number[]
  start_time?: string
  end_time?: string
}) {
  return http.get<ApiResponse<PageResult<import('@/types/gateai').GateInterlockLogApiItem>>>(
    `${V1}/settings/gate-interlock/logs`,
    { params },
  )
}

export function getInterlockStats(params: { reservoir_id: number; days?: number }) {
  return http.get<ApiResponse<ApiInterlockStat[]>>(`${V1}/settings/gate-interlock/stats`, { params })
}

// ════════════════════════════════════════════════════════════
// Tab7: 用户管理 §8.4
// ════════════════════════════════════════════════════════════

export function getUsers(params?: {
  page?: number
  page_size?: number
  role_id?: number
  is_enabled?: number
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<SystemUser>>>(`${V1}/settings/users`, { params })
}

export function createUser(data: CreateUserParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/users`, data)
}

export function updateUser(id: number, data: UpdateUserParams) {
  return http.put<ApiResponse<null>>(`${V1}/settings/users/${id}`, data)
}

export function resetUserPassword(id: number, data?: ResetPasswordParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/users/${id}/reset-password`, data)
}

export function lockUser(id: number, data: LockUserParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/users/${id}/lock`, data)
}

export function unlockUser(id: number, data?: UnlockUserParams) {
  return http.post<ApiResponse<null>>(`${V1}/settings/users/${id}/unlock`, data)
}

export function deleteUser(id: number) {
  return http.delete<ApiResponse<null>>(`${V1}/settings/users/${id}`)
}
