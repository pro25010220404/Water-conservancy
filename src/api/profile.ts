// ============================================================
// 个人中心 API
// 对接后端 §1.2 修改密码 + §1.3 登录日志 + §8.4.3 更新用户（总接口文档 v2.2）
//
// ⚠️ 后端缺失接口（需后端新增）：
//   - POST /api/v1/settings/users/me/avatar 上传头像
//   - GET  /api/v1/operation-logs           统一操作日志（当前用登录日志替代）
// ============================================================
import http from './request'
import type {
  ApiResponse,
  PageResult,
  ChangePasswordParams,
  UpdateProfileParams,
  OperationLog,
} from '@/shared/types'

/** v1 路径前缀，由 .env 中 VITE_API_V1_PREFIX 控制 */
const V1 = import.meta.env.VITE_API_V1_PREFIX ?? '/v1'

// ════════════════════════════════════════════════════════════
// 已对接后端
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// auth 模块接口不使用 /v1/ 前缀（后端文档路径为 /api/auth/*）
// ════════════════════════════════════════════════════════════

/** 修改密码 §1.2 POST /api/auth/change-pwd */
export function changePassword(data: ChangePasswordParams) {
  return http.post<ApiResponse<null>>('/auth/change-pwd', data)
}

/** 操作日志列表 §1.3 GET /api/login-logs */
export function getOperationLogs(params?: {
  page?: number
  page_size?: number
  module?: string
  start?: string
  end?: string
}) {
  return http.get<ApiResponse<PageResult<OperationLog>>>('/login-logs', { params })
}

// ════════════════════════════════════════════════════════════
// settings 模块接口使用 /v1/ 前缀
// ════════════════════════════════════════════════════════════

/**
 * 更新个人资料 §8.4.3 PUT /api/settings/users/{id}
 * 用户 ID 来自登录响应 user_info.id
 */
export function updateProfile(userId: number, data: UpdateProfileParams) {
  return http.put<ApiResponse<null>>(`${V1}/settings/users/${userId}`, data)
}

/** 上传头像 — POST /api/v1/me/avatar */
export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post<ApiResponse<{ avatar_url: string }>>(`${V1}/me/avatar`, formData)
}
