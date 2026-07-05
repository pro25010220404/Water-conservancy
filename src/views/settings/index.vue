<script setup lang="ts">
// ============================================================
// 系统设置 — 7 Tab切换容器
// 按需求文档 5.2 节
// Tab4(AI健康度)/Tab5(物理防护)/Tab6(互锁规则)点击跳转子路由
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  ElTabs,
  ElTabPane,
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
import { FORM_RULES } from '@/constants/validation'
import {
  WEIGHT_PRESETS,
  MODEL_TYPE_MAP,
  MODEL_STATUS_MAP,
  METRIC_LABEL_MAP,
  USER_ROLE_OPTIONS,
} from '@/constants/settings'
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

const router = useRouter()
const route = useRoute()
const { record: recordLog } = useOperationLog()

// ── Tab 状态 ──
const activeTab = ref('thresholds')
const saveLoadingTab1 = ref(false)
const saveLoadingTab2 = ref(false)

// ── Tab1: 阈值 ──
const thresholds = ref<ThresholdRule[]>([])
const thresholdsLoading = ref(false)
const thresholdsEditing = ref<Record<number, ThresholdRule>>({})

// ── Tab2: 权重 ──
const weights = ref<WeightConfig | null>(null)
const weightForm = ref({ power_weight: 0.4, safety_weight: 0.35, ecology_weight: 0.25 })
const weightLoading = ref(false)

// ── Tab3: 模型 ──
const models = ref<ModelInfo[]>([])
const modelsTotal = ref(0)
const modelsPage = ref(1)
const modelsLoading = ref(false)
const modelKeyword = ref('')
const uploadRef = ref()
const uploading = ref(false)
const uploadProgress = ref(0)

// ── Tab7: 用户 ──
const users = ref<SystemUser[]>([])
const usersTotal = ref(0)
const usersPage = ref(1)
const usersLoading = ref(false)
const userKeyword = ref('')
const userDialogVisible = ref(false)
const userDialogMode = ref<'create' | 'edit'>('create')
const userForm = ref({ account: '', password: '', realname: '', role_id: 'operator', phone: '' })
const editingUserId = ref<number | null>(null)
const userSubmitting = ref(false)

// ── Computed ──
const weightSum = computed(
  () =>
    +(
      weightForm.value.power_weight +
      weightForm.value.safety_weight +
      weightForm.value.ecology_weight
    ).toFixed(2),
)
const weightValid = computed(() => Math.abs(weightSum.value - 1.0) < 0.001)

const roleLabelMap = computed(() => {
  const map: Record<string, string> = {}
  USER_ROLE_OPTIONS.forEach((r) => {
    map[r.value] = r.label
  })
  return map
})

// ── 三滑块联动 ──
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
]

// ── Tab 切换处理 ──
function onModelSearch() {
  modelsPage.value = 1
  fetchModels()
}
function onUserSearch() {
  usersPage.value = 1
  fetchUsers()
}
function onTabChange(tabName: string) {
  if (tabName === 'ai-health') {
    router.push('/settings/ai/metrics')
  } else if (tabName === 'physics-guard') {
    router.push('/settings/physics-guard')
  } else if (tabName === 'gate-interlock') {
    router.push('/settings/gate-interlock')
  }
}

// 根据当前路由同步 activeTab
function syncActiveTabFromRoute() {
  const path = route.path
  if (path.startsWith('/settings/ai')) activeTab.value = 'ai-health'
  else if (path.startsWith('/settings/physics-guard')) activeTab.value = 'physics-guard'
  else if (path.startsWith('/settings/gate-interlock')) activeTab.value = 'gate-interlock'
}

// ── Tab1: 阈值 ──
function fetchThresholds() {
  thresholdsLoading.value = true
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
  saveLoadingTab1.value = true
  try {
    await updateThreshold(id, edit)
    recordLog('系统设置', '修改', `更新了告警阈值`, 1)
    ElMessage.success('阈值已更新，已同步至边缘端')
    delete thresholdsEditing.value[id]
    fetchThresholds()
  } finally {
    saveLoadingTab1.value = false
  }
}

