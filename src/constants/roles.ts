/** 系统名称 */
export const APP_TITLE = '水电站闸门智能调度系统'

/** 用户角色 */
export type UserRole =
  | 'operator'
  | 'dispatcher'
  | 'manager'
  | 'admin'
  | 'algorithm_engineer'

/** 路由权限矩阵 */
export const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/dashboard': ['operator', 'dispatcher', 'manager', 'admin', 'algorithm_engineer'],
  '/history': ['dispatcher', 'manager', 'admin'],
  '/warning': ['operator', 'dispatcher', 'manager', 'admin'],
  '/dispatch': ['dispatcher', 'manager', 'admin', 'algorithm_engineer'],
  '/simulation': ['manager', 'admin', 'algorithm_engineer'],
  '/equipment': ['operator', 'manager', 'admin'],
  '/settings': ['admin'],
  '/profile': ['operator', 'dispatcher', 'manager', 'admin', 'algorithm_engineer'],
}

/** 侧边栏菜单 */
export interface MenuItem {
  path: string
  title: string
  icon: string
}

export const MENU_ITEMS: MenuItem[] = [
  { path: '/dashboard', title: '监控大屏', icon: 'Monitor' },
  { path: '/history', title: '历史查询', icon: 'Clock' },
  { path: '/warning', title: '告警管理', icon: 'Warning' },
  { path: '/dispatch', title: '调度决策', icon: 'Operation' },
  { path: '/simulation', title: '数字孪生', icon: 'Cpu' },
  { path: '/equipment', title: '设备管理', icon: 'SetUp' },
  { path: '/settings', title: '系统设置', icon: 'Setting' },
  { path: '/profile', title: '个人中心', icon: 'User' },
]
