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
  }>>>('/login-logs', { params, signal, silent: true } as any)

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
  return http.put<ApiResponse<null>>(`${V1}/settings/users/${userId}`, data, { silent: true } as any)
}

/** 上传头像 — POST /api/v1/me/avatar，multipart/form-data */
export async function uploadAvatar(file: File): Promise<{ data: ApiResponse<{ avatar: string }> }> {
  const formData = new FormData()
  formData.append('avatar', file)

  // 原生 XHR：绕过 axios 拦截器，确保 multipart/form-data 原样发送
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${V1}/me/avatar`)
    xhr.timeout = 60000

    const token = localStorage.getItem('token')
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    // 不设 Content-Type，让浏览器自动带 multipart/form-data + boundary

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText || '{}')
        // HTTP 错误也正常 resolve（由调用方根据 body.code 判断），
        // 非 JSON 响应才 reject
        if (typeof body === 'object' && body !== null) {
          resolve({ data: body } as any)
        } else {
          reject(new Error('响应格式异常'))
        }
      } catch {
        reject(new Error('响应解析失败'))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.ontimeout = () => reject(new Error('上传超时'))
    xhr.send(formData)
  })
}

/**
 * 获取当前用户资料 — 用列表接口 keyword 查（后端 GET users/{id} 有 bug 暂不可用）
 * 用于页面刷新后回显后端最新数据
 */
export async function getMyProfile(userId: number, account?: string) {
  // 用列表接口 + keyword 过滤，后端 users/{id} 会崩 500
  const keyword = account || String(userId)
  const res = await http.get<ApiResponse<PageResult<{
    id: number
    account: string
    realname: string
    role_name: string
    role_code: string
    phone: string
    email?: string
    avatar?: string
    created_at: string
  }>>>(`${V1}/settings/users`, { params: { keyword, page: 1, page_size: 10 }, silent: true } as any)

  // 从列表中精确匹配当前用户
  const body = res.data
  if (body.code === 0 && body.data?.list) {
    const user = body.data.list.find((u) => u.id === userId) || body.data.list[0] || null
    if (user) {
      return {
        data: {
          code: 0,
          msg: 'ok',
          data: {
            id: user.id,
            account: user.account,
            realname: user.realname,
            role_name: user.role_name || user.role_code || '',
            phone: user.phone || '',
            email: user.email || '',
            avatar: user.avatar || '',
            created_at: user.created_at || '',
          },
          success: true,
        } as any,
      }
    }
  }

  // 列表也查不到 → 返回错误让调用方走兜底
  throw new Error('用户未找到')
}
