// ============================================================
// 系统设置 API
// 按需求文档 5.10 节接口清单
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
import type { InterlockRule, InterlockLog, InterlockStats } from '@/stores/gateInterlock'

// ════════════════════════════════════════════════════════════
// Tab1: 告警阈值
// ════════════════════════════════════════════════════════════

export function getThresholds(params?: { reservoir_id?: number; metric?: string }) {
  return http.get<ApiResponse<ThresholdRule[]>>('/v1/settings/thresholds', { params })
}

export function updateThreshold(id: number, data: ThresholdUpdateParams) {
  return http.put<ApiResponse<null>>(`/v1/settings/thresholds/${id}`, data)
}

// ════════════════════════════════════════════════════════════
// Tab2: 多目标权重
// ════════════════════════════════════════════════════════════

export function getWeights() {
  return http.get<ApiResponse<WeightConfig>>('/v1/settings/weights')
}

export function updateWeights(data: WeightUpdateParams) {
  return http.put<ApiResponse<null>>('/v1/settings/weights', data)
}

export function getWeightHistory(params?: { page?: number; page_size?: number }) {
  return http.get<ApiResponse<WeightHistoryItem[]>>('/v1/settings/weights/history', { params })
}

// ════════════════════════════════════════════════════════════
// Tab3: AI 模型管理
// ════════════════════════════════════════════════════════════

export function getModels(params?: {
  page?: number
  page_size?: number
  type?: string
  status?: string
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<ModelInfo>>>('/v1/settings/models', { params })
}

export function uploadModel(formData: FormData) {
  return http.post<ApiResponse<ModelInfo>>('/v1/settings/models/upload', formData)
}

export function activateModel(id: number, data?: ModelActivateParams) {
  return http.post<ApiResponse<null>>(`/v1/settings/models/${id}/activate`, data)
}

export function rollbackModel(id: number, data?: ModelRollbackParams) {
  return http.post<ApiResponse<null>>(`/v1/settings/models/${id}/rollback`, data)
}

export function deleteModel(id: number) {
  return http.delete<ApiResponse<null>>(`/v1/settings/models/${id}`)
}

export function deployModel(id: number, data: ModelDeployParams) {
  return http.post<ApiResponse<null>>(`/v1/settings/models/${id}/deploy`, data)
}

export function getModelDetail(id: number) {
  return http.get<ApiResponse<ModelInfo>>(`/v1/settings/models/${id}`)
}

// ════════════════════════════════════════════════════════════
// Tab4: AI 模型健康度
// ════════════════════════════════════════════════════════════

export function getAIMetrics(params: { reservoir_id: number }) {
  return http.get<ApiResponse<HealthOverview>>('/v1/settings/ai/metrics', { params })
}

export function getAIMetricsHistory(params: { reservoir_id: number; days?: number }) {
  return http.get<ApiResponse<TrendPoint[]>>('/v1/settings/ai/metrics/history', { params })
}

export function getAIHealthOverview() {
  return http.get<ApiResponse<HealthOverview[]>>('/v1/settings/ai/health')
}

export function getAIMetricsDetail(params: {
  reservoir_id: number
  page?: number
  page_size?: number
}) {
  return http.get<ApiResponse<PageResult<MetricsDetailItem>>>('/v1/settings/ai/metrics/detail', {
    params,
  })
}

export function getAIVersionCompare(params: {
  reservoir_id: number
  version1: string
  version2: string
}) {
  return http.get<ApiResponse<CompareResult>>('/v1/settings/ai/compare', { params })
}

// ════════════════════════════════════════════════════════════
// Tab5: 物理防护配置
// ════════════════════════════════════════════════════════════

export function getPhysicsGuard(params: { reservoir_id: number }) {
  return http.get<ApiResponse<PhysicsGuardConfig>>('/v1/settings/physics-guard', { params })
}

export function updatePhysicsGuard(id: number, data: Partial<PhysicsGuardConfig>) {
  return http.put<ApiResponse<{ new_version: string }>>(`/v1/settings/physics-guard/${id}`, data)
}

export function getPhysicsGuardHistory(params: { reservoir_id: number }) {
  return http.get<ApiResponse<ConfigHistoryItem[]>>('/v1/settings/physics-guard/history', {
    params,
  })
}

export function rollbackPhysicsGuard(id: number) {
  return http.post<ApiResponse<{ new_version: string }>>(
    `/v1/settings/physics-guard/${id}/rollback`,
  )
}

export function clonePhysicsGuard(data: {
  source_reservoir_id: number
  target_reservoir_id: number
}) {
  return http.post<ApiResponse<PhysicsGuardConfig>>('/v1/settings/physics-guard/clone', data)
}

// ════════════════════════════════════════════════════════════
// Tab6: 闸门互锁规则
// ════════════════════════════════════════════════════════════

export function getInterlockRules(params: { reservoir_id: number }) {
  return http.get<ApiResponse<InterlockRule[]>>('/v1/settings/gate-interlock/rules', { params })
}

export function updateInterlockRule(id: number, data: Partial<InterlockRule>) {
  return http.put<ApiResponse<null>>(`/v1/settings/gate-interlock/rules/${id}`, data)
}

export function toggleInterlockRule(id: number) {
  return http.post<ApiResponse<{ is_enabled: boolean }>>(
    `/v1/settings/gate-interlock/rules/${id}/toggle`,
  )
}

export function getInterlockLogs(params: {
  reservoir_id: number
  page?: number
  page_size?: number
  rule_ids?: number[]
  start?: string
  end?: string
}) {
  return http.get<ApiResponse<PageResult<InterlockLog>>>('/v1/settings/gate-interlock/logs', {
    params,
  })
}

export function getInterlockStats(params: { reservoir_id: number; days?: number }) {
  return http.get<ApiResponse<InterlockStats[]>>('/v1/settings/gate-interlock/stats', { params })
}

// ════════════════════════════════════════════════════════════
// Tab7: 用户管理
// ════════════════════════════════════════════════════════════

export function getUsers(params?: {
  page?: number
  page_size?: number
  role_id?: number
  is_enabled?: number
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<SystemUser>>>('/v1/settings/users', { params })
}

export function createUser(data: CreateUserParams) {
  return http.post<ApiResponse<null>>('/v1/settings/users', data)
}

export function updateUser(id: number, data: UpdateUserParams) {
  return http.put<ApiResponse<null>>(`/v1/settings/users/${id}`, data)
}

export function resetUserPassword(id: number, data?: ResetPasswordParams) {
  return http.post<ApiResponse<null>>(`/v1/settings/users/${id}/reset-password`, data)
}

export function lockUser(id: number, data: LockUserParams) {
  return http.post<ApiResponse<null>>(`/v1/settings/users/${id}/lock`, data)
}

export function unlockUser(id: number, data?: UnlockUserParams) {
  return http.post<ApiResponse<null>>(`/v1/settings/users/${id}/unlock`, data)
}

export function deleteUser(id: number) {
  return http.delete<ApiResponse<null>>(`/v1/settings/users/${id}`)
}
