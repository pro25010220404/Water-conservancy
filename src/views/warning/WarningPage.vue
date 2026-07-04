<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import {
  ElSelect, ElOption, ElInput, ElButton, ElPagination,
  ElDialog, ElForm, ElFormItem, ElMessage, ElMessageBox, ElDescriptions, ElDescriptionsItem,
} from 'element-plus'
import { Search, Refresh, VideoPlay, VideoPause } from '@element-plus/icons-vue'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import { DEBOUNCE_DELAY, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/constants'
import {
  ALARM_LEVEL_MAP, ALARM_TYPE_MAP, ALARM_STATUS_MAP, ALARM_DEVICE_TYPE_MAP,
  ALARM_LEVEL_OPTIONS, ALARM_TYPE_OPTIONS, ALARM_STATUS_OPTIONS, ALARM_DEVICE_TYPE_OPTIONS,
  TIME_RANGE_OPTIONS, getAlarmActions, REMARK_MIN_LENGTH, REMARK_MAX_LENGTH,
  DEFAULT_EXCEED_WINDOW_SEC,
} from '@/constants/alarm'
import type { AlarmRecord, AlarmFilterParams, AlarmExceedLog, AlarmStatsResult } from '@/types/alarm'
import { getAlarmList, getAlarmDetail, confirmAlarm, handleAlarm, getAlarmExceedLogs, getAlarmStats } from '@/api/warning'
import { useAlarmNotify, pendingAlarmCount } from '@/composables/useAlarmNotify'

const { soundEnabled, toggleSound } = useAlarmNotify()

const filter = reactive<AlarmFilterParams>({
  level: undefined, status: undefined, type: undefined, deviceType: undefined,
  startTime: undefined, endTime: undefined, keyword: '',
  pageNum: 1, pageSize: DEFAULT_PAGE_SIZE,
})
const timePreset = ref('')
const list = ref<AlarmRecord[]>([])
const total = ref(0)
const loading = ref(false)
const exceedLogs = ref<AlarmExceedLog[]>([])
const stats = ref<AlarmStatsResult>({
  today: 0, pending: 0, handled: 0, falseAlarm: 0,
  levelDistribution: { URGENT: 0, IMPORTANT: 0, NORMAL: 0 },
})

const levelChartMax = computed(() => {
  const d = stats.value.levelDistribution
  return Math.max(d.URGENT, d.IMPORTANT, d.NORMAL, 1)
})

const confirmVisible = ref(false)
const confirmRow = ref<AlarmRecord | null>(null)
const handleVisible = ref(false)
const handleRow = ref<AlarmRecord | null>(null)
const remark = ref('')
const detailVisible = ref(false)
const detailRow = ref<AlarmRecord | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchList() {
  loading.value = true
  try {
    const res = await getAlarmList({ ...filter })
    list.value = res.data.list
    total.value = res.data.total
    pendingAlarmCount.value = res.data.pendingCount
  } finally { loading.value = false }
}
async function fetchExtras() {
  try {
    const [logsRes, statsRes] = await Promise.all([
      getAlarmExceedLogs({ keyword: filter.keyword || undefined }),
      getAlarmStats(),
    ])
    exceedLogs.value = logsRes.data.list
    stats.value = statsRes.data
  } catch { /* */ }
}

function handleFilterChange() { filter.pageNum = 1; fetchList(); fetchExtras() }
function handleKeywordInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(handleFilterChange, DEBOUNCE_DELAY)
}
function handleReset() {
  filter.level = undefined; filter.status = undefined; filter.type = undefined
  filter.deviceType = undefined
  filter.startTime = undefined; filter.endTime = undefined; filter.keyword = ''
  filter.pageNum = 1; timePreset.value = ''; fetchList(); fetchExtras()
}
function handleTimePreset(val: string) {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString()
  if (val === 'today') { filter.startTime = fmt(new Date(now.getFullYear(), now.getMonth(), now.getDate())); filter.endTime = fmt(now) }
  else if (val === '7days') { filter.startTime = fmt(new Date(now.getTime() - 7 * 86400000)); filter.endTime = fmt(now) }
  else if (val === '30days') { filter.startTime = fmt(new Date(now.getTime() - 30 * 86400000)); filter.endTime = fmt(now) }
  else { filter.startTime = undefined; filter.endTime = undefined }
  handleFilterChange()
}

