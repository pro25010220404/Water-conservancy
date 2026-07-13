// ============================================================
// Pinia Store — 用户状态
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loginApi } from '@/api/auth'
import { type UserRole, ROUTE_ROLES } from '@/constants/roles'

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
  // role_id（与后端数据库一致：1管理员 2调度员 3运维人员 4站长 5算法）
  '1': 'admin',
  '2': 'dispatcher',
  '3': 'operator',
  '4': 'manager',
  '5': 'algorithm_engineer',
  // role_name 兜底（优先匹配 role_id，此处兜底 role_code/role_name 字符串）
  '系统管理员': 'admin',
  '管理员': 'admin',
  '调度员': 'dispatcher',
  '调度工程师': 'dispatcher',
  '调度决策工程师': 'dispatcher',
  '运维人员': 'operator',
  '值班运维人员': 'operator',
  '值班运维': 'operator',
  '站长': 'manager',
  '站长/管理人员': 'manager',
  '站长/管理': 'manager',
  '算法工程师': 'algorithm_engineer',
}

/** UserRole → 中文显示名（与 SettingsPage roleOptions 保持一致） */
export const ROLE_LABEL_MAP: Record<UserRole, string> = {
  admin: '系统管理员',
  dispatcher: '调度员',
  operator: '运维人员',
  manager: '站长',
  algorithm_engineer: '算法工程师',
}

/**
 * 将后端返回的 role_code / role_name 映射为统一的 UserRole。
 * 导出供 ProfileCard 等外部调用，确保整个项目使用同一套映射逻辑。
 */
export function mapRoleCode(roleCode?: string | number, roleName?: string): UserRole {
  const code = String(roleCode ?? '').trim()
  if (code && ROLE_CODE_MAP[code]) return ROLE_CODE_MAP[code]

  const name = String(roleName ?? '').trim()
  if (name && ROLE_CODE_MAP[name]) return ROLE_CODE_MAP[name]

  console.warn(`[userStore] 未知的角色: code="${code}" name="${name}", 回退为 operator`)
  return 'operator'
}

/** 根据角色从 ROUTE_ROLES 推导操作权限列表（与路由守卫使用同一权威源） */
function getPermissionsFromRole(role: UserRole): string[] {
  const perms: string[] = []
  for (const [path, roles] of Object.entries(ROUTE_ROLES)) {
    if (roles.includes(role)) {
      perms.push(path)
    }
  }
  return perms
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
    // 同步写入两个存储，避免 sessionStorage 残留旧 token 导致 401
    //（拦截器 & store 初始化均优先读 sessionStorage）
    localStorage.setItem('token', newToken)
    localStorage.setItem('userInfo', JSON.stringify(info))
    sessionStorage.setItem('token', newToken)
    sessionStorage.setItem('userInfo', JSON.stringify(info))
  }

  /** 登录成功后刷新当前用户的权限（基于 roles 从 ROUTE_ROLES 推导） */
  function syncPermissions() {
    if (!userInfo.value || userInfo.value.roles.length === 0) return
    const allPerms = new Set<string>()
    for (const role of userInfo.value.roles) {
      for (const perm of getPermissionsFromRole(role)) {
        allPerms.add(perm)
      }
    }
    userInfo.value.permissions = Array.from(allPerms)
    // 同步持久化
    localStorage.setItem('userInfo', JSON.stringify(userInfo.value))
    if (sessionStorage.getItem('userInfo')) {
      sessionStorage.setItem('userInfo', JSON.stringify(userInfo.value))
    }
  }

  /**
   * 用后端最新数据更新当前用户角色 — 供个人中心调用。
   * @param roleCode 后端返回的 role_code（字符串或数字）
   * @param roleName 后端返回的 role_name（中文标签）
   */
  function updateRole(roleCode?: string | number, roleName?: string) {
    if (!userInfo.value) return
    const role = mapRoleCode(roleCode, roleName)
    // 去重：相同角色不重复写入
    if (!userInfo.value.roles.includes(role)) {
      userInfo.value.roles = [role]
      syncPermissions()
    }
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
      id: Number(data.user_info.id),
      username: data.user_info.account,
      nickname: data.user_info.realname || data.user_info.account,
      roles: [role],
      permissions: [], // 临时空，下面 syncPermissions() 填充
    })
    syncPermissions()

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
    // 保留 remembered_credentials，退出后密码仍可回填
    localStorage.removeItem('auto_login_flag')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('userInfo')
    sessionStorage.removeItem('force_pwd_change_needed')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', newValue: null, oldValue: 'logged-out' }))
  }

  return { userInfo, token, isLoggedIn, hasPermission, setSession, login, logout, syncPermissions, updateRole }
})

