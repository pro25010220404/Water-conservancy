// ============================================================
// Vue Router — 九大板块路由
// ============================================================
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { APP_TITLE, ROUTE_ROLES } from '@/constants/roles'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginPage.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    redirect: '/dashboard/overview',
    children: [
      {
        path: 'dashboard/overview',
        name: 'DashboardOverview',
        component: () => import('@/views/dashboard/DashboardPage.vue'),
        meta: { title: '综合概览' },
      },
      {
        path: 'dashboard/hydrology',
        name: 'Hydrology',
        component: () => import('@/views/dashboard/HydrologyPage.vue'),
        meta: { title: '水情监测' },
      },
      {
        path: 'dashboard/gate',
        name: 'Gate',
        component: () => import('@/views/dashboard/GatePage.vue'),
        meta: { title: '闸门检测' },
      },
      {
        path: 'dashboard/power',
        name: 'Power',
        component: () => import('@/views/dashboard/PowerPage.vue'),
        meta: { title: '发电检测' },
      },
      {
        path: 'dashboard/security',
        name: 'Security',
        component: () => import('@/views/dashboard/SecurityPage.vue'),
        meta: { title: '安防检测' },
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@/views/history/HistoryPage.vue'),
        meta: { title: '历史查询' },
      },
      {
        path: 'warning',
        name: 'Warning',
        component: () => import('@/views/warning/WarningPage.vue'),
        meta: { title: '告警管理' },
      },
      {
        path: 'dispatch',
        name: 'Dispatch',
        component: () => import('@/views/dispatch/DispatchPage.vue'),
        meta: { title: '调度决策' },
      },
      {
        path: 'simulation',
        name: 'Simulation',
        component: () => import('@/views/simulation/SimulationPage.vue'),
        meta: { title: '数字孪生' },
      },
      {
        path: 'equipment',
        name: 'Equipment',
        component: () => import('@/views/equipment/EquipmentPage.vue'),
        meta: { title: '设备管理' },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/SettingsPage.vue'),
        meta: { title: '系统设置' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/profile/ProfilePage.vue'),
        meta: { title: '个人中心' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/components/NotFoundPage.vue'),
    meta: { title: '页面不存在', requiresAuth: false },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to, _from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - ${APP_TITLE}` : APP_TITLE

  const userStore = useUserStore()

  // 无效 token（有 token 但无用户信息）视为未登录
  if (userStore.token && !userStore.userInfo) {
    userStore.logout()
  }

  const isLoggedIn = userStore.isLoggedIn

  // 未登录：除登录页和 404 外，一律跳转登录
  if (to.meta.requiresAuth !== false && !isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // 已登录访问登录页：跳转首页
  if (to.name === 'Login' && isLoggedIn) {
    next({ path: '/dashboard/overview' })
    return
  }

  // 根路径未登录时去登录页
  if (to.path === '/' && !isLoggedIn) {
    next({ name: 'Login' })
    return
  }

  const allowedRoles = ROUTE_ROLES[to.path]
  if (allowedRoles && isLoggedIn && userStore.userInfo?.roles.length) {
    const hasAccess = allowedRoles.some((role) => userStore.userInfo!.roles.includes(role))
    if (!hasAccess) {
      ElMessage.warning('您暂无该页面访问权限')
      next({ path: '/dashboard/overview' })
      return
    }
  }

  next()
})

export default router
