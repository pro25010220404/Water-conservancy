import { computed } from 'vue'
import { ROUTE_ROLES, type UserRole } from '@/constants/roles'
import { useUserStore } from '@/stores/user'

export function usePermission() {
  const userStore = useUserStore()

  const roles = computed(() => userStore.userInfo?.roles ?? [])

  function hasRole(target: UserRole | UserRole[]): boolean {
    if (roles.value.length === 0) return true
    const list = Array.isArray(target) ? target : [target]
    return list.some((role) => roles.value.includes(role))
  }

  function hasRoutePermission(path: string): boolean {
    const allowed = ROUTE_ROLES[path]
    if (!allowed) return true
    if (roles.value.length === 0) return true
    return allowed.some((role) => roles.value.includes(role))
  }

  return { roles, hasRole, hasRoutePermission }
}
