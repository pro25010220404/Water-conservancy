/** 系统名称 */
export const APP_TITLE = '水电站闸门智能调度系统'

/** 用户角色 */
export type UserRole = 'operator' | 'dispatcher' | 'manager' | 'admin' | 'algorithm_engineer'

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
  '/dispatch/gate-actions': ['dispatcher', 'manager', 'admin'],
  '/simulation': ['manager', 'admin', 'algorithm_engineer'],
  '/equipment': ['operator', 'manager', 'admin'],
  '/settings': ['admin'],
  '/settings/thresholds': ['admin'],
  '/settings/weights': ['admin'],
  '/settings/models': ['admin'],
  '/settings/users': ['admin'],
  '/settings/physics-guard': ['admin'],
  '/settings/physics-guard-history': ['admin'],
  '/settings/ai/metrics': ['admin', 'algorithm_engineer'],
  '/settings/ai/compare': ['admin', 'algorithm_engineer'],
  '/settings/gate-interlock': ['admin'],
  '/settings/gate-interlock/logs': ['admin'],
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
  {
    path: '/settings',
    title: '系统设置',
    icon: 'Setting',
    children: [
      { path: '/settings/thresholds', title: '告警阈值配置', icon: 'Setting' },
      { path: '/settings/weights', title: '多目标权重配置', icon: 'Setting' },
      { path: '/settings/models', title: '模型管理', icon: 'Setting' },
      { path: '/settings/users', title: '用户管理', icon: 'Setting' },
      { path: '/settings/physics-guard', title: '物理防护配置', icon: 'Setting' },
      { path: '/settings/physics-guard-history', title: '配置变更历史', icon: 'Setting' },
      { path: '/settings/ai/metrics', title: '模型健康度', icon: 'Setting' },
      { path: '/settings/gate-interlock', title: '闸门互锁规则', icon: 'Setting' },
      { path: '/settings/gate-interlock/logs', title: '互锁触发日志', icon: 'Setting' },
    ],
  },
  { path: '/profile', title: '个人中心', icon: 'User' },
]

/** 驾驶舱三页 — 横向快捷导航（不与侧边栏重复） */
export const COCKPIT_MODULE_PATHS = ['/warning', '/dispatch', '/simulation'] as const