// ── Tab2: 权重 ──
function fetchWeights() {
  weightLoading.value = true
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
      '修改',
      `权重更新为发电${(weightForm.value.power_weight * 100).toFixed(0)}%/安全${(weightForm.value.safety_weight * 100).toFixed(0)}%/生态${(weightForm.value.ecology_weight * 100).toFixed(0)}%`,
      1,
    )
    ElMessage.success('权重已保存并推送至边缘端')
  } catch {
  } finally {
    saveLoadingTab2.value = false
  }
}

// ── Tab3: 模型 ──
function fetchModels() {
  modelsLoading.value = true
  let filtered = [...MOCK_MODELS]
  if (modelKeyword.value) {
    const kw = modelKeyword.value.toLowerCase()
    filtered = filtered.filter((m) => m.name.toLowerCase().includes(kw))
  }
  modelsTotal.value = filtered.length
  models.value = filtered.slice((modelsPage.value - 1) * 10, modelsPage.value * 10)
  modelsLoading.value = false
}
async function handleUpload(opts: { file: File }) {
  const formData = new FormData()
  formData.append('file', opts.file)
  formData.append('name', opts.file.name.replace(/\.[^.]+$/, ''))
  uploading.value = true
  uploadProgress.value = 0
  const timer = setInterval(() => {
    if (uploadProgress.value < 90) uploadProgress.value += 10
  }, 200)
  try {
    await uploadModel(formData)
    clearInterval(timer)
    uploadProgress.value = 100
    ElMessage.success('模型上传成功，进入验证阶段')
    uploadRef.value?.clearFiles()
    fetchModels()
  } catch {
    clearInterval(timer)
  } finally {
    uploading.value = false
  }
}
async function handleActivateModel(id: number) {
  try {
    await ElMessageBox.confirm('确定激活该模型？', '确认激活')
    await activateModel(id)
    recordLog('系统设置', '激活', `激活模型 ID:${id}`, 1)
    ElMessage.success('模型已激活')
    fetchModels()
  } catch {}
}
async function handleRollbackModel(id: number) {
  try {
    await ElMessageBox.confirm('确定回滚？', '确认回滚')
    await rollbackModel(id)
    ElMessage.success('模型已回滚')
    fetchModels()
  } catch {}
}
async function handleDeleteModel(id: number) {
  try {
    await ElMessageBox.confirm('确定删除？', '删除确认', { type: 'warning' })
    await deleteModel(id)
    ElMessage.success('模型已删除')
    fetchModels()
  } catch {}
}

