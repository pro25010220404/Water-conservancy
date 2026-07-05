<script setup lang="ts">
// ============================================================
// 系统设置 — 通过路由路径分发子页面（侧边栏导航）
// ============================================================

// ── 1. 外部依赖 ──
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ElCard,
  ElTable,
  ElTableColumn,
  ElInputNumber,
  ElSwitch,
  ElButton,
  ElTag,
  ElPagination,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElSlider,
  ElUpload,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import { Plus, Upload, Search, Refresh, Warning } from '@element-plus/icons-vue'
import ModelMetricsPanel from './components/ModelMetricsPanel.vue'
import PhysicsGuardPanel from './components/PhysicsGuardPanel.vue'
import PhysicsGuardHistoryPanel from './components/PhysicsGuardHistoryPanel.vue'
import GateInterlockPanel from './components/GateInterlockPanel.vue'
import { FORM_RULES } from '@/constants/validation'
import { useOperationLog } from '@/composables/useOperationLog'
import {
  getThresholds,
  updateThreshold,
  getWeights,
  updateWeights,
  getModels,
  activateModel,
  rollbackModel,
  deployModel,
  uploadModel,
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  lockUser,
  unlockUser,
  deleteUser,
  deleteModel,
} from '@/api/settings'
import type { ThresholdRule, WeightConfig, ModelInfo, SystemUser } from '@/shared/types'

const { record: recordLog } = useOperationLog()
const route = useRoute()

// 路径 → 标签名映射
const PATH_TAB_MAP: Record<string, string> = {
  '/settings': 'thresholds',
  '/settings/thresholds': 'thresholds',
  '/settings/weights': 'weights',
  '/settings/models': 'models',
  '/settings/ai/metrics': 'ai-metrics',
  '/settings/ai-metrics': 'ai-metrics',
  '/settings/physics-guard': 'physics-guard',
  '/settings/physics-guard/history': 'physics-guard-history',
  '/settings/gate-interlock': 'gate-interlock',
  '/settings/users': 'users',
}

function resolveTabFromPath(): string {
  // 优先从路径解析
  if (PATH_TAB_MAP[route.path]) return PATH_TAB_MAP[route.path]
  // 兼容旧版 ?tab= 参数
  const q = route.query.tab as string | undefined
  if (q && PATH_TAB_MAP[`/settings/${q}`]) return q
  return 'thresholds'
}

// ── 5. 响应式数据 ──
const activeTab = ref(resolveTabFromPath())
const saveLoadingTab1 = ref(false)
const saveLoadingTab2 = ref(false)

// Tab1: 阈值
const thresholds = ref<ThresholdRule[]>([])
const thresholdsLoading = ref(false)
const thresholdsEditing = ref<Record<number, ThresholdRule>>({})

// Tab2: 权重
const weights = ref<WeightConfig | null>(null)
const weightForm = ref({ power_weight: 0.4, safety_weight: 0.35, ecology_weight: 0.25 })
const weightLoading = ref(false)
const presetOptions = [
  { label: '均衡方案', power: 0.4, safety: 0.35, ecology: 0.25 },
  { label: '发电优先', power: 0.6, safety: 0.25, ecology: 0.15 },
  { label: '安全优先', power: 0.15, safety: 0.7, ecology: 0.15 },
  { label: '生态优先', power: 0.2, safety: 0.25, ecology: 0.55 },
]

type Preset = (typeof presetOptions)[number]

function applyPreset(p: Preset) {
  weightForm.value = { power_weight: p.power, safety_weight: p.safety, ecology_weight: p.ecology }
}

// 模型状态映射
const modelTypeMap: Record<string, string> = {
  lstm_prediction: 'LSTM 预测',
  dqn_decision: 'DQN 决策',
  fault_detection: '故障检测',
  general: '通用',
}
const modelStatusMap: Record<string, string> = {
  uploaded: '已上传',
  validating: '验证中',
  ready: '就绪',
  active: '激活中',
  deprecated: '已废弃',
}
const healthGradeColor: Record<string, string> = {
  S: '#16a34a',
  A: '#22c55e',
  B: '#f59e0b',
  C: '#f97316',
  D: '#dc2626',
}

// 阈值指标映射
const metricLabelMap: Record<string, string> = {
  upstream_level: '上游水位',
  downstream_level: '下游水位',
  inflow_rate: '入库流量',
  outflow_rate: '出库流量',
  gate_opening: '闸门开度',
  power_output: '发电功率',
}

// 角色
const roleOptions = [
  { label: '值班运维', value: 1 },
  { label: '调度工程师', value: 2 },
  { label: '站长/管理', value: 3 },
  { label: '系统管理员', value: 4 },
  { label: '算法工程师', value: 5 },
]
const roleLabel = computed(() => {
  const map: Record<number, string> = {}
  roleOptions.forEach((r) => {
    map[r.value] = r.label
  })
  return map
})

// ── 6. Computed (权重合计) ──
const weightSum = computed(
  () =>
    +(
      weightForm.value.power_weight +
      weightForm.value.safety_weight +
      weightForm.value.ecology_weight
    ).toFixed(2),
)
const weightValid = computed(() => Math.abs(weightSum.value - 1.0) < 0.001)

