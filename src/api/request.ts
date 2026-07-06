// ============================================================
// Axios 请求封装 — 统一拦截器 / baseURL / 错误处理
// ============================================================
import axios, {
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'

const http: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// ── 请求拦截：附加 Token ──
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── 响应拦截：统一错误处理 ──
http.interceptors.response.use(
  (response: AxiosResponse) => {
    const data = response.data
    // 业务级错误（仅当 data 是 JSON 对象时处理）
    if (data && typeof data === 'object' && data.code !== undefined && data.code !== 0) {
      // 认证类错误：清 token 但不强制跳转，由页面路由守卫处理
      // 各页面组件 catch 到错误后自动 Mock 降级
      if (data.code >= 20001 && data.code <= 20008) {
        localStorage.removeItem('token')
        localStorage.removeItem('userInfo')
        if (import.meta.env.DEV) {
          console.warn('[API] 认证失效 (code=' + data.code + ')，已清 token，使用 Mock 降级')
        }
        return Promise.reject(new Error(data.msg || '认证失败'))
      }
      // 业务错误不弹 toast，由调用方决定是否提示
      return Promise.reject(new Error(data.msg || '请求失败'))
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
      if (import.meta.env.DEV) {
        console.warn('[API] 网络不可达，使用 Mock 降级:', error.config?.url)
      }
    } else {
      const status = error.response.status
      // 401/404 静默处理，页面自动 Mock 降级
      // 真正的认证失效由 success 拦截器处理（业务 code>=20001）
      if (status === 401 || status === 404) {
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
