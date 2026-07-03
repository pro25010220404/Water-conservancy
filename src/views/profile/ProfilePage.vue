<script setup lang="ts">
// ============================================================
// 个人中心 — 个人信息 / 账户安全 / 操作日志 三卡片布局
// ============================================================

// ── 1. 外部依赖 ──
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ElCard, ElAvatar, ElTag, ElButton, ElDialog, ElForm, ElFormItem,
  ElInput, ElTable, ElTableColumn, ElPagination, ElSelect, ElOption,
  ElDatePicker, ElProgress, ElMessage,
} from 'element-plus'
import { useUserStore } from '@/stores/user'
import { checkPasswordStrength, FORM_RULES } from '@/constants/validation'
import { changePassword } from '@/api/profile'
import type { OperationLog } from '@/shared/types'

const router = useRouter()
const userStore = useUserStore()

// ── 5. 响应式数据 ──

/** 从 localStorage 读取本地扩展资料（phone/email/registerTime 等 store 不存的信息） */
function loadExtProfile(): { realname: string; phone: string; email: string; registerTime: string } {
  try {
    const raw = localStorage.getItem('profile')
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return { realname: '', phone: '', email: '', registerTime: new Date().toISOString().slice(0, 10) }
}

function saveExtProfile(data: Record<string, string>) {
  const existing = loadExtProfile()
  localStorage.setItem('profile', JSON.stringify({ ...existing, ...data }))
}

const extProfile = ref(loadExtProfile())
const profileLoading = ref(false)

// 个人信息弹窗
const infoVisible = ref(false)
const infoForm = ref({ realname: '', phone: '', email: '' })
const infoSubmitting = ref(false)

// 修改密码弹窗
const pwdVisible = ref(false)
const pwdForm = ref({ old_password: '', new_password: '', confirm_password: '' })
const pwdSubmitting = ref(false)
const showNewPwd = ref(false)

// 操作日志（本地 mock，记录在 localStorage）
const logs = ref<OperationLog[]>([])
const logsTotal = ref(0)
const logsPage = ref(1)
const logsLoading = ref(false)
const logModuleFilter = ref('')
const logDateRange = ref<[string, string] | null>(null)
const logModules = [
  { label: '全部模块', value: '' },
  { label: '登录认证', value: 'auth' },
  { label: '设备管理', value: 'equipment' },
  { label: '系统设置', value: 'settings' },
  { label: '调度决策', value: 'dispatch' },
  { label: '告警管理', value: 'warning' },
  { label: '个人中心', value: 'profile' },
]

/** 记录一条本地操作日志 */
function recordLog(module: string, type: string, description: string, result: number) {
  try {
    const raw = localStorage.getItem('operationLogs')
    const list: OperationLog[] = raw ? JSON.parse(raw) : []
    list.unshift({
      id: Date.now(),
      time: new Date().toLocaleString('zh-CN'),
      module,
      type,
      description,
      result,
    })
    // 保留最近 100 条
    if (list.length > 100) list.length = 100
    localStorage.setItem('operationLogs', JSON.stringify(list))
  } catch { /* ignore */ }
}

// ── 6. Computed ──
const strength = computed(() => checkPasswordStrength(pwdForm.value.new_password))
const strengthColor = computed(() => {
  if (strength.value.level === 'strong') return '#22c55e'
  if (strength.value.level === 'medium') return '#f59e0b'
  return pwdForm.value.new_password ? '#ef4444' : '#c0c4cc'
})

const displayName = computed(() =>
  userStore.userInfo?.nickname || userStore.userInfo?.username || '用户',
)

const roleLabel = computed(() => {
  const map: Record<string, string> = {
    operator: '值班运维', dispatcher: '调度工程师', manager: '站长/管理',
    admin: '系统管理员', algorithm_engineer: '算法工程师',
  }
  const roles = userStore.userInfo?.roles ?? []
  return roles.map((r) => map[r] ?? r).join('、')
})

/** 注册时间：优先 localStorage，否则用当前时间 */
const registerTime = computed(() => extProfile.value.registerTime || new Date().toISOString().slice(0, 10))

// ── 7. 方法函数 ──

/** 初始化资料（从 store + localStorage） */
function initProfile() {
  profileLoading.value = true
  // 数据来自 store（username/nickname/roles）+ localStorage（phone/email）
  extProfile.value = loadExtProfile()
  profileLoading.value = false
}

function openInfoDialog() {
  const p = extProfile.value
  infoForm.value = {
    realname: p.realname || userStore.userInfo?.nickname || '',
    phone: p.phone || '',
    email: p.email || '',
  }
  infoVisible.value = true
}

function submitInfo() {
  infoSubmitting.value = true
  try {
    saveExtProfile(infoForm.value)
    extProfile.value = loadExtProfile()
    // 同步更新 store 昵称
    if (userStore.userInfo) {
      userStore.userInfo.nickname = infoForm.value.realname || userStore.userInfo.nickname
    }
    recordLog('个人中心', '编辑', '修改了个人资料', 1)
    ElMessage.success('资料更新成功')
    infoVisible.value = false
  } finally { infoSubmitting.value = false }
}

function openPwdDialog() {
  pwdForm.value = { old_password: '', new_password: '', confirm_password: '' }
  pwdVisible.value = true
}

async function submitPassword() {
  if (pwdForm.value.new_password !== pwdForm.value.confirm_password) {
    ElMessage.warning('两次输入的新密码不一致'); return
  }
  if (strength.value.level === 'weak') {
    ElMessage.warning('新密码强度太弱，请按规则设置'); return
  }
  pwdSubmitting.value = true
  try {
    const res = await changePassword(pwdForm.value)
    if (res.data.code === 0) {
      recordLog('个人中心', '修改密码', '修改了登录密码', 1)
      ElMessage.success('密码修改成功，3 秒后跳转登录')
      pwdVisible.value = false
      setTimeout(() => { userStore.logout(); router.push('/login') }, 3000)
    }
  } catch {
    recordLog('个人中心', '修改密码', '修改密码失败', 0)
  } finally { pwdSubmitting.value = false }
}

/** 种子日志（首次访问时写入） */
function seedLogs() {
  if (localStorage.getItem('operationLogs')) return
  const seed: OperationLog[] = [
    { id: 1, time: '2026-07-03 10:05:22', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
    { id: 2, time: '2026-07-03 09:30:15', module: '系统设置', type: '修改', description: '更新了上游水位告警阈值', result: 1 },
    { id: 3, time: '2026-07-02 18:20:00', module: '设备管理', type: '重启', description: '远程重启设备「水泵」', result: 1 },
    { id: 4, time: '2026-07-02 16:45:30', module: '调度决策', type: '执行', description: '手动下发闸门开度 35%', result: 1 },
    { id: 5, time: '2026-07-02 14:10:00', module: '告警管理', type: '处置', description: '处置告警 ALM-20260702-00078', result: 1 },
    { id: 6, time: '2026-07-02 11:30:00', module: '个人中心', type: '修改密码', description: '修改了登录密码', result: 1 },
    { id: 7, time: '2026-07-01 09:00:00', module: '登录认证', type: '登录', description: '用户 admin 登录成功', result: 1 },
    { id: 8, time: '2026-06-30 17:00:00', module: '系统设置', type: '创建', description: '创建新用户「孙七」', result: 1 },
    { id: 9, time: '2026-06-30 15:30:00', module: '设备管理', type: '状态变更', description: '设备「降压模块」标记为维护中', result: 1 },
    { id: 10, time: '2026-06-29 08:45:00', module: '登录认证', type: '登录', description: '用户 zhangsan 登录失败（密码错误）', result: 0 },
  ]
  localStorage.setItem('operationLogs', JSON.stringify(seed))
}

function fetchLogs() {
  logsLoading.value = true
  try {
    const raw = localStorage.getItem('operationLogs')
    let all: OperationLog[] = raw ? JSON.parse(raw) : []
    // 筛选
    if (logModuleFilter.value) {
      all = all.filter((l) => l.module === logModuleFilter.value)
    }
    if (logDateRange.value) {
      const [start, end] = logDateRange.value
      all = all.filter((l) => l.time >= start && l.time <= end + ' 23:59:59')
    }
    all.sort((a, b) => b.id - a.id)
    logsTotal.value = all.length
    const start = (logsPage.value - 1) * 15
    logs.value = all.slice(start, start + 15)
  } finally { logsLoading.value = false }
}

function onLogFilterChange() { logsPage.value = 1; fetchLogs() }
function onLogPageChange(p: number) { logsPage.value = p; fetchLogs() }

// ── 8. 生命周期 ──
onMounted(() => { initProfile(); seedLogs(); fetchLogs() })
</script>

<template>
  <div class="page profile-page">
    <!-- ═══ 卡片1: 个人信息 ═══ -->
    <el-card class="profile-card" v-loading="profileLoading" shadow="never">
      <template #header>
        <div class="profile-card__header">
          <span>个人信息</span>
          <el-button type="primary" size="small" @click="openInfoDialog">编辑</el-button>
        </div>
      </template>
      <div class="profile-info">
        <div class="profile-info__avatar">
          <el-avatar :size="80" style="background:linear-gradient(135deg, #1890ff, #00d4ff);color:#fff;font-size:32px;font-weight:600">
            {{ displayName.charAt(0) }}
          </el-avatar>
        </div>
        <div class="profile-info__fields">
          <div class="profile-info__row">
            <span class="profile-info__label">用户名</span>
            <span class="profile-info__value">{{ userStore.userInfo?.username ?? displayName }}</span>
          </div>
          <div class="profile-info__row">
            <span class="profile-info__label">姓名</span>
            <span class="profile-info__value">{{ extProfile.realname || userStore.userInfo?.nickname || '-' }}</span>
          </div>
          <div class="profile-info__row">
            <span class="profile-info__label">角色</span>
            <span class="profile-info__value">
              <el-tag size="small">{{ roleLabel || '未分配' }}</el-tag>
            </span>
          </div>
          <div class="profile-info__row">
            <span class="profile-info__label">邮箱</span>
            <span class="profile-info__value">{{ extProfile.email || '未填写' }}</span>
          </div>
          <div class="profile-info__row">
            <span class="profile-info__label">手机</span>
            <span class="profile-info__value">{{ extProfile.phone || '未填写' }}</span>
          </div>
          <div class="profile-info__row">
            <span class="profile-info__label">注册时间</span>
            <span class="profile-info__value">{{ registerTime }}</span>
          </div>
        </div>
      </div>
    </el-card>

    <!-- ═══ 卡片2: 账户安全 ═══ -->
    <el-card class="profile-card" shadow="never">
      <template #header><span>账户安全</span></template>
      <div class="profile-security">
        <div class="profile-security__item">
          <div class="profile-security__info">
            <span class="profile-security__label">登录密码</span>
            <span class="profile-security__desc">定期更换密码可保护账户安全</span>
          </div>
          <el-button @click="openPwdDialog">修改密码</el-button>
        </div>
      </div>
    </el-card>

    <!-- ═══ 卡片3: 操作日志 ═══ -->
    <el-card class="profile-card" shadow="never">
      <template #header><span>我的操作日志</span></template>
      <div class="profile-logs__filters">
        <el-select v-model="logModuleFilter" placeholder="操作模块" clearable size="small" style="width:140px" @change="onLogFilterChange">
          <el-option v-for="m in logModules" :key="m.value" :label="m.label" :value="m.value" />
        </el-select>
        <el-date-picker
          v-model="logDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="small"
          value-format="YYYY-MM-DD"
          @change="onLogFilterChange"
        />
      </div>
      <el-table :data="logs" v-loading="logsLoading" size="small" style="width:100%;margin-top:12px">
        <el-table-column prop="time" label="时间" width="170" />
        <el-table-column prop="module" label="操作模块" width="100" />
        <el-table-column prop="type" label="操作类型" width="120" />
        <el-table-column prop="description" label="操作描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作结果" width="90">
          <template #default="scope">
            <el-tag :type="(scope.row as OperationLog).result === 1 ? 'success' : 'danger'" size="small">{{ (scope.row as OperationLog).result === 1 ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="logsPage"
        :page-size="15"
        :total="logsTotal"
        layout="total, prev, pager, next"
        background
        size="small"
        style="margin-top:12px;justify-content:flex-end"
        @current-change="onLogPageChange"
      />
    </el-card>

    <!-- ═══ 编辑资料弹窗 ═══ -->
    <el-dialog v-model="infoVisible" title="编辑个人信息" width="420px">
      <el-form :model="infoForm" label-width="80px">
        <el-form-item label="姓名" :rules="FORM_RULES.realname">
          <el-input v-model="infoForm.realname" maxlength="20" placeholder="2-20个字符" />
        </el-form-item>
        <el-form-item label="手机号" :rules="FORM_RULES.phone">
          <el-input v-model="infoForm.phone" maxlength="11" placeholder="11位手机号" />
        </el-form-item>
        <el-form-item label="邮箱" :rules="FORM_RULES.email">
          <el-input v-model="infoForm.email" placeholder="请输入邮箱地址" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="infoVisible = false">取消</el-button>
        <el-button type="primary" :loading="infoSubmitting" @click="submitInfo">保存</el-button>
      </template>
    </el-dialog>

    <!-- ═══ 修改密码弹窗 ═══ -->
    <el-dialog v-model="pwdVisible" title="修改密码" width="460px">
      <el-form :model="pwdForm" label-width="100px">
        <el-form-item label="当前密码" required>
          <el-input v-model="pwdForm.old_password" type="password" show-password placeholder="请输入当前密码" />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input v-model="pwdForm.new_password" :type="showNewPwd ? 'text' : 'password'" show-password placeholder="≥8位含大小写字母和数字" />
        </el-form-item>
        <!-- 密码强度 -->
        <template v-if="pwdForm.new_password">
          <div class="pwd-strength">
            <div class="pwd-strength__bar">
              <el-progress
                :percentage="(strength.score / 5) * 100"
                :color="strengthColor"
                :stroke-width="6"
                :show-text="false"
              />
            </div>
            <span class="pwd-strength__label" :style="{ color: strengthColor }">
              {{ strength.level === 'strong' ? '强' : strength.level === 'medium' ? '中' : '弱' }}
            </span>
          </div>
          <ul class="pwd-checklist">
            <li v-for="(c, i) in strength.checks" :key="i" :class="{ 'is-passed': c.passed }">
              <span class="pwd-checklist__icon">{{ c.passed ? '✓' : '×' }}</span>
              {{ c.label }}
            </li>
          </ul>
        </template>
        <el-form-item label="确认新密码" required>
          <el-input v-model="pwdForm.confirm_password" type="password" show-password placeholder="请再次输入新密码"
            :class="{ 'is-error': pwdForm.confirm_password && pwdForm.new_password !== pwdForm.confirm_password }" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="pwdSubmitting" @click="submitPassword">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.profile-page {
  max-width: var(--content-max-width);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.profile-card {
  :deep(.el-card__header) {
    padding: var(--spacing-md) var(--spacing-lg);
    font-weight: 600;
    font-size: var(--font-size-lg);
    border-bottom: 1px solid var(--color-border);
  }

  :deep(.el-card__body) {
    padding: var(--spacing-lg);
  }
}

.profile-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

// 个人信息
.profile-info {
  display: flex;
  gap: var(--spacing-xl);
  align-items: flex-start;

  &__avatar {
    flex-shrink: 0;
  }

  &__fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  &__row {
    display: flex;
    align-items: center;
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--color-border);
  }

  &__label {
    width: 80px;
    flex-shrink: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-base);
  }

  &__value {
    font-size: var(--font-size-base);
    color: var(--color-text);
  }
}

// 账户安全
.profile-security {
  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) 0;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__label { font-size: var(--font-size-base); color: var(--color-text); }
  &__desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
}

// 操作日志
.profile-logs__filters {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

// 密码强度
.pwd-strength {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-sm) 0 var(--spacing-sm) 100px;

  &__bar { flex: 1; }
  &__label { font-size: var(--font-size-sm); font-weight: 600; }
}

.pwd-checklist {
  list-style: none;
  margin: 0 0 var(--spacing-md) 100px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm) var(--spacing-lg);

  li {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    &.is-passed { color: #22c55e; }
  }

  &__icon {
    font-weight: 700;
    width: 14px;
  }
}

.is-error {
  :deep(.el-input__inner) { border-color: #ef4444; }
}
</style>