// ── 联动滑块 ──
function onSliderChange(changed: string) {
  const keys = ['power_weight', 'safety_weight', 'ecology_weight'] as const
  const changedKey = changed as (typeof keys)[number]
  const rest = 1.0 - weightForm.value[changedKey]
  const others = keys.filter((k) => k !== changedKey)
  const sumOthers = others.reduce((s, k) => s + weightForm.value[k], 0)
  if (sumOthers === 0) {
    others.forEach((k) => {
      weightForm.value[k] = +(rest / others.length).toFixed(2)
    })
  } else {
    others.forEach((k) => {
      weightForm.value[k] = +((rest * weightForm.value[k]) / sumOthers).toFixed(2)
    })
  }
}

// ── 模型上传 ──
const uploadRef = ref()
const uploading = ref(false)
const uploadProgress = ref(0)

async function handleUpload(opts: { file: File }) {
  const formData = new FormData()
  formData.append('file', opts.file)
  formData.append('name', opts.file.name.replace(/\.[^.]+$/, ''))
  formData.append('version', `v${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`)
  formData.append('type', 'general')

  uploading.value = true
  uploadProgress.value = 0
  const timer = setInterval(() => {
    if (uploadProgress.value < 90) uploadProgress.value += 10
  }, 200)

  try {
    const res = await uploadModel(formData)
    clearInterval(timer)
    uploadProgress.value = 100
    if (res.data.code === 0) {
      ElMessage.success(`模型「${opts.file.name}」上传成功，进入验证阶段`)
      uploadRef.value?.clearFiles()
      fetchModels()
    }
  } catch {
    clearInterval(timer)
    uploadProgress.value = 0
  } finally {
    uploading.value = false
  }
}

// ── Mock 数据 ──
const MOCK_THRESHOLDS: ThresholdRule[] = [
  {
    id: 1,
    reservoir_id: 1,
    metric: 'upstream_level',
    warning_upper: 93.0,
    warning_lower: 88.0,
    critical_upper: 95.0,
    critical_lower: 86.0,
    debounce_seconds: 30,
    enabled: 1,
  },
  {
    id: 2,
    reservoir_id: 1,
    metric: 'downstream_level',
    warning_upper: 86.5,
    warning_lower: 84.0,
    critical_upper: 88.0,
    critical_lower: 83.0,
    debounce_seconds: 30,
    enabled: 1,
  },
  {
    id: 3,
    reservoir_id: 1,
    metric: 'inflow_rate',
    warning_upper: 500.0,
    warning_lower: 100.0,
    critical_upper: 600.0,
    critical_lower: 80.0,
    debounce_seconds: 30,
    enabled: 1,
  },
  {
    id: 4,
    reservoir_id: 1,
    metric: 'outflow_rate',
    warning_upper: 450.0,
    warning_lower: 50.0,
    critical_upper: 550.0,
    critical_lower: 30.0,
    debounce_seconds: 30,
    enabled: 1,
  },
  {
    id: 5,
    reservoir_id: 1,
    metric: 'gate_opening',
    warning_upper: 80.0,
    warning_lower: 10.0,
    critical_upper: 90.0,
    critical_lower: 5.0,
    debounce_seconds: 30,
    enabled: 1,
  },
  {
    id: 6,
    reservoir_id: 1,
    metric: 'power_output',
    warning_upper: 200.0,
    warning_lower: 50.0,
    critical_upper: 250.0,
    critical_lower: 30.0,
    debounce_seconds: 30,
    enabled: 0,
  },
]
const MOCK_WEIGHTS: WeightConfig = {
  id: 1,
  version: 'v2.1.0',
  enabled: 1,
  power_weight: 0.4,
  safety_weight: 0.35,
  ecology_weight: 0.25,
  preset_name: '均衡方案',
  is_preset: 1,
  updated_at: '2026-07-03 09:00:00',
}
const MOCK_MODELS: ModelInfo[] = [
  {
    id: 1,
    name: 'LSTM 水位预测 v2',
    version: 'v2.3.0',
    type: 'lstm_prediction',
    framework: 'pytorch',
    status: 'active',
    accuracy: 94.2,
    training_date: '2026-06-28',
    size: 128,
    is_active: 1,
    deployed_nodes: 3,
    overall_score: 0.88,
    health_grade: 'A',
  },
  {
    id: 2,
    name: 'DQN 调度决策 v3',
    version: 'v3.0.1',
    type: 'dqn_decision',
    framework: 'pytorch',
    status: 'active',
    accuracy: 88.7,
    training_date: '2026-06-30',
    size: 256,
    is_active: 1,
    deployed_nodes: 3,
    overall_score: 0.82,
    health_grade: 'A',
  },
  {
    id: 3,
    name: '故障检测模型',
    version: 'v1.2.0',
    type: 'fault_detection',
    framework: 'onnx',
    status: 'ready',
    accuracy: 82.5,
    training_date: '2026-06-25',
    size: 64,
    is_active: 0,
    deployed_nodes: 0,
    overall_score: 0.72,
    health_grade: 'B',
  },
  {
    id: 4,
    name: 'DQN 调度决策 v2',
    version: 'v2.9.0',
    type: 'dqn_decision',
    framework: 'pytorch',
    status: 'deprecated',
    accuracy: 85.1,
    training_date: '2026-05-15',
    size: 240,
    is_active: 0,
    deployed_nodes: 0,
    overall_score: 0.68,
    health_grade: 'B',
  },
  {
    id: 5,
    name: 'Physics-LSTM v5.1',
    version: 'v5.1.0',
    type: 'lstm_prediction',
    framework: 'pytorch',
    status: 'validating',
    accuracy: 76.3,
    training_date: '2026-07-02',
    size: 96,
    is_active: 0,
    deployed_nodes: 0,
    overall_score: 0.42,
    health_grade: 'C',
  },
]
const MOCK_USERS: SystemUser[] = [
  {
    id: 1,
    account: 'admin',
    realname: '系统管理员',
    role_id: 4,
    role_name: '系统管理员',
    phone: '13800001000',
    is_enabled: 1,
    created_at: '2026-06-01 08:00:00',
  },
  {
    id: 2,
    account: 'zhangsan',
    realname: '张三',
    role_id: 1,
    role_name: '值班运维人员',
    phone: '13800001001',
    is_enabled: 1,
    created_at: '2026-06-15 09:30:00',
  },
  {
    id: 3,
    account: 'lisi',
    realname: '李四',
    role_id: 2,
    role_name: '调度决策工程师',
    phone: '13800001002',
    is_enabled: 1,
    created_at: '2026-06-20 10:00:00',
  },
  {
    id: 4,
    account: 'wangwu',
    realname: '王五',
    role_id: 3,
    role_name: '站长/管理人员',
    phone: '13800001003',
    is_enabled: 1,
    created_at: '2026-06-22 14:00:00',
  },
  {
    id: 5,
    account: 'zhaoliu',
    realname: '赵六',
    role_id: 5,
    role_name: '算法工程师',
    phone: '13800001004',
    is_enabled: 0,
    created_at: '2026-06-25 11:00:00',
  },
  {
    id: 6,
    account: 'sunqi',
    realname: '孙七',
    role_id: 1,
    role_name: '值班运维人员',
    phone: '13800001005',
    is_enabled: 1,
    created_at: '2026-07-02 08:30:00',
  },
]