function levelClass(level: string) {
  return { urgent: level === 'URGENT', important: level === 'IMPORTANT', normal: level === 'NORMAL' }
}
function statusClass(s: string) {
  return { pending: s === 'pending', confirmed: s === 'confirmed', handled: s === 'handled' }
}

function handleAction(type: string, row: AlarmRecord) {
  if (type === 'confirm') ElMessageBox.confirm('确认已知悉此告警？操作不可逆。', '确认告警', { type: 'warning' }).then(() => { confirmRow.value = row; confirmVisible.value = true }).catch(() => {})
  else if (type === 'handle') { handleRow.value = row; remark.value = ''; handleVisible.value = true }
  else openDetail(row)
}

async function submitConfirm() {
  if (!confirmRow.value) return
  await confirmAlarm(confirmRow.value.id)
  ElMessage.success('告警已确认'); confirmVisible.value = false; fetchList(); fetchExtras()
}
async function submitHandle() {
  if (!handleRow.value) return
  if (remark.value.length < REMARK_MIN_LENGTH || remark.value.length > REMARK_MAX_LENGTH) {
    ElMessage.warning(`处置措施需 ${REMARK_MIN_LENGTH}~${REMARK_MAX_LENGTH} 字`); return
  }
  await handleAlarm({ id: handleRow.value.id, remark: remark.value })
  ElMessage.success('处置完成'); handleVisible.value = false; fetchList(); fetchExtras()
}
async function openDetail(row: AlarmRecord) {
  detailVisible.value = true
  try { detailRow.value = (await getAlarmDetail(row.id)).data } catch { detailRow.value = row }
}

onMounted(() => { fetchList(); fetchExtras(); pollTimer = setInterval(() => { fetchList(); fetchExtras() }, 5000) })
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer); if (debounceTimer) clearTimeout(debounceTimer) })
</script>

