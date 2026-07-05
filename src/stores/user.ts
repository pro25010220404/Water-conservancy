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
  roles: UserRole[]
  permissions: string[]
}

function loadUserInfo(): UserInfo | null {
  try {
    const raw = localStorage.getItem('userInfo')
    return raw ? (JSON.parse(raw) as UserInfo) : null
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo | null>(loadUserInfo())
  const token = ref<string>(localStorage.getItem('token') || '')

  const isLoggedIn = computed(() => !!token.value && !!userInfo.value)
  const hasPermission = computed(
    () => (perm: string) => userInfo.value?.permissions?.includes(perm) ?? false,
  )

  function setSession(newToken: string, info: UserInfo) {
    token.value = newToken
    userInfo.value = info
    localStorage.setItem('token', newToken)
    localStorage.setItem('userInfo', JSON.stringify(info))
  }

  async function login(credentials: { username: string; password: string; remember?: boolean }): Promise<void> {
    const res = await loginApi({
      account: credentials.username,
      password: credentials.password,
      remember: credentials.remember,
    })
    const { data } = res.data
    if (!data?.token || !data.user_info) {
      throw new Error('登录失败')
    }
    const u = data.user_info
    const role = (u.role_code || 'operator') as UserRole
    setSession(data.token, {
      id: u.id,
      username: u.account,
      nickname: u.realname || u.account,
      roles: [role],
      permissions: [],
    })
  }

  function logout(): void {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
  }

  return { userInfo, token, isLoggedIn, hasPermission, setSession, login, logout }
})