// Tab3: 模型
const models = ref<ModelInfo[]>([])
const modelsTotal = ref(0)
const modelsPage = ref(1)
const modelsLoading = ref(false)
const modelKeyword = ref('')

// Tab4: 用户
const users = ref<SystemUser[]>([])
const usersTotal = ref(0)
const usersPage = ref(1)
const usersLoading = ref(false)
const userKeyword = ref('')
const userDialogVisible = ref(false)
const userDialogMode = ref<'create' | 'edit'>('create')
const userForm = ref({ account: '', password: '', realname: '', role_id: 4, phone: '' })
const editingUserId = ref<number | null>(null)
const userSubmitting = ref(false)

// ── 7. 方法 ──

// -- Tab1 --
async function fetchThresholds() {
  thresholdsLoading.value = true
  try {
    const res = await getThresholds()
    if (res.data.code === 0 && res.data.data?.length) {
      thresholds.value = res.data.data
      thresholdsLoading.value = false
      return
    }
  } catch {
    /* fallback */
  }
  thresholds.value = [...MOCK_THRESHOLDS]
  thresholdsLoading.value = false
}

function startEditThreshold(row: ThresholdRule) {
  thresholdsEditing.value[row.id] = { ...row }
}

function cancelEditThreshold(id: number) {
  delete thresholdsEditing.value[id]
}

async function saveThreshold(id: number) {
  const edit = thresholdsEditing.value[id]
  if (!edit) return
  if (edit.warning_lower >= edit.warning_upper || edit.critical_lower >= edit.critical_upper) {
    ElMessage.warning('下限必须小于上限')
    return
  }
  if (edit.debounce_seconds < 10 || edit.debounce_seconds > 120) {
    ElMessage.warning('防抖时间范围 10-120 秒')
    return
  }
  saveLoadingTab1.value = true
  try {
    const res = await updateThreshold(id, edit)
    if (res.data.code === 0) {
      recordLog(
        '系统设置',
        '修改阈值',
        `更新了${metricLabelMap[edit.metric] ?? edit.metric}告警阈值`,
        1,
      )
      ElMessage.success('保存成功')
      delete thresholdsEditing.value[id]
      fetchThresholds()
    }
  } finally {
    saveLoadingTab1.value = false
  }
}

