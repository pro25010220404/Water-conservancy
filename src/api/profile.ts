// ============================================================
// 个人中心 API
// 按需求文档 6.4 节接口清单
// ⚠️ 后端暂未提供独立 /profile 接口，部分使用 Mock 降级
//    个人资料数据来自登录响应 + /v1/settings/users
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

/** 获取个人资料 — 数据来自登录响应缓存，暂无独立接口 */
export function getProfile() {
  return http.get<ApiResponse<ProfileInfo>>('/v1/settings/users/me')
}

/** 更新个人资料 */
export function updateProfile(data: UpdateProfileParams) {
  return http.put<ApiResponse<null>>('/v1/settings/users/me', data)
}

/** 上传头像 — 后端暂未提供，使用 Mock 降级 */
export function uploadAvatar(formData: FormData) {
  // 不手动设置 Content-Type，让浏览器自动生成带 boundary 的 multipart/form-data
  return http.post<ApiResponse<{ avatar_url: string }>>('/v1/settings/users/me/avatar', formData)
}

/** 修改密码 — 对接 POST /api/auth/change-pwd */
export function changePassword(data: ChangePasswordParams) {
  return http.post<ApiResponse<null>>('/auth/change-pwd', data)
}

/** 操作日志列表 — 对接 GET /api/login-logs */
export function getOperationLogs(params?: {
  page?: number
  page_size?: number
  start_time?: string
  end_time?: string
}) {
  return http.get<ApiResponse<PageResult<OperationLog>>>('/login-logs', { params })
}
