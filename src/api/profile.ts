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

/**
 * 操作日志列表 — 对接 §1.3 GET /api/login-logs，前端做字段映射
 */
export async function getOperationLogs(params?: {
  page?: number
  page_size?: number
  start_time?: string
  end_time?: string
}, signal?: AbortSignal): Promise<{ data: ApiResponse<PageResult<OperationLog>> }> {
  const res = await http.get<ApiResponse<PageResult<{
    id: number
    user_realname: string
    login_ip: string
    login_status: number
    fail_reason: string
    created_at: string
  }>>>('/login-logs', { params, signal })

  // 登录日志 → 操作日志 字段映射
  const body = res.data
  if (body.code === 0 && body.data) {
    body.data.list = (body.data.list ?? []).map((item) => ({
      id: item.id,
      time: item.created_at ?? '',
      module: '登录认证',
      type: item.login_status === 1 ? '登录' : '登录失败',
      description: item.login_status === 1
        ? `${item.user_realname ?? '-'} 登录成功 (IP: ${item.login_ip ?? '-'})`
        : `${item.user_realname ?? '-'} 登录失败${item.fail_reason ? `（${item.fail_reason}）` : ''} (IP: ${item.login_ip ?? '-'})`,
      result: item.login_status === 1 ? 1 : 0,
    })) as unknown as OperationLog[]
  }
  return { data: body as ApiResponse<PageResult<OperationLog>> }
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

/** 上传头像 — POST /api/v1/me/avatar，multipart/form-data，字段名 file */
export function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return http.post<ApiResponse<{ avatar: string }>>(`${V1}/me/avatar`, formData, { timeout: 60000, silent: true } as any)
}

/**
 * 获取当前用户资料 — GET /api/v1/settings/users/{id}
 * 用于页面刷新后回显后端最新数据
 */
export function getMyProfile(userId: number) {
  return http.get<ApiResponse<{
    id: number
    account: string
    realname: string
    role_name: string
    phone: string
    email?: string
    created_at: string
  }>>(`${V1}/settings/users/${userId}`)
}