// -- Tab2 --
async function fetchWeights() {
  weightLoading.value = true
  try {
    const res = await getWeights()
    if (res.data.code === 0 && res.data.data) {
      const d = res.data.data
      weights.value = d
      weightForm.value = {
        power_weight: d.power_weight,
        safety_weight: d.safety_weight,
        ecology_weight: d.ecology_weight,
      }
      weightLoading.value = false
      return
    }
  } catch {
    /* fallback */
  }
  weights.value = MOCK_WEIGHTS
  weightForm.value = {
    power_weight: MOCK_WEIGHTS.power_weight,
    safety_weight: MOCK_WEIGHTS.safety_weight,
    ecology_weight: MOCK_WEIGHTS.ecology_weight,
  }
  weightLoading.value = false
}

async function saveWeights() {
  if (!weightValid.value) {
    ElMessage.warning('三权重之和必须等于 1.0')
    return
  }
  saveLoadingTab2.value = true
  try {
    await ElMessageBox.confirm('确定保存新的权重配置？保存后将实时推送至边缘端', '确认保存')
    await updateWeights({ ...weightForm.value })
    recordLog(
      '系统设置',
      '修改权重',
      `权重配置更新为发电${(weightForm.value.power_weight * 100).toFixed(0)}%/安全${(weightForm.value.safety_weight * 100).toFixed(0)}%/生态${(weightForm.value.ecology_weight * 100).toFixed(0)}%`,
      1,
    )
    ElMessage.success('权重已保存并推送至边缘端')
  } catch {
    /* 取消 */
  } finally {
    saveLoadingTab2.value = false
  }
}

// -- Tab3: 模型操作 --
async function fetchModels() {
  modelsLoading.value = true
  try {
    const res = await getModels({
      page: modelsPage.value,
      keyword: modelKeyword.value || undefined,
    })
    if (res.data.code === 0 && res.data.data.list.length) {
      models.value = res.data.data.list
      modelsTotal.value = res.data.data.total
      modelsLoading.value = false
      return
    }
  } catch {
    /* fallback */
  }
  let filtered = [...MOCK_MODELS]
  if (modelKeyword.value) {
    const kw = modelKeyword.value.toLowerCase()
    filtered = filtered.filter((m) => m.name.toLowerCase().includes(kw))
  }
  modelsTotal.value = filtered.length
  models.value = filtered.slice((modelsPage.value - 1) * 10, modelsPage.value * 10)
  modelsLoading.value = false
}

async function handleActivateModel(id: number) {
  try {
    await ElMessageBox.confirm('确定激活该模型？激活后旧版本将被标记为废弃', '确认激活')
    await activateModel(id)
    recordLog('系统设置', '激活模型', `激活了模型 ID:${id}`, 1)
    ElMessage.success('模型已激活')
    fetchModels()
  } catch {
    /* 取消 */
  }
}

async function handleRollbackModel(id: number) {
  try {
    await ElMessageBox.confirm('确定回滚到上一个版本？', '确认回滚')
    await rollbackModel(id)
    recordLog('系统设置', '回滚模型', `回滚了模型 ID:${id}`, 1)
    ElMessage.success('模型已回滚')
    fetchModels()
  } catch {
    /* 取消 */
  }
}

async function handleDeployModel(id: number) {
  try {
    const ids = await ElMessageBox.prompt('请输入目标边缘节点 ID（逗号分隔）', '下发模型', {
      confirmButtonText: '下发',
    })
    const nodeIds = ids.value
      .split(',')
      .map((s: string) => Number(s.trim()))
      .filter(Boolean)
    if (nodeIds.length === 0) {
      ElMessage.warning('请至少输入一个节点 ID')
      return
    }
    await deployModel(id, { edge_node_ids: nodeIds })
    recordLog('系统设置', '下发模型', `下发模型 ID:${id} 至 ${nodeIds.length} 个边缘节点`, 1)
    ElMessage.success('模型已开始下发')
    fetchModels()
  } catch {
    /* 取消 */
  }
}

async function handleDeleteModel(id: number) {
  try {
    await ElMessageBox.confirm('确定删除该模型？已激活的模型不可删除', '删除确认', {
      type: 'warning',
    })
    await deleteModel(id)
    recordLog('系统设置', '删除模型', `删除了模型 ID:${id}`, 1)
    ElMessage.success('模型已删除')
    fetchModels()
  } catch {
    /* 取消 */
  }
}

// -- Tab4: 用户管理 --
async function fetchUsers() {
  usersLoading.value = true
  try {
    const res = await getUsers({ page: usersPage.value, keyword: userKeyword.value || undefined })
    if (res.data.code === 0 && res.data.data.list.length) {
      users.value = res.data.data.list
      usersTotal.value = res.data.data.total
      usersLoading.value = false
      return
    }
  } catch {
    /* fallback */
  }
  let filtered = [...MOCK_USERS]
  if (userKeyword.value) {
    const kw = userKeyword.value.toLowerCase()
    filtered = filtered.filter(
      (u) => u.account.toLowerCase().includes(kw) || u.realname.includes(kw),
    )
  }
  usersTotal.value = filtered.length
  users.value = filtered.slice((usersPage.value - 1) * 10, usersPage.value * 10)
  usersLoading.value = false
}

