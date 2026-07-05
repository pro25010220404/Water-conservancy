// ============================================================
// Pinia Store — 用户状态
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UserInfo {
  id: number
  username: string
  nickname: string
  avatar?: string
  roles: string[]
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

  async function login(credentials: { username: string; password: string }): Promise<void> {
    // TODO: 对接 POST /api/auth/login
    setSession('dev-token', {
      id: 1,
      username: credentials.username,
      nickname: credentials.username,
      roles: ['admin'],
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
