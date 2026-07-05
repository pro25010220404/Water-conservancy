<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  ElSelect,
  ElOption,
  ElInput,
  ElButton,
  ElPagination,
  ElDialog,
  ElForm,
  ElFormItem,
  ElMessage,
  ElMessageBox,
  ElDescriptions,
  ElDescriptionsItem,
  ElDatePicker,
  ElTooltip,
} from 'element-plus'
import { Search, Refresh, VideoPlay, VideoPause } from '@element-plus/icons-vue'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import { DEBOUNCE_DELAY, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/constants'
import {
  ALARM_LEVEL_MAP,
  ALARM_TYPE_MAP,
  ALARM_STATUS_MAP,
  ALARM_LEVEL_OPTIONS,
  ALARM_TYPE_OPTIONS,
  ALARM_STATUS_OPTIONS,
  TIME_RANGE_OPTIONS,
  getAlarmActions,
  REMARK_MIN_LENGTH,
  REMARK_MAX_LENGTH,
  DEFAULT_EXCEED_WINDOW_SEC,
  WS_ALARM_CHANNEL,
} from '@/constants/alarm'
import type {
  AlarmRecord,
  AlarmFilterParams,
  AlarmExceedLog,
  AlarmPushMessage,
} from '@/types/alarm'
import type { PhysicsGuardSummary } from '@/types/dispatch'
import {
  getAlarmList,
  getAlarmDetail,
  confirmAlarm,
  handleAlarm,
  getAlarmExceedLogs,
  pollAlarmPush,
  getPhysicsGuardSummary,
} from '@/api/warning'
import { useAlarmNotify, pendingAlarmCount } from '@/composables/useAlarmNotify'
import { useWebSocket } from '@/composables/useWebSocket'

const { soundEnabled, toggleSound, handlePushMessage } = useAlarmNotify()
const router = useRouter()

const filter = reactive<AlarmFilterParams>({
  level: undefined,
  status: undefined,
  type: undefined,
  startTime: undefined,
  endTime: undefined,
  keyword: '',
  pageNum: 1,
  pageSize: DEFAULT_PAGE_SIZE,
})
const timePreset = ref('')
const customRange = ref<[Date, Date] | null>(null)
const expandedId = ref<number | null>(null)
const list = ref<AlarmRecord[]>([])
const total = ref(0)
const loading = ref(false)

const confirmVisible = ref(false)
const confirmRow = ref<AlarmRecord | null>(null)
const handleVisible = ref(false)
const handleRow = ref<AlarmRecord | null>(null)
const remark = ref('')
const detailVisible = ref(false)
const detailRow = ref<AlarmRecord | null>(null)
const physicsGuardCtx = ref<PhysicsGuardSummary | null>(null)
const exceedLogs = ref<AlarmExceedLog[]>([])
const exceedLoading = ref(false)
const exceedDialogVisible = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pushTimer: ReturnType<typeof setInterval> | null = null

const { connect: connectAlarmWs, disconnect: disconnectAlarmWs } = useWebSocket(WS_ALARM_CHANNEL, {
  reconnectMaxAttempts: 3,
  onMessage: (data) => {
    const msg = data as AlarmPushMessage
    if (msg?.type === 'alarm_new') {
      handlePushMessage(msg)
      fetchList()
    }
  },
})

async function pollAlarmUpdates() {
  try {
    const res = await pollAlarmPush()
    if (res?.data) {
      handlePushMessage(res.data)
      await fetchList()
    }
  } catch {
    /* mock/offline */
  }
}

async function fetchExceedLogs() {
  exceedLoading.value = true
  try {
    const res = await getAlarmExceedLogs({ keyword: filter.keyword || undefined })
    exceedLogs.value = res?.data?.list ?? []
  } finally {
    exceedLoading.value = false
  }
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getAlarmList({ ...filter })
    const payload = res?.data
    list.value = payload?.list ?? []
    total.value = payload?.total ?? 0
    pendingAlarmCount.value = payload?.pendingCount ?? 0
  } finally {
    loading.value = false
  }
}