function openUserDialog(mode: 'create' | 'edit', row?: SystemUser) {
  userDialogMode.value = mode
  if (mode === 'edit' && row) {
    editingUserId.value = row.id
    userForm.value = {
      account: row.account,
      password: '',
      realname: row.realname,
      role_id: row.role_id,
      phone: row.phone || '',
    }
  } else {
    editingUserId.value = null
    userForm.value = { account: '', password: '', realname: '', role_id: 4, phone: '' }
  }
  userDialogVisible.value = true
}

async function submitUser() {
  userSubmitting.value = true
  try {
    if (userDialogMode.value === 'create') {
      await createUser(userForm.value)
      recordLog('系统设置', '创建用户', `创建了新用户「${userForm.value.realname}」`, 1)
      ElMessage.success('用户创建成功')
    } else if (editingUserId.value) {
      await updateUser(editingUserId.value, userForm.value)
      ElMessage.success('用户更新成功')
    }
    userDialogVisible.value = false
    fetchUsers()
  } finally {
    userSubmitting.value = false
  }
}

async function handleLock(row: SystemUser) {
  try {
    const reason = await ElMessageBox.prompt('请输入锁定原因', '锁定账号', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await lockUser(row.id, { reason: reason.value || '管理员锁定' })
    recordLog('系统设置', '锁定账号', `锁定了用户「${row.realname}」`, 1)
    ElMessage.success('账号已锁定')
    fetchUsers()
  } catch {
    /* 取消 */
  }
}

async function handleUnlock(row: SystemUser) {
  try {
    await ElMessageBox.confirm(`确定解锁用户「${row.realname}」？`, '解锁确认')
    await unlockUser(row.id)
    recordLog('系统设置', '解锁账号', `解锁了用户「${row.realname}」`, 1)
    ElMessage.success('账号已解锁')
    fetchUsers()
  } catch {
    /* 取消 */
  }
}

async function handleResetPwd(row: SystemUser) {
  try {
    const pwd = await ElMessageBox.prompt('请输入新密码（留空则自动生成）', '重置密码', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputType: 'text',
    })
    await resetUserPassword(row.id, pwd.value ? { new_password: pwd.value } : undefined)
    recordLog('系统设置', '重置密码', `重置了用户「${row.realname}」的密码`, 1)
    ElMessage.success('密码重置成功')
    fetchUsers()
  } catch {
    /* 取消 */
  }
}

async function handleDelete(row: SystemUser) {
  try {
    await ElMessageBox.confirm(`确定删除用户「${row.realname}」？此操作不可撤销`, '删除确认', {
      type: 'warning',
    })
    await deleteUser(row.id)
    recordLog('系统设置', '删除用户', `删除了用户「${row.realname}」`, 1)
    ElMessage.success('用户已删除')
    fetchUsers()
  } catch {
    /* 取消 */
  }
}

// 路径变化时同步 activeTab
watch(() => route.path, () => {
  const resolved = resolveTabFromPath()
  if (activeTab.value !== resolved) activeTab.value = resolved
})

// ── 生命周期 ──
onMounted(() => {
  activeTab.value = resolveTabFromPath()
  fetchThresholds()
  fetchWeights()
  fetchModels()
  fetchUsers()
})
</script>