<template>
  <div class="page alarm-page">
    <!-- 筛选区 -->
    <GlassPanel3D class="filter-panel">
      <div class="filter-grid">
        <div class="filter-item"><label>告警等级</label><ElSelect v-model="filter.level" placeholder="全部" clearable @change="handleFilterChange"><ElOption v-for="o in ALARM_LEVEL_OPTIONS" :key="String(o.value)" :label="o.label" :value="o.value" /></ElSelect></div>
        <div class="filter-item"><label>告警类型</label><ElSelect v-model="filter.type" placeholder="全部" clearable @change="handleFilterChange"><ElOption v-for="o in ALARM_TYPE_OPTIONS" :key="String(o.value)" :label="o.label" :value="o.value" /></ElSelect></div>
        <div class="filter-item"><label>时间范围</label><ElSelect v-model="timePreset" placeholder="全部" clearable @change="handleTimePreset"><ElOption v-for="o in TIME_RANGE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" /></ElSelect></div>
        <div class="filter-item"><label>设备类型</label><ElSelect v-model="filter.deviceType" placeholder="全部" clearable @change="handleFilterChange"><ElOption v-for="o in ALARM_DEVICE_TYPE_OPTIONS" :key="String(o.value)" :label="o.label" :value="o.value" /></ElSelect></div>
        <div class="filter-item"><label>处理状态</label><ElSelect v-model="filter.status" placeholder="全部" clearable @change="handleFilterChange"><ElOption v-for="o in ALARM_STATUS_OPTIONS" :key="String(o.value)" :label="o.label" :value="o.value" /></ElSelect></div>
        <div class="filter-item filter-item--wide"><label>关键词</label><ElInput v-model="filter.keyword" placeholder="模糊搜索告警内容、监测点位、类型..." clearable :prefix-icon="Search" @input="handleKeywordInput" @clear="handleFilterChange" /></div>
        <div class="filter-actions">
          <ElButton type="primary" :icon="Search" @click="handleFilterChange">查询</ElButton>
          <ElButton :icon="Refresh" @click="handleReset">重置</ElButton>
          <ElButton :icon="soundEnabled ? VideoPlay : VideoPause" circle @click="toggleSound" />
          <span class="pending-badge">未处理 <strong>{{ pendingAlarmCount }}</strong></span>
        </div>
      </div>
    </GlassPanel3D>

    <!-- 主区域 -->
    <div class="main-area">
      <GlassPanel3D title="告警数据列表" class="table-panel">
        <div class="table-3d" v-loading="loading">
          <div class="table-3d__head">
            <span>告警ID</span><span>告警时间</span><span>等级</span><span>类型</span><span>关联设备</span><span>告警内容</span><span>持续时长</span><span>状态</span><span>操作</span>
          </div>
          <div v-if="list.length === 0 && !loading" class="table-empty">暂无符合条件的告警记录</div>
          <div v-for="row in list" :key="row.id" class="table-3d__row">
            <span>{{ row.id }}</span>
            <span class="mono">{{ row.createdAt.replace('T', ' ').substring(0, 19) }}</span>
            <span><span class="level-badge" :class="levelClass(row.level)">{{ ALARM_LEVEL_MAP[row.level]?.label }}</span></span>
            <span>{{ ALARM_TYPE_MAP[row.type]?.label }}</span>
            <span>{{ row.pointName }}</span>
            <span class="content">{{ row.content }}</span>
            <span class="duration">{{ row.durationSec }}s</span>
            <span><span class="status-dot" :class="statusClass(row.status)" />{{ ALARM_STATUS_MAP[row.status]?.label }}</span>
            <span class="actions">
              <template v-for="act in getAlarmActions(row.status)" :key="act.type">
                <button v-if="act.type !== 'detail'" class="act-btn" @click="handleAction(act.type, row)">{{ act.label }}</button>
                <button v-else class="act-btn act-btn--link" @click="handleAction('detail', row)">详情</button>
              </template>
            </span>
          </div>
        </div>
        <div class="table-footer">
          <ElPagination v-model:current-page="filter.pageNum" v-model:page-size="filter.pageSize" :page-sizes="PAGE_SIZE_OPTIONS" :total="total" layout="total, sizes, prev, pager, next" background small @current-change="fetchList" @size-change="(s: number) => { filter.pageSize = s; filter.pageNum = 1; fetchList() }" />
        </div>
      </GlassPanel3D>

      <!-- 规则说明 -->
      <GlassPanel3D title="告警规则说明" class="rule-panel">
        <div class="rule-box rule-box--formal">
          <div class="rule-icon">⚠</div>
          <div><strong>正式告警</strong><p>持续超限 ≥{{ DEFAULT_EXCEED_WINDOW_SEC }}s 才触发，需确认/处置</p></div>
        </div>
        <div class="rule-box rule-box--log">
          <div class="rule-icon">📋</div>
          <div><strong>瞬时超限日志</strong><p>持续 &lt;{{ DEFAULT_EXCEED_WINDOW_SEC }}s 仅记录系统日志，不弹窗、不计角标</p></div>
        </div>
        <div class="log-section">
          <h4>最近超限日志（瞬时）</h4>
          <div v-for="log in exceedLogs" :key="log.id" class="log-row">
            <span class="mono dim">{{ log.createdAt.replace('T', ' ').substring(11, 19) }}</span>
            <span>{{ log.point }}</span>
            <span class="log-val">{{ log.value }}/{{ log.threshold }}</span>
            <span class="log-dur">{{ log.durationSec }}s</span>
          </div>
        </div>
      </GlassPanel3D>
    </div>

    <!-- 底部统计 -->
    <div class="stats-row">
      <GlassPanel3D v-for="(s, i) in [{l:'今日告警',v:stats.today,c:'#00d4ff'},{l:'待处置',v:stats.pending,c:'#ff4757'},{l:'已处置',v:stats.handled,c:'#2ed573'},{l:'误告警',v:stats.falseAlarm,c:'#6b7280'}]" :key="i" compact>
        <div class="stat-card"><span class="stat-card__val" :style="{ color: s.c }">{{ s.v }}</span><span class="stat-card__lbl">{{ s.l }}</span></div>
      </GlassPanel3D>
      <GlassPanel3D title="告警等级分布" compact class="stat-chart">
        <div class="ring-stats">
          <div class="ring-item">
            <div class="ring-bar ring-bar--r" :style="{ height: (stats.levelDistribution.URGENT / levelChartMax * 48) + 'px' }" />
            <span>紧急 {{ stats.levelDistribution.URGENT }}</span>
          </div>
          <div class="ring-item">
            <div class="ring-bar ring-bar--o" :style="{ height: (stats.levelDistribution.IMPORTANT / levelChartMax * 48) + 'px' }" />
            <span>重要 {{ stats.levelDistribution.IMPORTANT }}</span>
          </div>
          <div class="ring-item">
            <div class="ring-bar ring-bar--y" :style="{ height: (stats.levelDistribution.NORMAL / levelChartMax * 48) + 'px' }" />
            <span>一般 {{ stats.levelDistribution.NORMAL }}</span>
          </div>
        </div>
      </GlassPanel3D>
    </div>

    <!-- 弹窗 -->
    <ElDialog v-model="confirmVisible" title="确认告警" width="500px" class="glass-dialog">
      <ElDescriptions v-if="confirmRow" :column="1" border size="small">
        <ElDescriptionsItem label="级别"><span class="level-badge" :class="levelClass(confirmRow.level)">{{ ALARM_LEVEL_MAP[confirmRow.level]?.label }}</span></ElDescriptionsItem>
        <ElDescriptionsItem label="内容">{{ confirmRow.content }}</ElDescriptionsItem>
        <ElDescriptionsItem label="当前值/阈值">{{ confirmRow.currentValue }} / {{ confirmRow.threshold }}</ElDescriptionsItem>
      </ElDescriptions>
      <template #footer><ElButton @click="confirmVisible=false">取消</ElButton><ElButton type="primary" @click="submitConfirm">确认已知悉</ElButton></template>
    </ElDialog>

    <ElDialog v-model="handleVisible" title="处置告警" width="540px">
      <ElDescriptions v-if="handleRow" :column="1" border size="small" class="handle-preview">
        <ElDescriptionsItem label="告警内容">{{ handleRow.content }}</ElDescriptionsItem>
        <ElDescriptionsItem label="监测点位">{{ handleRow.pointName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="当前值/阈值">{{ handleRow.currentValue }} / {{ handleRow.threshold }}</ElDescriptionsItem>
        <ElDescriptionsItem label="持续时长">{{ handleRow.durationSec }}s（≥{{ DEFAULT_EXCEED_WINDOW_SEC }}s 正式告警）</ElDescriptionsItem>
      </ElDescriptions>
      <ElForm label-position="top"><ElFormItem label="处置措施" required><ElInput v-model="remark" type="textarea" :rows="4" :placeholder="`处置措施（${REMARK_MIN_LENGTH}~${REMARK_MAX_LENGTH}字）`" :maxlength="REMARK_MAX_LENGTH" show-word-limit /></ElFormItem></ElForm>
      <template #footer><ElButton @click="handleVisible=false">取消</ElButton><ElButton type="primary" @click="submitHandle">提交处置</ElButton></template>
    </ElDialog>

    <ElDialog v-model="detailVisible" title="告警详情" width="560px">
      <ElDescriptions v-if="detailRow" :column="1" border size="small">
        <ElDescriptionsItem label="编号">{{ detailRow.id }}</ElDescriptionsItem>
        <ElDescriptionsItem label="等级"><span class="level-badge" :class="levelClass(detailRow.level)">{{ ALARM_LEVEL_MAP[detailRow.level]?.label }}</span></ElDescriptionsItem>
        <ElDescriptionsItem label="类型">{{ ALARM_TYPE_MAP[detailRow.type]?.label }}</ElDescriptionsItem>
        <ElDescriptionsItem label="设备类型">{{ ALARM_DEVICE_TYPE_MAP[detailRow.deviceType]?.label }}</ElDescriptionsItem>
        <ElDescriptionsItem label="监测点位">{{ detailRow.pointName }}</ElDescriptionsItem>
        <ElDescriptionsItem label="内容">{{ detailRow.content }}</ElDescriptionsItem>
        <ElDescriptionsItem label="当前值/阈值">{{ detailRow.currentValue }} / {{ detailRow.threshold }}</ElDescriptionsItem>
        <ElDescriptionsItem label="持续时长">{{ detailRow.durationSec }}s</ElDescriptionsItem>
        <ElDescriptionsItem label="状态"><span class="status-dot" :class="statusClass(detailRow.status)" />{{ ALARM_STATUS_MAP[detailRow.status]?.label }}</ElDescriptionsItem>
        <ElDescriptionsItem label="告警时间">{{ detailRow.createdAt.replace('T', ' ').substring(0, 19) }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.confirmedByName" label="确认人">{{ detailRow.confirmedByName }} · {{ detailRow.confirmedAt?.replace('T', ' ').substring(0, 19) }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.handledByName" label="处置人">{{ detailRow.handledByName }} · {{ detailRow.handledAt?.replace('T', ' ').substring(0, 19) }}</ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.isFalseAlarm" label="误告警">是</ElDescriptionsItem>
        <ElDescriptionsItem v-if="detailRow.remark" label="处置备注">{{ detailRow.remark }}</ElDescriptionsItem>
        <template v-if="detailRow.snapshot">
          <ElDescriptionsItem label="快照水位">上游 {{ detailRow.snapshot.upstreamLevel }} m / 下游 {{ detailRow.snapshot.downstreamLevel }} m</ElDescriptionsItem>
          <ElDescriptionsItem label="快照流量/开度">{{ detailRow.snapshot.flowRate }} m³/s · 开度 {{ detailRow.snapshot.gateOpening }}%</ElDescriptionsItem>
        </template>
      </ElDescriptions>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.alarm-page { @include cockpit-page-base; display: flex; flex-direction: column; gap: 14px; padding: 0 0 16px; font-size: $cockpit-font-base; }
.filter-panel { margin: 0 16px; }
.filter-grid { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; padding: 4px; }
.filter-item {
  display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; min-width: 120px;
  label { font-size: $cockpit-font-sm; color: $cockpit-text-dim; font-weight: 500; }
  :deep(.el-select), :deep(.el-input) { width: 100%; }
  &--wide { flex: 1 1 300px; min-width: 300px; }
}
.filter-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.pending-badge { font-size: $cockpit-font-sm; color: $cockpit-text-dim; strong { color: #ff4757; font-size: $cockpit-font-xl; margin-left: 6px; } }
.main-area { display: grid; grid-template-columns: 1fr 300px; gap: 14px; padding: 0 16px; flex: 1; min-height: 0; }
.table-panel { min-height: 360px; display: flex; flex-direction: column; }
.table-3d { flex: 1; overflow: auto; &__head, &__row { display: grid; grid-template-columns: 60px 140px 70px 80px 100px 1fr 70px 80px 120px; gap: 10px; padding: 14px 14px; font-size: $cockpit-font-sm; align-items: center; }
  &__head { color: $cockpit-accent; font-size: $cockpit-font-sm; font-weight: 600; letter-spacing: 1px; border-bottom: 1px solid rgba(24,144,255,0.12); background: rgba(24,144,255,0.05); position: sticky; top: 0; }
  &__row { border-bottom: 1px solid rgba(15,23,42,0.06); transition: background 0.2s; &:hover { background: rgba(24,144,255,0.04); } }
}
.mono { font-family: 'SF Mono', monospace; font-size: $cockpit-font-sm; color: $cockpit-text-dim; }
.content { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.duration { color: #ffa502; font-weight: 600; font-family: 'SF Mono', monospace; font-size: $cockpit-font-sm; }
.level-badge { padding: 4px 12px; border-radius: 4px; font-size: $cockpit-font-xs; font-weight: 700; &.urgent { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; } &.important { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; } &.normal { background: #fefce8; color: #a16207; border: 1px solid #fef08a; } }
.status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; &.pending { background: #ff4757; animation: pulse 1.5s infinite; } &.confirmed { background: #ffa502; } &.handled { background: #2ed573; } }
.act-btn { padding: 6px 14px; font-size: $cockpit-font-sm; border: 1px solid rgba(24,144,255,0.3); border-radius: 6px; background: #e6f4ff; color: $cockpit-accent; cursor: pointer; margin-right: 6px; &--link { border-color: rgba(15,23,42,0.12); background: #fff; color: $cockpit-text-dim; } }
.table-footer { padding-top: 14px; display: flex; justify-content: flex-end; }
.table-empty { padding: 48px; text-align: center; color: $cockpit-text-dim; font-size: $cockpit-font-base; }
.handle-preview { margin-bottom: 16px; }
.rule-panel { font-size: $cockpit-font-base; }
.rule-box { display: flex; gap: 12px; padding: 14px; border-radius: 8px; margin-bottom: 12px; &--formal { background: rgba(255,71,87,0.08); border: 1px solid rgba(255,71,87,0.2); } &--log { background: rgba(107,114,128,0.1); border: 1px solid rgba(107,114,128,0.2); } strong { display: block; margin-bottom: 6px; font-size: $cockpit-font-md; } p { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin: 0; line-height: 1.5; } }
.rule-icon { font-size: 28px; }
.log-section h4 { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin-bottom: 10px; letter-spacing: 1px; font-weight: 600; }
.log-row { display: grid; grid-template-columns: 60px 1fr 80px 40px; gap: 8px; padding: 8px 0; font-size: $cockpit-font-sm; border-bottom: 1px solid rgba(15,23,42,0.06); .dim { color: $cockpit-text-dim; } .log-dur { color: #94a3b8; } }
.stats-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; padding: 0 16px; }
.stat-card { text-align: center; &__val { display: block; font-size: $cockpit-font-3xl; @include data-value; font-size: $cockpit-font-3xl; } &__lbl { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin-top: 4px; } }
.ring-stats { display: flex; gap: 20px; justify-content: center; }
.ring-item { text-align: center; font-size: $cockpit-font-sm; color: $cockpit-text-dim; }
.ring-bar { width: 28px; height: 48px; margin: 0 auto 6px; border-radius: 4px 4px 0 0; &--r { background: linear-gradient(180deg, #ff4757, rgba(255,71,87,0.3)); } &--o { background: linear-gradient(180deg, #ffa502, rgba(255,165,2,0.3)); } &--y { background: linear-gradient(180deg, #eccc68, rgba(236,204,104,0.3)); } }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
:deep(.el-select), :deep(.el-input) { --el-fill-color-blank: #ffffff; }
:deep(.el-input__wrapper) { background: #ffffff; border-color: rgba(24,144,255,0.2); box-shadow: none; }
:deep(.el-input__inner) { color: $cockpit-text; }
:deep(.el-dialog) { --el-bg-color: #ffffff; }
:deep(.el-pagination) { --el-color-primary: #{$cockpit-accent}; }
</style>
