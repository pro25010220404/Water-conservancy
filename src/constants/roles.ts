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
  '/dashboard/overview': ['operator', 'dispatcher', 'manager', 'admin', 'algorithm_engineer'],
  '/dashboard/hydrology': ['operator', 'dispatcher', 'manager', 'admin'],
  '/dashboard/gate': ['operator', 'dispatcher', 'manager', 'admin'],
  '/dashboard/power': ['operator', 'dispatcher', 'manager', 'admin'],
  '/dashboard/security': ['operator', 'manager', 'admin'],
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
  children?: MenuItem[]
}

export const MENU_ITEMS: MenuItem[] = [
  {
    path: '/dashboard',
    title: '监控大屏',
    icon: 'Monitor',
    children: [
      { path: '/dashboard/overview', title: '综合概览', icon: 'Monitor' },
      { path: '/dashboard/hydrology', title: '水情监测', icon: 'Ship' },
      { path: '/dashboard/gate', title: '闸门检测', icon: 'Switch' },
      { path: '/dashboard/power', title: '发电检测', icon: 'DataAnalysis' },
      { path: '/dashboard/security', title: '安防检测', icon: 'VideoCamera' },
    ],
  },
  { path: '/history', title: '历史查询', icon: 'Clock' },
  { path: '/warning', title: '告警管理', icon: 'Warning' },
  { path: '/dispatch', title: '调度决策', icon: 'Operation' },
  { path: '/simulation', title: '数字孪生', icon: 'Cpu' },
  { path: '/equipment', title: '设备管理', icon: 'SetUp' },
  { path: '/settings', title: '系统设置', icon: 'Setting' },
  { path: '/profile', title: '个人中心', icon: 'User' },
]

/** 驾驶舱三页 — 横向快捷导航（不与侧边栏重复） */
export const COCKPIT_MODULE_PATHS = ['/warning', '/dispatch', '/simulation'] as const