<template>
  <div class="page settings-page">
    <!-- ═══ 告警阈值配置 ═══ -->
    <template v-if="activeTab === 'thresholds'">
      <ElTable v-loading="thresholdsLoading" :data="thresholds" style="width: 100%">
        <ElTableColumn prop="metric" label="监控指标" min-width="140">
          <template #default="scope">
            {{
              metricLabelMap[(scope.row as ThresholdRule).metric] ??
                (scope.row as ThresholdRule).metric
            }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="预警上限" width="130" align="center">
          <template #default="scope">
            <ElInputNumber
              v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
              v-model="thresholdsEditing[(scope.row as ThresholdRule).id].warning_upper"
              :step="0.1"
              controls-position="right"
              style="width: 110px"
            />
            <span v-else>{{ (scope.row as ThresholdRule).warning_upper }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="预警下限" width="130" align="center">
          <template #default="scope">
            <ElInputNumber
              v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
              v-model="thresholdsEditing[(scope.row as ThresholdRule).id].warning_lower"
              :step="0.1"
              controls-position="right"
              style="width: 110px"
            />
            <span v-else>{{ (scope.row as ThresholdRule).warning_lower }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="紧急上限" width="130" align="center">
          <template #default="scope">
            <ElInputNumber
              v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
              v-model="thresholdsEditing[(scope.row as ThresholdRule).id].critical_upper"
              :step="0.1"
              controls-position="right"
              style="width: 110px"
            />
            <span v-else>{{ (scope.row as ThresholdRule).critical_upper }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="紧急下限" width="130" align="center">
          <template #default="scope">
            <ElInputNumber
              v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
              v-model="thresholdsEditing[(scope.row as ThresholdRule).id].critical_lower"
              :step="0.1"
              controls-position="right"
              style="width: 110px"
            />
            <span v-else>{{ (scope.row as ThresholdRule).critical_lower }}</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="防抖(秒)" width="120" align="center">
          <template #default="scope">
            <ElInputNumber
              v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
              v-model="thresholdsEditing[(scope.row as ThresholdRule).id].debounce_seconds"
              :min="10"
              :max="120"
              :step="5"
              controls-position="right"
              style="width:105px"
            />
            <span v-else>{{ (scope.row as ThresholdRule).debounce_seconds }}s</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="启用" width="70" align="center">
          <template #default="scope">
            <ElSwitch
              v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
              v-model="thresholdsEditing[(scope.row as ThresholdRule).id].enabled"
              :active-value="1"
              :inactive-value="0"
            />
            <ElTag
              v-else :type="(scope.row as ThresholdRule).enabled === 1 ? 'success' : 'info'"
            >
              {{ (scope.row as ThresholdRule).enabled === 1 ? '启用' : '停用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="150" fixed="right" align="center">
          <template #default="scope">
            <template v-if="thresholdsEditing[(scope.row as ThresholdRule).id]">
              <div class="threshold-actions">
                <ElButton
                  type="primary"
                  size="small"
                  :loading="saveLoadingTab1"
                  @click="saveThreshold((scope.row as ThresholdRule).id)"
                >
                  保存
                </ElButton>
                <ElButton
                  size="small"
                  @click="cancelEditThreshold((scope.row as ThresholdRule).id)"
                >
                  取消
                </ElButton>
              </div>
            </template>
            <ElButton
              v-else
              type="primary"
              link
              @click="startEditThreshold(scope.row as ThresholdRule)"
            >
              编辑
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>

    <!-- ═══ 多目标权重配置 ═══ -->
    <template v-if="activeTab === 'weights'">
      <ElCard v-loading="weightLoading" class="settings-page__weight-card" shadow="never">
        <div class="weight-section">
          <div class="weight-presets">
            <span class="weight-label">预设方案：</span>
            <ElButton
              v-for="p in presetOptions"
              :key="p.label"
              style="margin-right: 8px"
              @click="applyPreset(p)"
            >
              {{ p.label }}
            </ElButton>
          </div>
          <div class="weight-sliders">
            <div class="weight-row">
              <span class="weight-row__label">发电效益</span>
              <ElSlider
                v-model="weightForm.power_weight"
                :min="0"
                :max="1"
                :step="0.01"
                style="flex: 1; margin: 0 16px"
                @input="onSliderChange('power_weight')"
              />
              <span class="weight-row__value"
                >{{ (weightForm.power_weight * 100).toFixed(0) }}%</span
              >
            </div>
            <div class="weight-row">
              <span class="weight-row__label">防洪安全</span>
              <ElSlider
                v-model="weightForm.safety_weight"
                :min="0"
                :max="1"
                :step="0.01"
                style="flex: 1; margin: 0 16px"
                @input="onSliderChange('safety_weight')"
              />
              <span class="weight-row__value"
                >{{ (weightForm.safety_weight * 100).toFixed(0) }}%</span
              >
            </div>
            <div class="weight-row">
              <span class="weight-row__label">生态流量</span>
              <ElSlider
                v-model="weightForm.ecology_weight"
                :min="0"
                :max="1"
                :step="0.01"
                style="flex: 1; margin: 0 16px"
                @input="onSliderChange('ecology_weight')"
              />
              <span class="weight-row__value"
                >{{ (weightForm.ecology_weight * 100).toFixed(0) }}%</span
              >
            </div>
          </div>
          <div class="weight-summary">
            <span>合计：</span>
            <span :class="{ 'weight-summary--invalid': !weightValid }">{{ weightSum }}</span>
            <span v-if="!weightValid" class="weight-summary--warn"
              ><el-icon><Warning /></el-icon>三权重之和必须等于 1.0 才能保存</span
            >
          </div>
          <ElButton
            type="primary"
            :disabled="!weightValid"
            :loading="saveLoadingTab2"
            style="margin-top: 16px"
            @click="saveWeights"
          >
            保存并推送至边缘端
          </ElButton>
        </div>
      </ElCard>
    </template>

    <!-- ═══ 模型管理 ═══ -->
    <template v-if="activeTab === 'models'">
      <div class="settings-page__toolbar">
        <ElInput
          v-model="modelKeyword"
          placeholder="搜索模型名称"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @input="modelsPage = 1; fetchModels()"
        />
        <ElButton :icon="Refresh" @click="fetchModels"> 刷新 </ElButton>
        <ElUpload
          ref="uploadRef"
          :http-request="handleUpload"
          :limit="1"
          accept=".pt,.pth,.onnx,.h5,.pb,.zip"
          :show-file-list="false"
          :on-exceed="() => ElMessage.warning('仅允许上传一个文件')"
          style="display: inline-block; margin-left: auto"
        >
          <ElButton type="primary" :icon="Upload" :loading="uploading">
            {{ uploading ? `上传中 ${uploadProgress}%` : '上传模型' }}
          </ElButton>
          <template #tip>
            <div
              class="upload-tip"
              style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px"
            >
              支持 .pt / .pth / .onnx / .h5 / .pb / .zip，单文件 ≤500MB
            </div>
          </template>
        </ElUpload>
      </div>
      <ElTable
        v-loading="modelsLoading"
        :data="models"
        stripe
        border
        style="width: 100%; margin-top: 12px"
        table-layout="auto"
      >
        <ElTableColumn prop="name" label="模型名称" min-width="150" />
        <ElTableColumn label="类型" width="100">
          <template #default="scope">
            {{ modelTypeMap[(scope.row as ModelInfo).type] ?? (scope.row as ModelInfo).type }}
          </template>
        </ElTableColumn>
        <ElTableColumn prop="version" label="版本" width="80" />
        <ElTableColumn label="健康状态" width="100" align="center">
          <template #default="scope">
            <ElTag
              v-if="(scope.row as ModelInfo).health_grade"
              :color="healthGradeColor[(scope.row as ModelInfo).health_grade!] ?? '#6b7280'"
              effect="dark"
              size="small"
            >
              {{ (scope.row as ModelInfo).health_grade }} ·
              {{ (((scope.row as ModelInfo).overall_score ?? 0) * 100).toFixed(0) }}
            </ElTag>
            <span v-else>—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="90">
          <template #default="scope">
            <ElTag
              :type="
                ((scope.row as ModelInfo).status === 'active'
                  ? 'success'
                  : (scope.row as ModelInfo).status === 'validating'
                    ? 'warning'
                    : (scope.row as ModelInfo).status === 'deprecated'
                      ? 'danger'
                      : 'info') as 'success' | 'warning' | 'danger' | 'info'
              "
            >
              {{
                modelStatusMap[(scope.row as ModelInfo).status] ?? (scope.row as ModelInfo).status
              }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="accuracy" label="准确率" width="80">
          <template #default="scope"> {{ (scope.row as ModelInfo).accuracy ?? '-' }}% </template>
        </ElTableColumn>
        <ElTableColumn prop="size" label="大小(MB)" width="90" />
        <ElTableColumn prop="deployed_nodes" label="已下发节点" width="100" />
        <ElTableColumn label="操作" width="240" fixed="right">
          <template #default="scope">
            <ElButton
              v-if="(scope.row as ModelInfo).status !== 'active'"
              type="success"
              link
              @click="handleActivateModel((scope.row as ModelInfo).id)"
            >
              激活
            </ElButton>
            <ElButton
              v-else
              type="warning"
              link
              @click="handleRollbackModel((scope.row as ModelInfo).id)"
            >
              回滚
            </ElButton>
            <ElButton type="primary" link @click="handleDeployModel((scope.row as ModelInfo).id)">
              下发
            </ElButton>
            <ElButton
              v-if="(scope.row as ModelInfo).status !== 'active'"
              type="danger"
              link
              @click="handleDeleteModel((scope.row as ModelInfo).id)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="modelsPage"
        :page-size="10"
        :total="modelsTotal"
        layout="total, prev, pager, next"
        background
        style="margin-top: 12px; justify-content: flex-end"
        @current-change="fetchModels"
      />
    </template>

    <!-- ═══ 模型健康度 ═══ -->
    <template v-if="activeTab === 'ai-metrics'">
      <div class="gateai-tab-content">
        <ModelMetricsPanel />
      </div>
    </template>

    <!-- ═══ 物理防护配置 ═══ -->
    <template v-if="activeTab === 'physics-guard'">
      <div class="gateai-tab-content">
        <PhysicsGuardPanel />
      </div>
    </template>

    <!-- ═══ 配置变更历史 ═══ -->
    <template v-if="activeTab === 'physics-guard-history'">
      <div class="gateai-tab-content">
        <PhysicsGuardHistoryPanel />
      </div>
    </template>

    <!-- ═══ 闸门互锁规则 ═══ -->
    <template v-if="activeTab === 'gate-interlock'">
      <div class="gateai-tab-content">
        <GateInterlockPanel />
      </div>
    </template>

    <!-- ═══ 用户管理 ═══ -->
    <template v-if="activeTab === 'users'">
      <div class="settings-page__toolbar">
        <ElInput
          v-model="userKeyword"
          placeholder="搜索用户名/姓名"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
          @input="usersPage = 1; fetchUsers()"
        />
        <ElButton :icon="Refresh" @click="fetchUsers"> 刷新 </ElButton>
        <ElButton
          type="primary"
          :icon="Plus"
          style="margin-left: auto"
          @click="openUserDialog('create')"
        >
          新增用户
        </ElButton>
      </div>
      <ElTable
        v-loading="usersLoading"
        :data="users"
        stripe
        border
        style="width: 100%; margin-top: 12px"
        table-layout="auto"
      >
        <ElTableColumn type="index" label="#" width="50" align="center" />
        <ElTableColumn prop="account" label="用户名" min-width="100" />
        <ElTableColumn prop="realname" label="姓名" min-width="80" />
        <ElTableColumn label="角色" min-width="110" align="center">
          <template #default="scope">
            <ElTag type="info">
              {{
                roleLabel[(scope.row as SystemUser).role_id] ??
                (scope.row as SystemUser).role_name
              }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="80" align="center">
          <template #default="scope">
            <ElTag
              :type="(scope.row as SystemUser).is_enabled === 1 ? 'success' : 'danger'"
              effect="plain"
            >
              {{ (scope.row as SystemUser).is_enabled === 1 ? '启用' : '禁用' }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="phone" label="手机号" min-width="120" />
        <ElTableColumn prop="created_at" label="注册时间" min-width="150" />
        <ElTableColumn label="操作" width="240" fixed="right" align="center">
          <template #default="scope">
            <ElButton
              type="primary"
              link
              @click="openUserDialog('edit', scope.row as SystemUser)"
            >
              编辑
            </ElButton>
            <ElButton link @click="handleResetPwd(scope.row as SystemUser)"> 重置 </ElButton>
            <ElButton
              v-if="(scope.row as SystemUser).is_enabled === 1"
              type="warning"
              link
              @click="handleLock(scope.row as SystemUser)"
            >
              锁定
            </ElButton>
            <ElButton
              v-else type="success"
              link @click="handleUnlock(scope.row as SystemUser)"
            >
              解锁
            </ElButton>
            <ElButton type="danger" link @click="handleDelete(scope.row as SystemUser)">
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
      <ElPagination
        v-model:current-page="usersPage"
        :page-size="10"
        :total="usersTotal"
        layout="total, prev, pager, next"
        background
        style="margin-top: 12px; justify-content: flex-end"
        @current-change="fetchUsers"
      />

      <!-- 用户弹窗 -->
      <ElDialog
        v-model="userDialogVisible"
        :title="userDialogMode === 'create' ? '新增用户' : '编辑用户'"
        width="480px"
      >
        <ElForm
          :model="userForm"
          label-width="80px"
          :rules="
            userDialogMode === 'create'
              ? {
                account: FORM_RULES.account,
                password: FORM_RULES.password,
                realname: FORM_RULES.realname,
              }
              : { realname: FORM_RULES.realname }
          "
        >
          <ElFormItem v-if="userDialogMode === 'create'" label="用户名" prop="account">
            <ElInput v-model="userForm.account" placeholder="≥3位字母数字下划线" />
          </ElFormItem>
          <ElFormItem v-if="userDialogMode === 'create'" label="密码" prop="password">
            <ElInput
              v-model="userForm.password"
              type="password"
              placeholder="≥8位含字母数字"
              show-password
            />
          </ElFormItem>
          <ElFormItem label="姓名" prop="realname">
            <ElInput v-model="userForm.realname" placeholder="2-20个字符" maxlength="20" />
          </ElFormItem>
          <ElFormItem label="角色">
            <ElSelect v-model="userForm.role_id" style="width: 100%">
              <ElOption
                v-for="r in roleOptions"
                :key="r.value"
                :label="r.label"
                :value="r.value"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="手机号">
            <ElInput v-model="userForm.phone" placeholder="11位手机号" maxlength="11" />
          </ElFormItem>
        </ElForm>
        <template #footer>
          <ElButton @click="userDialogVisible = false"> 取消 </ElButton>
          <ElButton type="primary" :loading="userSubmitting" @click="submitUser">
            {{ userDialogMode === 'create' ? '创建' : '保存' }}
          </ElButton>
        </template>
      </ElDialog>
    </template>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  // 全局提大表格字号
  :deep(.el-table) {
    font-size: var(--font-size-base);
  }
  :deep(.el-table th) {
    font-size: var(--font-size-base);
    font-weight: 600;
  }
  :deep(.el-table td) {
    font-size: var(--font-size-base);
  }
  :deep(.el-tag) {
    font-size: var(--font-size-sm);
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  &__weight-card {
    :deep(.el-slider__runway) {
      height: 8px;
    }
    :deep(.el-slider__bar) {
      height: 8px;
      transition: width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    :deep(.el-slider__button-wrapper) {
      transition:
        left 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94),
        transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    :deep(.el-slider__button) {
      width: 20px;
      height: 20px;
    }
  }
}

.weight-section {
  display: flex;
  flex-direction: column;
  gap: 36px;
  padding: var(--spacing-lg) 0;
}

.weight-presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

.weight-label {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  margin-right: var(--spacing-md);
}

.weight-sliders {
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.weight-row {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) 0;
  &__label {
    width: 100px;
    flex-shrink: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text);
    font-weight: 500;
  }
  &__value {
    width: 60px;
    text-align: right;
    font-weight: 700;
    font-size: var(--font-size-lg);
    color: var(--color-primary);
  }
}

.weight-summary {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-xl);
  font-weight: 700;
  padding: var(--spacing-lg);
  background: var(--color-bg-dark);
  border-radius: var(--border-radius-base);

  &--invalid {
    color: #ef4444;
  }
  &--warn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-base);
    color: #ef4444;
    font-weight: 400;
  }
}

// 阈值表格编辑按钮区
.threshold-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}


// 阈值表格编辑按钮区
</style>