// ── Tab7: 用户 ──
function fetchUsers() {
  usersLoading.value = true
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
      role_id: String(row.role_id),
      phone: row.phone || '',
    }
  } else {
    editingUserId.value = null
    userForm.value = { account: '', password: '', realname: '', role_id: 'operator', phone: '' }
  }
  userDialogVisible.value = true
}
async function submitUser() {
  userSubmitting.value = true
  try {
    if (userDialogMode.value === 'create') {
      await createUser({ ...userForm.value, role_id: Number(userForm.value.role_id) })
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
    await ElMessageBox.prompt('请输入锁定原因', '锁定账号')
    await lockUser(row.id, { reason: '管理员锁定' })
    recordLog('系统设置', '锁定', `锁定用户「${row.realname}」`, 1)
    ElMessage.success('账号已锁定')
    fetchUsers()
  } catch {}
}
async function handleUnlock(row: SystemUser) {
  try {
    await ElMessageBox.confirm(`确定解锁「${row.realname}」？`, '解锁确认')
    await unlockUser(row.id)
    ElMessage.success('账号已解锁')
    fetchUsers()
  } catch {}
}
async function handleResetPwd(row: SystemUser) {
  try {
    const pwd = await ElMessageBox.prompt('请输入新密码（留空自动生成）', '重置密码')
    await resetUserPassword(row.id, pwd.value ? { new_password: pwd.value } : undefined)
    ElMessage.success('密码已重置')
    fetchUsers()
  } catch {}
}
async function handleDeleteUser(row: SystemUser) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.realname}」？`, '删除确认', { type: 'warning' })
    await deleteUser(row.id)
    ElMessage.success('用户已删除')
    fetchUsers()
  } catch {}
}

// ── 生命周期 ──
onMounted(() => {
  syncActiveTabFromRoute()
  thresholds.value = [...MOCK_THRESHOLDS]
  weights.value = MOCK_WEIGHTS
  weightForm.value = {
    power_weight: MOCK_WEIGHTS.power_weight,
    safety_weight: MOCK_WEIGHTS.safety_weight,
    ecology_weight: MOCK_WEIGHTS.ecology_weight,
  }
  models.value = [...MOCK_MODELS]
  modelsTotal.value = MOCK_MODELS.length
  users.value = [...MOCK_USERS]
  usersTotal.value = MOCK_USERS.length
})
</script>

<template>
  <div class="settings-page">
    <ElTabs v-model="activeTab"
type="border-card" class="settings-tabs" @tab-change="onTabChange">
      <!-- ═══ Tab1: 告警阈值 ═══ -->
      <ElTabPane label="告警阈值配置" name="thresholds">
        <ElTable v-loading="thresholdsLoading"
:data="thresholds" style="width: 100%">
          <ElTableColumn label="监控指标"
min-width="140">
            <template #default="scope">
              {{
                METRIC_LABEL_MAP[(scope.row as ThresholdRule).metric] ??
                  (scope.row as ThresholdRule).metric
              }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="预警上限"
width="130" align="center">
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
          <ElTableColumn label="预警下限"
width="130" align="center">
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
          <ElTableColumn label="紧急上限"
width="130" align="center">
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
          <ElTableColumn label="紧急下限"
width="130" align="center">
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
          <ElTableColumn label="防抖(秒)"
width="120" align="center">
            <template #default="scope">
              <ElInputNumber
                v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
                v-model="thresholdsEditing[(scope.row as ThresholdRule).id].debounce_seconds"
                :min="10"
                :max="120"
                :step="5"
                controls-position="right"
                style="width: 105px"
              />
              <span v-else>{{ (scope.row as ThresholdRule).debounce_seconds }}s</span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="启用"
width="70" align="center">
            <template #default="scope">
              <ElSwitch
                v-if="thresholdsEditing[(scope.row as ThresholdRule).id]"
                v-model="thresholdsEditing[(scope.row as ThresholdRule).id].enabled"
                :active-value="1"
                :inactive-value="0"
              />
              <ElTag v-else :type="(scope.row as ThresholdRule).enabled === 1 ? 'success' : 'info'">
                {{ (scope.row as ThresholdRule).enabled === 1 ? '启用' : '停用' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="操作"
width="150" fixed="right" align="center">
            <template #default="scope">
              <template v-if="thresholdsEditing[(scope.row as ThresholdRule).id]">
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
      </ElTabPane>

      <!-- ═══ Tab2: 多目标权重 ═══ -->
      <ElTabPane label="多目标权重配置" name="weights">
        <ElCard v-loading="weightLoading"
shadow="never"
>
          <div class="weight-section">
            <div class="weight-presets">
              <span class="weight-presets__label">预设方案：</span>
              <ElButton
                v-for="p in WEIGHT_PRESETS"
                :key="p.id"
                style="margin-right: 8px"
                @click="
                  weightForm = {
                    power_weight: p.power,
                    safety_weight: p.safety,
                    ecology_weight: p.eco,
                  }
                "
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
                <span class="weight-row__value">{{ (weightForm.power_weight * 100).toFixed(0) }}%</span>
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
                <span class="weight-row__value">{{ (weightForm.safety_weight * 100).toFixed(0) }}%</span>
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
                <span class="weight-row__value">{{ (weightForm.ecology_weight * 100).toFixed(0) }}%</span>
              </div>
            </div>
            <div class="weight-summary">
              <span>合计：</span>
              <span :class="{ 'weight-summary--invalid': !weightValid }">{{ weightSum }}</span>
              <span v-if="!weightValid"
class="weight-summary--warn"
                ><el-icon><Warning /></el-icon>三权重之和必须等于 1.0 才能保存</span>
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
      </ElTabPane>

      <!-- ═══ Tab3: 模型管理 ═══ -->
      <ElTabPane label="模型管理" name="models">
        <div class="settings-toolbar">
          <ElInput
            v-model="modelKeyword"
            placeholder="搜索模型"
            :prefix-icon="Search"
            clearable
            style="width: 220px"
            @input="onModelSearch()"
          />
          <ElButton :icon="Refresh"
@click="fetchModels"
>
刷新
</ElButton>
          <ElUpload
            ref="uploadRef"
            :http-request="handleUpload"
            :limit="1"
            accept=".pt,.pth,.onnx,.h5,.pb,.zip"
            :show-file-list="false"
            style="display: inline-block; margin-left: auto"
          >
            <ElButton type="primary"
:icon="Upload" :loading="uploading">
              {{ uploading ? `上传中 ${uploadProgress}%` : '上传模型' }}
            </ElButton>
          </ElUpload>
        </div>
        <ElTable
          v-loading="modelsLoading"
          :data="models"
          stripe
          border
          style="width: 100%; margin-top: 12px"
        >
          <ElTableColumn prop="name"
label="模型名称" min-width="150"
/>
          <ElTableColumn label="类型"
width="100">
            <template #default="scope">
              {{ MODEL_TYPE_MAP[(scope.row as ModelInfo).type] ?? (scope.row as ModelInfo).type }}
            </template>
          </ElTableColumn>
          <ElTableColumn prop="version"
label="版本" width="80"
/>
          <ElTableColumn label="状态"
width="90">
            <template #default="scope">
              <ElTag
                :type="
                  ((scope.row as ModelInfo).status === 'active'
                    ? 'success'
                    : (scope.row as ModelInfo).status === 'validating'
                      ? 'warning'
                      : (scope.row as ModelInfo).status === 'deprecated'
                        ? 'danger'
                        : 'info') as any
                "
              >
                {{
                  MODEL_STATUS_MAP[(scope.row as ModelInfo).status] ??
                  (scope.row as ModelInfo).status
                }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="accuracy"
label="准确率" width="80">
            <template #default="scope">
{{ (scope.row as ModelInfo).accuracy ?? '-' }}%
</template>
          </ElTableColumn>
          <ElTableColumn prop="size"
label="大小(MB)" width="90"
/>
          <ElTableColumn prop="deployed_nodes"
label="已下发节点" width="100"
/>
          <ElTableColumn label="操作"
width="220" fixed="right">
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
              <ElButton type="primary" link @click="router.push('/settings/ai/compare')">
                对比
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
      </ElTabPane>

      <!-- ═══ Tab4: AI模型健康度 → 跳转子路由 ═══ -->
      <ElTabPane label="AI模型健康度"
name="ai-health" />

      <!-- ═══ Tab5: 物理防护配置 → 跳转子路由 ═══ -->
      <ElTabPane label="物理防护配置"
name="physics-guard" />

      <!-- ═══ Tab6: 闸门互锁规则 → 跳转子路由 ═══ -->
      <ElTabPane label="闸门互锁规则"
name="gate-interlock" />

      <!-- ═══ Tab7: 用户管理 ═══ -->
      <ElTabPane label="用户管理" name="users">
        <div class="settings-toolbar">
          <ElInput
            v-model="userKeyword"
            placeholder="搜索用户名/姓名"
            :prefix-icon="Search"
            clearable
            style="width: 220px"
            @input="onUserSearch()"
          />
          <ElButton :icon="Refresh"
@click="fetchUsers"
>
刷新
</ElButton>
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
        >
          <ElTableColumn type="index"
label="#" width="50" align="center"
/>
          <ElTableColumn prop="account"
label="用户名" min-width="100"
/>
          <ElTableColumn prop="realname"
label="姓名" min-width="80"
/>
          <ElTableColumn label="角色"
min-width="120" align="center">
            <template #default="scope">
              <ElTag>
                {{
                  roleLabelMap[String((scope.row as SystemUser).role_id)] ??
                    (scope.row as SystemUser).role_name
                }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态"
width="80" align="center">
            <template #default="scope">
              <ElTag
                :type="(scope.row as SystemUser).is_enabled === 1 ? 'success' : 'danger'"
                effect="plain"
              >
                {{ (scope.row as SystemUser).is_enabled === 1 ? '正常' : '锁定' }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn prop="phone"
label="手机号" min-width="120"
/>
          <ElTableColumn prop="created_at"
label="注册时间" min-width="150"
/>
          <ElTableColumn label="操作"
width="260" fixed="right" align="center">
            <template #default="scope">
              <ElButton
                type="primary"
                link
                @click="openUserDialog('edit', scope.row as SystemUser)"
              >
                编辑
              </ElButton>
              <ElButton link
@click="handleResetPwd(scope.row as SystemUser)"
>
重置密码
</ElButton>
              <ElButton
                v-if="(scope.row as SystemUser).is_enabled === 1"
                type="warning"
                link
                @click="handleLock(scope.row as SystemUser)"
              >
                锁定
              </ElButton>
              <ElButton v-else type="success" link @click="handleUnlock(scope.row as SystemUser)">
                解锁
              </ElButton>
              <ElButton type="danger" link @click="handleDeleteUser(scope.row as SystemUser)">
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
          <ElForm :model="userForm"
label-width="80px">
            <ElFormItem v-if="userDialogMode === 'create'" label="用户名" required>
              <ElInput v-model="userForm.account" placeholder="≥3位字母数字下划线" />
            </ElFormItem>
            <ElFormItem v-if="userDialogMode === 'create'" label="密码" required>
              <ElInput
                v-model="userForm.password"
                type="password"
                placeholder="≥8位含字母数字"
                show-password
              />
            </ElFormItem>
            <ElFormItem label="姓名" required>
              <ElInput v-model="userForm.realname" placeholder="2-20个字符" maxlength="20" />
            </ElFormItem>
            <ElFormItem label="角色">
              <ElSelect v-model="userForm.role_id"
style="width: 100%"
>
                <ElOption
                  v-for="r in USER_ROLE_OPTIONS"
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
      </ElTabPane>
    </ElTabs>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  :deep(.el-table) {
    font-size: var(--font-size-base, 14px);
  }
  :deep(.el-table th) {
    font-size: var(--font-size-base, 14px);
    font-weight: 600;
  }

  .settings-tabs {
    :deep(.el-tabs__content) {
      padding: var(--spacing-lg, 24px);
    }
  }
}

.settings-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  flex-wrap: wrap;
}

.weight-section {
  display: flex;
  flex-direction: column;
  gap: 36px;
  padding: var(--spacing-lg, 24px) 0;

  // 滑块动画效果
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
.weight-presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-md, 16px);
  &__label {
    font-size: var(--font-size-lg, 16px);
    color: var(--color-text-secondary);
    margin-right: var(--spacing-md, 16px);
  }
}
.weight-sliders {
  display: flex;
  flex-direction: column;
  gap: 40px;
}
.weight-row {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm, 8px) 0;
  &__label {
    width: 100px;
    flex-shrink: 0;
    font-size: var(--font-size-lg, 16px);
    font-weight: 500;
  }
  &__value {
    width: 60px;
    text-align: right;
    font-weight: 700;
    font-size: var(--font-size-lg, 16px);
    color: var(--color-primary);
  }
}
.weight-summary {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 8px);
  font-size: var(--font-size-xl, 20px);
  font-weight: 700;
  padding: var(--spacing-lg, 24px);
  background: var(--color-bg-dark);
  border-radius: var(--border-radius-base);
  &--invalid {
    color: #ef4444;
  }
  &--warn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-base, 14px);
    color: #ef4444;
    font-weight: 400;
  }
}
</style>
