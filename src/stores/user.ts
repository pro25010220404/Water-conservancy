// ============================================================
// Pinia Store — 用户状态
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loginApi } from '@/api/auth'
import type { UserRole } from '@/constants/roles'

export interface UserInfo {
  id: number
  username: string
  nickname: string
  avatar?: string
  phone?: string
  roles: UserRole[]
  permissions: string[]
}

const ROLE_CODE_MAP: Record<string, UserRole> = {
  admin: 'admin',
  dispatcher: 'dispatcher',
  operator: 'operator',
  manager: 'manager',
  station_master: 'manager',
  algorithm: 'algorithm_engineer',
  algorithm_engineer: 'algorithm_engineer',
  // role_id（与系统设置用户管理一致：1运维 2调度 3站长 4管理员 5算法）
  '1': 'operator',
  '2': 'dispatcher',
  '3': 'manager',
  '4': 'admin',
  '5': 'algorithm_engineer',
  // role_name 兜底
  '值班运维人员': 'operator',
  '值班运维': 'operator',
  '调度决策工程师': 'dispatcher',
  '调度工程师': 'dispatcher',
  '调度员': 'dispatcher',
  '站长/管理人员': 'manager',
  '站长': 'manager',
  '系统管理员': 'admin',
  '算法工程师': 'algorithm_engineer',
}

function mapRoleCode(roleCode: string, roleName?: string): UserRole {
  const code = String(roleCode ?? '').trim()
  if (code && ROLE_CODE_MAP[code]) return ROLE_CODE_MAP[code]

  const name = String(roleName ?? '').trim()
  if (name && ROLE_CODE_MAP[name]) return ROLE_CODE_MAP[name]

  console.warn(`[userStore] 未知的角色: code="${code}" name="${name}", 回退为 operator`)
  return 'operator'
}

function loadUserInfo(): UserInfo | null {
  try {
    const raw = sessionStorage.getItem('userInfo') || localStorage.getItem('userInfo')
    return raw ? (JSON.parse(raw) as UserInfo) : null
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(loadUserInfo())
  const token = ref<string>(sessionStorage.getItem('token') || localStorage.getItem('token') || '')

  const isLoggedIn = computed(() => !!token.value && !!userInfo.value)
  const hasPermission = computed(
    () => (perm: string) => userInfo.value?.permissions?.includes(perm) ?? false,
  )

  // 多标签页同步登出：其他标签页清除 token 时自动登出
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === 'token' && !e.newValue && token.value) {
        token.value = ''
        userInfo.value = null
      }
    })
  }

  function setSession(newToken: string, info: UserInfo) {
    token.value = newToken
    userInfo.value = info
    localStorage.setItem('token', newToken)
    localStorage.setItem('userInfo', JSON.stringify(info))
  }

  async function login(credentials: {
    username: string
    password: string
    remember?: boolean
  }): Promise<void> {
    const res = await loginApi({
      account: credentials.username,
      password: credentials.password,
      remember: credentials.remember,
    })

    const data = res.data.data
    if (!data?.token || !data.user_info) {
      throw new Error('登录失败')
    }

    const role = mapRoleCode(data.user_info.role_code, data.user_info.role_name)

    setSession(data.token, {
      id: data.user_info.id,
      username: data.user_info.account,
      nickname: data.user_info.realname || data.user_info.account,
      roles: [role],
      permissions: [],
    })

    if (data.token_expire_time) {
      localStorage.setItem('tokenExpireTime', data.token_expire_time)
    }
  }

  function logout(): void {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
    localStorage.removeItem('tokenExpireTime')
    localStorage.removeItem('remembered_credentials')
    localStorage.removeItem('auto_login_flag')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('userInfo')
    sessionStorage.removeItem('force_pwd_change_needed')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: null, oldValue: 'logged-out' }))
  }

  return { userInfo, token, isLoggedIn, hasPermission, setSession, login, logout }
})