async function openExceedDialog() {
  exceedDialogVisible.value = true
  await fetchExceedLogs()
}

function handleFilterChange() {
  filter.pageNum = 1
  fetchList()
}
function handleKeywordInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(handleFilterChange, DEBOUNCE_DELAY)
}
function formatTime(iso: string) {
  return iso.replace('T', ' ').substring(0, 19)
}

function handleReset() {
  filter.level = undefined
  filter.status = undefined
  filter.type = undefined
  filter.startTime = undefined
  filter.endTime = undefined
  filter.keyword = ''
  filter.pageNum = 1
  timePreset.value = ''
  customRange.value = null
  fetchList()
}
function handleTimePreset(val: string) {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString()
  if (val === 'today') {
    filter.startTime = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    filter.endTime = fmt(now)
    customRange.value = null
  } else if (val === '7days') {
    filter.startTime = fmt(new Date(now.getTime() - 7 * 86400000))
    filter.endTime = fmt(now)
    customRange.value = null
  } else if (val === '30days') {
    filter.startTime = fmt(new Date(now.getTime() - 30 * 86400000))
    filter.endTime = fmt(now)
    customRange.value = null
  } else if (val === 'custom') {
    filter.startTime = undefined
    filter.endTime = undefined
  } else {
    filter.startTime = undefined
    filter.endTime = undefined
    customRange.value = null
  }
  if (val !== 'custom') handleFilterChange()
}
function handleCustomRange(val: [Date, Date] | null) {
  if (!val) {
    filter.startTime = undefined
    filter.endTime = undefined
    return
  }
  filter.startTime = val[0].toISOString()
  filter.endTime = val[1].toISOString()
  handleFilterChange()
}

function toggleExpand(row: AlarmRecord) {
  expandedId.value = expandedId.value === row.id ? null : row.id
}

function levelClass(level: string) {
  return {
    urgent: level === 'URGENT',
    important: level === 'IMPORTANT',
    normal: level === 'NORMAL',
  }
}
function statusClass(s: string) {
  return { pending: s === 'pending', confirmed: s === 'confirmed', handled: s === 'handled' }
}

function handleAction(type: string, row: AlarmRecord, e?: Event) {
  e?.stopPropagation()
  if (type === 'confirm') {
    ElMessageBox.confirm('确认已知悉此告警？操作不可逆。', '二次确认', { type: 'warning' })
      .then(() => {
        confirmRow.value = row
        confirmVisible.value = true
      })
      .catch(() => {})
  } else if (type === 'handle') {
    if (row.status !== 'confirmed') {
      ElMessage.warning('请先确认告警后再处置')
      return
    }
    handleRow.value = row
    remark.value = ''
    handleVisible.value = true
  } else openDetail(row)
}

async function submitConfirm() {
  if (!confirmRow.value) return
  await confirmAlarm(confirmRow.value.id)
  ElMessage.success('告警已确认')
  confirmVisible.value = false
  fetchList()
}
async function submitHandle() {
  if (!handleRow.value) return
  if (remark.value.length < REMARK_MIN_LENGTH || remark.value.length > REMARK_MAX_LENGTH) {
    ElMessage.warning(`处置措施需 ${REMARK_MIN_LENGTH}~${REMARK_MAX_LENGTH} 字`)
    return
  }
  try {
    await ElMessageBox.confirm('确认提交处置措施？提交后不可修改。', '二次确认', {
      type: 'warning',
    })
    await handleAlarm({ id: handleRow.value.id, remark: remark.value })
    ElMessage.success('处置完成')
    handleVisible.value = false
    fetchList()
  } catch {
    /* cancelled */
  }
}
async function openDetail(row: AlarmRecord) {
  detailVisible.value = true
  physicsGuardCtx.value = null
  try {
    detailRow.value = (await getAlarmDetail(row.id)).data
  } catch {
    detailRow.value = row
  }
  if (detailRow.value?.type === 'MODEL_HEALTH_DEGRADED') {
    try {
      const res = await getPhysicsGuardSummary()
      physicsGuardCtx.value = res.data
    } catch {
      /* */
    }
  }
}

