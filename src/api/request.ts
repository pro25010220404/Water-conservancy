// ============================================================
// Axios 请求封装 — 统一拦截器 / baseURL / 错误处理
// ============================================================
import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
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
    // 业务级错误
    if (data.code !== undefined && data.code !== 0) {
      // 认证类错误自动跳转登录
      if (data.code >= 20001 && data.code <= 20008) {
        localStorage.removeItem('token')
        localStorage.removeItem('userInfo')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
      ElMessage.error(data.msg || '请求失败')
      return Promise.reject(new Error(data.msg || '请求失败'))
    }
    return response
  },
  (error) => {
    if (error.code === 'ECONNABORTED') {
      ElMessage.error('请求超时，请稍后重试')
    } else if (!error.response) {
      ElMessage.error('网络异常，请检查网络连接')
    } else {
      const status = error.response.status
      const msgMap: Record<number, string> = {
        400: '请求参数错误',
        401: '登录已过期，请重新登录',
        403: '无访问权限',
        404: '请求资源不存在',
        500: '服务器内部错误',
      }
      ElMessage.error(msgMap[status] || `请求失败 (${status})`)
    }
    return Promise.reject(error)
  },
)

export default http
