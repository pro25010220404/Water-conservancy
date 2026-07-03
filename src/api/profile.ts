// ============================================================
// 个人中心 API
// ============================================================
import http from './request'
import type {
  ApiResponse,
  PageResult,
  ProfileInfo,
  UpdateProfileParams,
  ChangePasswordParams,
  OperationLog,
} from '@/shared/types'

/** 获取个人资料 */
export function getProfile() {
  return http.get<ApiResponse<ProfileInfo>>('/profile')
}

/** 更新个人资料 */
export function updateProfile(data: UpdateProfileParams) {
  return http.put<ApiResponse<null>>('/profile', data)
}

/** 修改密码 */
export function changePassword(data: ChangePasswordParams) {
  return http.post<ApiResponse<null>>('/auth/change-pwd', data)
}

/** 操作日志列表 */
export function getOperationLogs(params?: {
  page?: number
  page_size?: number
  module?: string
  start_time?: string
  end_time?: string
}) {
  return http.get<ApiResponse<PageResult<OperationLog>>>('/profile/operation-logs', { params })
}
