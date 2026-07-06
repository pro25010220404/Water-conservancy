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
    // 调用真实登录接口 POST /api/auth/login
    const http = (await import('@/api/request')).default
    const res = await http.post<{
      code: number
      msg: string
      data: {
        token: string
        token_expire_time: string
        user_info: { id: number; account: string; realname: string; role_code: string; role_name: string }
      }
    }>('/auth/login', {
      account: credentials.username,
      password: credentials.password,
    })

    if (res.data.code === 0 && res.data.data) {
      const d = res.data.data
      setSession(d.token, {
        id: d.user_info.id,
        username: d.user_info.account,
        nickname: d.user_info.realname,
        roles: [d.user_info.role_code],
        permissions: [],
      })
      return
    }

    throw new Error(res.data.msg || '登录失败')
  }

  function logout(): void {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('userInfo')
  }

  return { userInfo, token, isLoggedIn, hasPermission, setSession, login, logout }
})
