// ============================================================
// 个人中心 API
// 按需求文档 6.4 节接口清单
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

/** 上传头像 */
export function uploadAvatar(formData: FormData) {
  return http.post<ApiResponse<{ avatar_url: string }>>('/profile/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
  start?: string
  end?: string
}) {
  return http.get<ApiResponse<PageResult<OperationLog>>>('/login-logs', { params })
}