onMounted(() => {
  fetchList()
  connectAlarmWs()
  pushTimer = setInterval(pollAlarmUpdates, 45000)
})
onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pushTimer) clearInterval(pushTimer)
  disconnectAlarmWs()
})
</script>

<template>
  <div class="page alarm-page">
    <!-- 筛选区：级别 / 状态 / 类型 / 时间 / 关键词 -->
    <GlassPanel3D class="filter-panel">
      <div class="filter-grid">
        <div class="filter-item">
          <label>告警级别</label><ElSelect
            v-model="filter.level"
            placeholder="全部"
            clearable
            @change="handleFilterChange"
          >
            <ElOption
              v-for="o in ALARM_LEVEL_OPTIONS"
              :key="String(o.value)"
              :label="o.label"
              :value="o.value"
            />
          </ElSelect>
        </div>
        <div class="filter-item">
          <label>处理状态</label><ElSelect
            v-model="filter.status"
            placeholder="全部"
            clearable
            @change="handleFilterChange"
          >
            <ElOption
              v-for="o in ALARM_STATUS_OPTIONS"
              :key="String(o.value)"
              :label="o.label"
              :value="o.value"
            />
          </ElSelect>
        </div>
        <div class="filter-item">
          <label>告警类型</label><ElSelect
            v-model="filter.type"
            placeholder="全部"
            clearable
            @change="handleFilterChange"
          >
            <ElOption
              v-for="o in ALARM_TYPE_OPTIONS"
              :key="String(o.value)"
              :label="o.label"
              :value="o.value"
            />
          </ElSelect>
        </div>
        <div class="filter-item">
          <label>时间范围</label><ElSelect
v-model="timePreset"
placeholder="全部" clearable @change="handleTimePreset">
            <ElOption
              v-for="o in TIME_RANGE_OPTIONS"
              :key="o.value"
              :label="o.label"
              :value="o.value"
            />
          </ElSelect>
        </div>
        <div v-if="timePreset === 'custom'"
class="filter-item filter-item--range">
          <label>自定义时段</label>
          <ElDatePicker
            v-model="customRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            @change="handleCustomRange"
          />
        </div>
        <div class="filter-item filter-item--wide">
          <label>关键词</label><ElInput
            v-model="filter.keyword"
            placeholder="搜索告警内容或监测点位"
            clearable
            :prefix-icon="Search"
            @input="handleKeywordInput"
            @clear="handleFilterChange"
          />
        </div>
        <div class="filter-actions">
          <ElButton
type="primary" :icon="Search" @click="handleFilterChange"> 查询 </ElButton>
          <ElButton
:icon="Refresh" @click="handleReset"> 重置 </ElButton>
          <ElButton
            :icon="soundEnabled ? VideoPlay : VideoPause"
            circle
            title="告警声音提示"
            @click="toggleSound"
          />
          <span class="pending-badge">待处理 <strong>{{ pendingAlarmCount }}</strong></span>
        </div>
      </div>
    </GlassPanel3D>

    <!-- 告警表格 + 分页 -->
    <GlassPanel3D title="告警列表"
class="table-panel">
      <template #extra>
        <ElTooltip
          content="本列表仅含需处置的正式告警；短暂超限（&lt;30s）记入瞬时日志"
          placement="top"
        >
          <ElButton
link type="primary" size="small" @click="openExceedDialog"> 瞬时日志 </ElButton>
        </ElTooltip>
      </template>
      <div v-loading="loading" class="table-3d">
        <div class="table-3d__head">
          <span>时间</span><span>级别</span><span>类型</span><span>内容</span><span>当前值/阈值</span><span>持续时长</span><span>状态</span><span>操作</span>
        </div>
        <div
