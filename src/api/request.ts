// ============================================================
// Axios 请求封装 — 统一拦截器 / baseURL / 错误处理
// ============================================================
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { ApiBusinessError } from '@/utils/apiError'

const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ── 请求拦截：附加 Token，FormData 上传时去掉 JSON Content-Type ──
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // 登录接口不携带旧 token，避免后端误判为 token 过期
  const isLoginRequest = config.url?.includes('/auth/login')
  if (!isLoginRequest) {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  if (config.data instanceof FormData) {
    // 必须用 delete 彻底移除 Content-Type，让浏览器自动设 multipart/form-data + boundary
    // 设 undefined 在 AxiosHeaders 实例上不一定覆盖默认值，导致文件字段丢失 → 后端 400
    delete (config.headers as any)['Content-Type']
  }
  return config
})

// ── 响应拦截：统一错误处理 ──
http.interceptors.response.use(
  (response: AxiosResponse) => {
    const data = response.data
    // 业务级错误（仅当 data 是 JSON 对象时处理）
    if (data && typeof data === 'object' && data.code !== undefined && data.code !== 0) {
      // 认证类错误：只 reject，不删 token（删 token 会导致误登出）
      if (data.code >= 20001 && data.code <= 20008) {
        if (import.meta.env.DEV) {
          console.warn('[API] 业务认证错误 (code=' + data.code + '): ' + data.msg)
        }
        return Promise.reject(new ApiBusinessError(data.code, data.msg || '认证失败', data.data))
      }
      // 业务错误不弹 toast，由调用方决定是否提示
      return Promise.reject(new ApiBusinessError(data.code, data.msg || '请求失败', data.data))
    }
    return response
  },
  (error) => {
    // 请求被取消（如防抖）不提示
    if (axios.isCancel(error)) return Promise.reject(error)

    if (error.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请稍后重试')
    } else if (!error.response) {
      // 网络不通时静默失败，由各页面 mock 降级处理
      // 仅在开发环境 console 输出，不弹 toast 打断用户
      if (import.meta.env.DEV) {
        console.warn('[API] 网络不可达，使用 Mock 降级:', error.config?.url)
      }
    } else {
      const status = error.response.status
      const body = error.response.data
      if (body && typeof body === 'object' && body.code !== undefined) {
        return Promise.reject(
          new ApiBusinessError(
            Number(body.code),
            body.msg || body.message || '请求失败',
            body.data ?? null,
          ),
        )
      }
      // 401/404 静默处理，页面自动 Mock 降级
      // 真正的认证失效由 success 拦截器处理（业务 code>=20001）
      // silent 标记：有兜底方案的请求不弹 toast（如头像上传、获取资料）
      const silent = (error.config as any)?.silent === true
      if (status === 401 || status === 404 || silent) {
        if (import.meta.env.DEV) {
          console.warn(`[API] ${status}，使用 Mock 降级:`, error.config?.url)
        }
      } else {
        const msgMap: Record<number, string> = {
          400: '请求参数错误',
          403: '无访问权限',
          500: '服务器内部错误',
        }
        ElMessage.error(msgMap[status] || `请求失败 (${status})`)
      }
    }
    return Promise.reject(error)
  },
)

export default http
