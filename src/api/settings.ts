// ============================================================
// 系统设置 API
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

// ──────────── 告警阈值 ────────────

/** 获取阈值列表 */
export function getThresholds(params?: { reservoir_id?: number; metric?: string }) {
  return http.get<ApiResponse<ThresholdRule[]>>('/settings/thresholds', { params })
}

/** 更新阈值 */
export function updateThreshold(id: number, data: ThresholdUpdateParams) {
  return http.put<ApiResponse<null>>(`/settings/thresholds/${id}`, data)
}

// ──────────── 多目标权重 ────────────

/** 获取当前权重 */
export function getWeights() {
  return http.get<ApiResponse<WeightConfig>>('/settings/weights')
}

/** 更新权重 */
export function updateWeights(data: WeightUpdateParams) {
  return http.put<ApiResponse<null>>('/settings/weights', data)
}

// ──────────── AI 模型管理 ────────────

/** 获取模型列表 */
export function getModels(params?: {
  page?: number
  page_size?: number
  type?: string
  status?: string
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<ModelInfo>>>('/settings/models', { params })
}

/** 上传模型 */
export function uploadModel(formData: FormData) {
  return http.post<ApiResponse<ModelInfo>>('/settings/models/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/** 激活模型 */
export function activateModel(id: number, data?: ModelActivateParams) {
  return http.post<ApiResponse<null>>(`/settings/models/${id}/activate`, data)
}

/** 回滚模型 */
export function rollbackModel(id: number, data?: ModelRollbackParams) {
  return http.post<ApiResponse<null>>(`/settings/models/${id}/rollback`, data)
}

/** 删除模型 */
export function deleteModel(id: number) {
  return http.delete<ApiResponse<null>>(`/settings/models/${id}`)
}

/** 下发模型至边缘端 */
export function deployModel(id: number, data: ModelDeployParams) {
  return http.post<ApiResponse<null>>(`/settings/models/${id}/deploy`, data)
}

// ──────────── 用户管理 ────────────

/** 获取用户列表 */
export function getUsers(params?: {
  page?: number
  page_size?: number
  role_id?: number
  is_enabled?: number
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<SystemUser>>>('/settings/users', { params })
}

/** 创建用户 */
export function createUser(data: CreateUserParams) {
  return http.post<ApiResponse<null>>('/settings/users', data)
}

/** 更新用户 */
export function updateUser(id: number, data: UpdateUserParams) {
  return http.put<ApiResponse<null>>(`/settings/users/${id}`, data)
}

/** 重置密码 */
export function resetUserPassword(id: number, data?: ResetPasswordParams) {
  return http.post<ApiResponse<null>>(`/settings/users/${id}/reset-password`, data)
}

/** 锁定账号 */
export function lockUser(id: number, data: LockUserParams) {
  return http.post<ApiResponse<null>>(`/settings/users/${id}/lock`, data)
}

/** 解锁账号 */
export function unlockUser(id: number, data?: UnlockUserParams) {
  return http.post<ApiResponse<null>>(`/settings/users/${id}/unlock`, data)
}

/** 删除用户 */
export function deleteUser(id: number) {
  return http.delete<ApiResponse<null>>(`/settings/users/${id}`)
}
