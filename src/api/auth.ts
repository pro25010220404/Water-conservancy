// ============================================================
// 认证模块 API
// ============================================================
import http from './request'
import type { ApiResponse } from '@/shared/types'

export interface LoginParams {
  account: string
  password: string
  remember?: 0 | 1
}

export interface LoginUserInfo {
  id: number
  account: string
  realname: string
  role_code: string
  role_name: string
}

export interface LoginResult {
  token: string
  token_expire_time: string
  remember: boolean
  user_info: LoginUserInfo
}

/** POST /auth/login */
export function login(data: LoginParams) {
  return http.post<ApiResponse<LoginResult>>('/auth/login', data)
}