v-if="list.length === 0 && !loading" class="table-empty">暂无符合条件的告警记录</div>
        <template v-for="row in list"
:key="row.id">
          <div
            class="table-3d__row"
            :class="{ expanded: expandedId === row.id }"
            @click="toggleExpand(row)"
          >
            <span class="mono">{{ formatTime(row.createdAt) }}</span>
            <span><span class="level-badge"
:class="levelClass(row.level)">{{
                ALARM_LEVEL_MAP[row.level]?.label
            }}</span></span>
            <span>{{ ALARM_TYPE_MAP[row.type]?.label }}</span>
            <span class="content">{{ row.content }}</span>
            <span class="mono val-threshold">{{ row.currentValue }} / {{ row.threshold }}</span>
            <span
              class="duration"
              :class="{ 'duration--formal': row.durationSec >= DEFAULT_EXCEED_WINDOW_SEC }"
            >{{ row.durationSec }}s</span>
            <span><span class="status-dot"
:class="statusClass(row.status)" />{{
                ALARM_STATUS_MAP[row.status]?.label
            }}</span>
            <span class="actions"
@click.stop>
              <template v-for="act in getAlarmActions(row.status)"
:key="act.type">
                <button
                  v-if="act.type !== 'detail'"
                  class="act-btn"
                  @click="handleAction(act.type, row, $event)"
                >
                  {{ act.label }}
                </button>
                <button
                  v-else
                  class="act-btn act-btn--link"
                  @click="handleAction('detail', row, $event)"
                >
                  查看详情
                </button>
              </template>
            </span>
          </div>
          <div v-if="expandedId === row.id"
class="table-3d__expand">
            <div class="expand-title">监测快照</div>
            <template v-if="row.snapshot">
              <div class="expand-grid">
                <span>上游水位</span><strong>{{ row.snapshot.upstreamLevel }} m</strong>
                <span>下游水位</span><strong>{{ row.snapshot.downstreamLevel }} m</strong>
                <span>流量</span><strong>{{ row.snapshot.flowRate }} m³/s</strong>
                <span>闸门开度</span><strong>{{ row.snapshot.gateOpening }}%</strong>
                <span>快照时间</span><strong class="mono">{{ formatTime(row.snapshot.recordedAt) }}</strong>
              </div>
            </template>
            <div
v-else class="expand-empty">暂无监测快照</div>
          </div>
        </template>
      </div>
      <div class="table-footer">
        <ElPagination
          v-model:current-page="filter.pageNum"
          v-model:page-size="filter.pageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :total="total"
          layout="total, sizes, prev, pager, next"
          background
          small
          @current-change="fetchList"
          @size-change="
            (s: number) => {
              filter.pageSize = s
              filter.pageNum = 1
              fetchList()
            }
          "
        />
      </div>
    </GlassPanel3D>

    <!-- 瞬时超限日志（按需查看） -->
    <ElDialog
      v-model="exceedDialogVisible"
      title="瞬时超限日志"
      width="720px"
      class="exceed-dialog"
    >
      <p class="exceed-dialog__hint">
        持续不足 {{ DEFAULT_EXCEED_WINDOW_SEC }} 秒的短暂超限，仅作记录、不触发告警
      </p>
      <div v-loading="exceedLoading" class="exceed-table">
        <div class="exceed-table__head">
          <span>时间</span><span>监测点位</span><span>类型</span><span>当前值/阈值</span><span>持续时长</span>
        </div>
        <div v-if="exceedLogs.length === 0 && !exceedLoading"
class="table-empty">
          暂无瞬时超限记录
        </div>
        <div v-for="log in exceedLogs"
:key="log.id" class="exceed-table__row">
          <span class="mono">{{ formatTime(log.createdAt) }}</span>
          <span>{{ log.point }}</span>
          <span>{{ ALARM_TYPE_MAP[log.type]?.label }}</span>
          <span class="mono val-threshold">{{ log.value }} / {{ log.threshold }}</span>
          <span class="duration duration--log">{{ log.durationSec }}s</span>
        </div>
      </div>
    </ElDialog>

    <!-- 确认弹窗 -->
    <ElDialog v-model="confirmVisible"
title="确认告警" width="540px" class="glass-dialog">
      <ElDescriptions v-if="confirmRow"
:column="1" border size="small">
        <ElDescriptionsItem label="级别">
          <span class="level-badge" :class="levelClass(confirmRow.level)">{{
            ALARM_LEVEL_MAP[confirmRow.level]?.label
          }}</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="类型">
          {{ ALARM_TYPE_MAP[confirmRow.type]?.label }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="内容">
          {{ confirmRow.content }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="当前值/阈值">
          {{ confirmRow.currentValue }} / {{ confirmRow.threshold }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="触发时间">
          {{ formatTime(confirmRow.createdAt) }}
        </ElDescriptionsItem>
        <template v-if="confirmRow.snapshot">
          <ElDescriptionsItem label="快照水位">
            上游 {{ confirmRow.snapshot.upstreamLevel }} m / 下游
            {{ confirmRow.snapshot.downstreamLevel }} m
          </ElDescriptionsItem>
          <ElDescriptionsItem label="快照流量/开度">
            {{ confirmRow.snapshot.flowRate }} m³/s · 开度 {{ confirmRow.snapshot.gateOpening }}%
          </ElDescriptionsItem>
        </template>
      </ElDescriptions>
      <template #footer>
        <ElButton @click="confirmVisible = false"> 取消 </ElButton
        ><ElButton type="primary" @click="submitConfirm"> 确认已知悉 </ElButton>
      </template>
    </ElDialog>

    <!-- 处置弹窗 -->
    <ElDialog v-model="handleVisible"
title="处置告警" width="540px">
      <ElDescriptions v-if="handleRow"
:column="1" border size="small" class="handle-preview">
        <ElDescriptionsItem label="告警内容">
          {{ handleRow.content }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="监测点位">
          {{ handleRow.pointName }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="当前值/阈值">
          {{ handleRow.currentValue }} / {{ handleRow.threshold }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="持续时长"> {{ handleRow.durationSec }}s </ElDescriptionsItem>
      </ElDescriptions>
      <ElForm label-position="top">
        <ElFormItem label="处置措施" required>
          <ElInput
            v-model="remark"
            type="textarea"
            :rows="4"
            :placeholder="`处置措施（${REMARK_MIN_LENGTH}~${REMARK_MAX_LENGTH}字）`"
            :maxlength="REMARK_MAX_LENGTH"
            show-word-limit
          />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="handleVisible = false"> 取消 </ElButton
        ><ElButton type="primary" @click="submitHandle"> 提交处置 </ElButton>
      </template>
    </ElDialog>

    <!-- 已处置详情 -->
    <ElDialog v-model="detailVisible"
title="告警详情" width="560px">
      <ElDescriptions v-if="detailRow"
:column="1" border size="small">
        <ElDescriptionsItem label="级别">
          <span class="level-badge" :class="levelClass(detailRow.level)">{{
            ALARM_LEVEL_MAP[detailRow.level]?.label
          }}</span>
        </ElDescriptionsItem>
        <ElDescriptionsItem label="类型">
          {{ ALARM_TYPE_MAP[detailRow.type]?.label }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="监测点位">
          {{ detailRow.pointName }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="内容">
          {{ detailRow.content }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="当前值/阈值">
          {{ detailRow.currentValue }} / {{ detailRow.threshold }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="持续时长"> {{ detailRow.durationSec }}s </ElDescriptionsItem>
        <ElDescriptionsItem label="状态">
          <span class="status-dot" :class="statusClass(detailRow.status)" />{{
            ALARM_STATUS_MAP[detailRow.status]?.label
          }}
        </ElDescriptionsItem>
        <ElDescriptionsItem label="触发时间">
          {{ formatTime(detailRow.createdAt) }}
        </ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.confirmedByName"
label="确认人">
          {{ detailRow.confirmedByName }} ·
          {{ detailRow.confirmedAt ? formatTime(detailRow.confirmedAt) : '' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.handledByName"
label="处置人">
          {{ detailRow.handledByName }} ·
          {{ detailRow.handledAt ? formatTime(detailRow.handledAt) : '' }}
        </ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.remark"
label="处置备注">
          {{ detailRow.remark }}
        </ElDescriptionsItem>
        <template v-if="detailRow.type === 'MODEL_HEALTH_DEGRADED' && physicsGuardCtx">
          <ElDescriptionsItem label="关联配置版本">
            v{{ physicsGuardCtx.config_version }}（{{
              physicsGuardCtx.sync_status === 'synced' ? '边缘已同步' : '待同步'
            }}）
          </ElDescriptionsItem>
          <ElDescriptionsItem label="L3 熔断阈值">
            置信度 ≥ {{ physicsGuardCtx.fusion_l3_confidence }} · 风险概率 &lt;
            {{ physicsGuardCtx.fusion_l3_risk }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="处置建议">
            <div class="alarm-actions">
              <span>核查模型健康度后，可回滚物理防护配置或切换 L1 人工模式</span>
              <div>
                <ElButton
                  size="small"
                  type="primary"
                  link
                  @click="router.push('/settings/ai/metrics')"
                >
                  模型健康度
                </ElButton>
                <ElButton size="small"
type="primary" link @click="router.push('/dispatch')">
                  调度决策
                </ElButton>
                <ElButton
                  size="small"
                  type="primary"
                  link
                  @click="
                    router.push({
                      path: '/settings',
                      query: { tab: 'physics-guard-history', reservoir_id: '1' },
                    })
                  "
                >
                  配置回滚
                </ElButton>
              </div>
            </div>
          </ElDescriptionsItem>
        </template>
        <template v-if="detailRow.snapshot">
          <ElDescriptionsItem label="快照水位">
            上游 {{ detailRow.snapshot.upstreamLevel }} m / 下游
            {{ detailRow.snapshot.downstreamLevel }} m
          </ElDescriptionsItem>
          <ElDescriptionsItem label="快照流量/开度">
            {{ detailRow.snapshot.flowRate }} m³/s · 开度 {{ detailRow.snapshot.gateOpening }}%
          </ElDescriptionsItem>
        </template>
      </ElDescriptions>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.alarm-page {
  @include cockpit-page-base;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 16px 16px;
  font-size: $cockpit-font-base;
}
.alarm-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.filter-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: flex-end;
  padding: 4px;
}
.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  min-width: 120px;
  label {
    font-size: $cockpit-font-sm;
    color: $cockpit-text-dim;
    font-weight: 500;
  }
  :deep(.el-select),
  :deep(.el-input) {
    width: 100%;
  }
  &--wide {
    flex: 1 1 280px;
    min-width: 280px;
  }
  &--range {
    min-width: 360px;
    :deep(.el-date-editor) {
      width: 100%;
    }
  }
}
.filter-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.pending-badge {
  font-size: $cockpit-font-sm;
  color: $cockpit-text-dim;
  strong {
    color: #ff4757;
    font-size: $cockpit-font-xl;
    margin-left: 6px;
  }
}
.exceed-dialog__hint {
  margin: 0 0 12px;
  font-size: $cockpit-font-sm;
  color: $cockpit-text-dim;
}
.exceed-table {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  &__head,
  &__row {
    display: grid;
    grid-template-columns: 148px 1fr 88px 108px 120px;
    gap: 10px;
    padding: 12px 14px;
    font-size: $cockpit-font-sm;
    align-items: center;
  }
  &__head {
    color: $cockpit-text-dim;
    font-weight: 600;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }
  &__row {
    border-bottom: 1px solid #f1f5f9;
    &:last-child {
      border-bottom: none;
    }
  }
}
.duration--formal {
  color: #16a34a;
}
.duration--log {
  color: #64748b;
  font-weight: 500;
}
.table-panel {
  flex: 1;
  min-height: 420px;
  display: flex;
  flex-direction: column;
}
.table-3d {
  flex: 1;
  overflow: auto;
  &__head,
  &__row {
    display: grid;
    grid-template-columns: 148px 72px 88px 1fr 108px 72px 80px 120px;
    gap: 10px;
    padding: 12px 14px;
    font-size: $cockpit-font-sm;
    align-items: center;
  }
  &__head {
    color: $cockpit-accent;
    font-weight: 600;
    letter-spacing: 1px;
    border-bottom: 1px solid rgba(24, 144, 255, 0.12);
    background: rgba(24, 144, 255, 0.05);
    position: sticky;
    top: 0;
  }
  &__row {
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);
    transition: background 0.2s;
    cursor: pointer;
    &:hover {
      background: rgba(24, 144, 255, 0.04);
    }
    &.expanded {
      background: rgba(24, 144, 255, 0.06);
    }
  }
  &__expand {
    padding: 12px 14px 14px 148px;
    background: rgba(24, 144, 255, 0.03);
    border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  }
}
.val-threshold {
  color: #0ea5e9;
  font-weight: 600;
}
.expand-title {
  font-size: $cockpit-font-sm;
  color: $cockpit-accent;
  font-weight: 600;
  margin-bottom: 10px;
}
.expand-grid {
  display: grid;
  grid-template-columns: 80px 1fr 80px 1fr;
  gap: 8px 16px;
  font-size: $cockpit-font-sm;
  span {
    color: $cockpit-text-dim;
  }
  strong {
    color: $cockpit-text;
  }
}
.expand-empty {
  font-size: $cockpit-font-sm;
  color: $cockpit-text-dim;
}
.mono {
  font-family: 'SF Mono', monospace;
  font-size: $cockpit-font-sm;
  color: $cockpit-text-dim;
}
.content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.duration {
  color: #ffa502;
  font-weight: 600;
  font-family: 'SF Mono', monospace;
  font-size: $cockpit-font-sm;
}
.level-badge {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: $cockpit-font-xs;
  font-weight: 700;
  &.urgent {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
  }
  &.important {
    background: #fffbeb;
    color: #d97706;
    border: 1px solid #fde68a;
  }
  &.normal {
    background: #fefce8;
    color: #a16207;
    border: 1px solid #fef08a;
  }
}
.status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  &.pending {
    background: #ff4757;
    animation: pulse 1.5s infinite;
  }
  &.confirmed {
    background: #ffa502;
  }
  &.handled {
    background: #2ed573;
  }
}
.act-btn {
  padding: 6px 14px;
  font-size: $cockpit-font-sm;
  border: 1px solid rgba(24, 144, 255, 0.3);
  border-radius: 6px;
  background: #e6f4ff;
  color: $cockpit-accent;
  cursor: pointer;
  margin-right: 6px;
  &--link {
    border-color: rgba(15, 23, 42, 0.12);
    background: #fff;
    color: $cockpit-text-dim;
  }
}
.table-footer {
  padding-top: 14px;
  display: flex;
  justify-content: flex-end;
}
.table-empty {
  padding: 48px;
  text-align: center;
  color: $cockpit-text-dim;
  font-size: $cockpit-font-base;
}
.handle-preview {
  margin-bottom: 16px;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
:deep(.el-select),
:deep(.el-input) {
  --el-fill-color-blank: #ffffff;
}
:deep(.el-input__wrapper) {
  background: #ffffff;
  border-color: rgba(24, 144, 255, 0.2);
  box-shadow: none;
}
:deep(.el-input__inner) {
  color: $cockpit-text;
}
:deep(.el-dialog) {
  --el-bg-color: #ffffff;
}
:deep(.el-pagination) {
  --el-color-primary: #{$cockpit-accent};
}
</style>
