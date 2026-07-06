<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ElSelect, ElOption, ElTable, ElTableColumn, ElSwitch, ElTag, ElMessage,
  ElButton, ElDialog, ElForm, ElFormItem, ElInput, ElInputNumber, ElDatePicker,
} from 'element-plus'
import type { GateInterlockRule, GateInterlockLog } from '@/types/gateai'
import {
  fetchReservoirOptions, fetchInterlockRules, toggleInterlockRule,
  fetchInterlockLogs, updateInterlockRule, createInterlockRule, reorderInterlockRules,
} from '@/api/gateaiSettings'
import { buildSettingsPath } from '@/constants/settings'

const props = withDefaults(defineProps<{
  fixedView?: 'rules' | 'logs' | 'both'
  standalone?: boolean
}>(), { fixedView: 'both', standalone: false })

const route = useRoute()
const router = useRouter()
const reservoirs = ref<{ id: number; name: string }[]>([])
const reservoirId = ref(1)
const rules = ref<GateInterlockRule[]>([])
const logs = ref<GateInterlockLog[]>([])
const view = ref<'rules' | 'logs'>(props.fixedView === 'logs' ? 'logs' : 'rules')
const loading = ref(false)
const editVisible = ref(false)
const editMode = ref<'create' | 'edit'>('edit')
const editForm = ref<Partial<GateInterlockRule>>({})
const editingId = ref<number | null>(null)
const dragId = ref<number | null>(null)

const logRuleFilter = ref<string[]>([])
const logTimeRange = ref<[Date, Date] | null>(null)

function last7DaysRange(): [Date, Date] {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 7)
  return [start, end]
}

const drillRuleLabel = computed(() => {
  if (!logRuleFilter.value.length) return ''
  const code = logRuleFilter.value[0]
  return rules.value.find((r) => r.rule_code === code)?.rule_name
    ?? ruleOptions.value.find((o) => o.value === code)?.label
    ?? code
})

const ruleOptions = computed(() =>
  rules.value.map((r) => ({ value: r.rule_code, label: r.rule_name })),
)

const filteredLogs = computed(() => logs.value)

async function load() {
  loading.value = true
  try {
    rules.value = await fetchInterlockRules(reservoirId.value)
    const params: { reservoirId?: number; ruleCodes?: string[]; startTime?: string; endTime?: string } = {
      reservoirId: reservoirId.value,
    }
    if (logRuleFilter.value.length) params.ruleCodes = logRuleFilter.value
    if (logTimeRange.value) {
      params.startTime = logTimeRange.value[0].toISOString()
      params.endTime = logTimeRange.value[1].toISOString()
    }
    logs.value = await fetchInterlockLogs(params)
  } finally { loading.value = false }
}

async function onToggle(rule: GateInterlockRule, val: boolean) {
  const prev = rule.enabled
  rule.enabled = val
  try {
    rule.enabled = await toggleInterlockRule(rule.id, val)
    ElMessage.success(rule.enabled ? '规则已启用' : '规则已禁用')
  } catch {
    rule.enabled = prev
    ElMessage.error('操作失败，请重新登录后重试')
  }
}

function openCreate() {
  editMode.value = 'create'
  editingId.value = null
  const maxP = rules.value.reduce((m, r) => Math.max(m, r.priority), 0)
  editForm.value = {
    rule_name: '', description: '', trigger_label: '', action_label: '',
    rule_code: `custom_${Date.now()}`, reservoir_id: reservoirId.value,
    enabled: true, priority: maxP + 1,
  }
  editVisible.value = true
}

function openEdit(rule: GateInterlockRule) {
  editMode.value = 'edit'
  editingId.value = rule.id
  editForm.value = { ...rule }
  editVisible.value = true
}

async function submitEdit() {
  if (editMode.value === 'create') {
    await createInterlockRule(editForm.value as Omit<GateInterlockRule, 'id' | 'trigger_count_7d'>)
    ElMessage.success('规则已创建')
  } else if (editingId.value) {
    await updateInterlockRule(editingId.value, editForm.value)
    ElMessage.success('规则已更新')
  }
  editVisible.value = false
  await load()
}

function onDragStart(rule: GateInterlockRule) { dragId.value = rule.id }
function onDragOver(e: DragEvent) { e.preventDefault() }
async function onDrop(target: GateInterlockRule) {
  if (dragId.value == null || dragId.value === target.id) return
  const ids = rules.value.map((r) => r.id)
  const fromIdx = ids.indexOf(dragId.value)
  const toIdx = ids.indexOf(target.id)
  ids.splice(fromIdx, 1)
  ids.splice(toIdx, 0, dragId.value)
  await reorderInterlockRules(ids)
  dragId.value = null
  await load()
}

function openingCell(before: number[], after: number[], idx: number) {
  const changed = before[idx] !== after[idx]
  return changed ? `${before[idx]}→${after[idx]}` : String(before[idx])
}

function isGateChanged(before: number[], after: number[], idx: number) {
  return before[idx] !== after[idx]
}

function applyReservoirQuery() {
  const id = Number(route.query.reservoir_id)
  if (id >= 1 && reservoirs.value.some((r) => r.id === id)) {
    reservoirId.value = id
  }
}

function goDispatchDecision(decisionId: number) {
  router.push({ path: '/dispatch', query: { recordId: String(decisionId) } })
}

/** 近7天触发次数下钻：查看该规则近7天触发日志（文档 §3.6） */
function openRuleLogs(rule: GateInterlockRule) {
  logRuleFilter.value = [rule.rule_code]
  logTimeRange.value = last7DaysRange()

  if (props.fixedView === 'both') {
    view.value = 'logs'
    const target = buildSettingsPath('gate-interlock', {
      rule_code: rule.rule_code,
      reservoir_id: reservoirId.value,
      days: '7',
    })
    router.replace(target)
    load()
    return
  }

  router.push({
    path: '/settings/gate-interlock/logs',
    query: {
      rule_code: rule.rule_code,
      reservoir_id: String(reservoirId.value),
      days: '7',
    },
  })
}

function clearLogFilters() {
  logRuleFilter.value = []
  logTimeRange.value = null
  const q = { ...route.query }
  delete q.rule_code
  delete q.days
  router.replace({ path: route.path, query: q })
  load()
}

function applyLogDrillQuery() {
  const code = route.query.rule_code as string | undefined
  if (code) logRuleFilter.value = [code]
  if (route.query.days === '7') logTimeRange.value = last7DaysRange()
  if (code || route.query.days === '7') view.value = 'logs'
}
watch(reservoirId, load)
watch(() => route.query.reservoir_id, applyReservoirQuery)
watch(() => [route.query.rule_code, route.query.days] as const, () => {
  applyLogDrillQuery()
  load()
})
watch([logRuleFilter, logTimeRange], load)
onMounted(async () => {
  reservoirs.value = await fetchReservoirOptions()
  applyReservoirQuery()
  applyLogDrillQuery()
  await load()
})
</script>

<template>
  <div v-loading="loading" class="gateai-panel">
    <div class="gateai-panel__toolbar">
      <span>水库</span>
      <ElSelect v-model="reservoirId" style="width:200px">
        <ElOption v-for="r in reservoirs" :key="r.id" :label="r.name" :value="r.id" />
      </ElSelect>
      <div v-if="fixedView === 'both'" class="view-toggle">
        <button type="button" :class="{ active: view === 'rules' }" @click="view = 'rules'">互锁规则</button>
        <button type="button" :class="{ active: view === 'logs' }" @click="view = 'logs'">触发日志</button>
      </div>
      <ElButton v-if="fixedView !== 'logs'" type="primary" @click="openCreate">新建规则</ElButton>
      <ElButton v-if="standalone && fixedView !== 'logs'" type="primary" link @click="router.push({ path: '/settings/gate-interlock/logs', query: { reservoir_id: String(reservoirId) } })">查看触发日志</ElButton>
      <ElButton v-if="standalone && fixedView === 'logs'" type="primary" link @click="router.push('/settings/gate-interlock')">返回规则配置</ElButton>
    </div>

    <div v-if="fixedView === 'logs' || (fixedView === 'both' && view === 'logs')" class="log-filters">
      <div v-if="logRuleFilter.length" class="log-drill-hint">
        <span>已筛选：<strong>{{ drillRuleLabel }}</strong><template v-if="logTimeRange"> · 近7天</template></span>
        <ElButton link type="primary" @click="clearLogFilters">清除筛选</ElButton>
      </div>
      <ElSelect v-model="logRuleFilter" multiple collapse-tags placeholder="筛选规则" style="width:240px">
        <ElOption v-for="o in ruleOptions" :key="o.value" :label="o.label" :value="o.value" />
      </ElSelect>
      <ElDatePicker v-model="logTimeRange" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" style="width:360px" />
    </div>

    <ElTable
      v-if="fixedView === 'rules' || (fixedView === 'both' && view === 'rules')"
      :data="rules" stripe border row-key="id" style="width:100%"
    >
      <ElTableColumn label="作用范围" min-width="110">
        <template #default="{ row }">
          <ElTag :type="(row as GateInterlockRule).reservoir_id ? 'warning' : 'info'">
            {{ (row as GateInterlockRule).reservoir_id ? '水库专属' : '全局默认' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="优先级" width="88" align="center">
        <template #default="scope">
          <span
            class="priority-badge"
            title="拖拽调整优先级"
            draggable="true"
            @dragstart="onDragStart(scope.row as GateInterlockRule)"
            @dragover="onDragOver"
            @drop="onDrop(scope.row as GateInterlockRule)"
          >{{ (scope.row as GateInterlockRule).priority }}</span>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="rule_name" label="规则名称" min-width="150" />
      <ElTableColumn prop="description" label="说明" min-width="200" show-overflow-tooltip />
      <ElTableColumn prop="trigger_label" label="触发条件" min-width="160" />
      <ElTableColumn prop="action_label" label="约束动作" min-width="160" />
      <ElTableColumn label="近7天" min-width="96" align="center">
        <template #header>
          <span title="点击查看该规则近7天触发记录">近7天</span>
        </template>
        <template #default="{ row }">
          <ElTag
            effect="plain"
            class="trigger-count-tag"
            :title="`查看「${(row as GateInterlockRule).rule_name}」近7天触发记录`"
            @click.stop="openRuleLogs(row as GateInterlockRule)"
          >
            {{ (row as GateInterlockRule).trigger_count_7d }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="启用" min-width="90" align="center">
        <template #default="scope">
          <ElSwitch :model-value="(scope.row as GateInterlockRule).enabled" @change="(v) => onToggle(scope.row as GateInterlockRule, v === true)" />
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" min-width="90" align="center" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" @click="openEdit(row as GateInterlockRule)">编辑</ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <ElTable v-else :data="filteredLogs" stripe border style="width:100%">
      <ElTableColumn prop="trigger_time" label="触发时间" min-width="190" />
      <ElTableColumn prop="reservoir_name" label="水库" min-width="100" />
      <ElTableColumn prop="rule_name" label="规则" min-width="150" />
      <ElTableColumn label="水位快照" min-width="170">
        <template #default="{ row }">上 {{ row.upstream_level }} / 下 {{ row.downstream_level }}</template>
      </ElTableColumn>
      <ElTableColumn label="开度变化" min-width="260">
        <template #default="{ row }">
          <span v-for="idx in 3" :key="idx" :class="{ 'opening-changed': isGateChanged(row.openings_before, row.openings_after, idx - 1) }">
            {{ idx }}#{{ openingCell(row.openings_before, row.openings_after, idx - 1) }}
            <template v-if="idx < 3"> · </template>
          </span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="关联决策" min-width="110" align="center">
        <template #default="{ row }">
          <ElButton v-if="row.decision_id" link type="primary" @click="goDispatchDecision(row.decision_id)">#{{ row.decision_id }}</ElButton>
          <span v-else>—</span>
        </template>
      </ElTableColumn>
      <ElTableColumn prop="reason" label="原因" min-width="220" show-overflow-tooltip />
    </ElTable>

    <ElDialog v-model="editVisible" :title="editMode === 'create' ? '新建互锁规则' : '编辑互锁规则'" width="580px">
      <ElForm :model="editForm" label-width="100px">
        <ElFormItem label="规则名称"><ElInput v-model="editForm.rule_name" /></ElFormItem>
        <ElFormItem label="说明"><ElInput v-model="editForm.description" type="textarea" :rows="2" /></ElFormItem>
        <ElFormItem label="作用范围">
          <ElSelect v-model="editForm.reservoir_id" style="width:100%" clearable placeholder="留空=全局默认">
            <ElOption v-for="r in reservoirs" :key="r.id" :label="`${r.name}专属`" :value="r.id" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem label="触发条件"><ElInput v-model="editForm.trigger_label" readonly /></ElFormItem>
        <ElFormItem label="约束动作"><ElInput v-model="editForm.action_label" readonly /></ElFormItem>
        <ElFormItem label="优先级"><ElInputNumber v-model="editForm.priority" :min="1" :max="99" /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="editVisible = false">取消</ElButton>
        <ElButton type="primary" @click="submitEdit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/gateai-panel.scss' as gateai;

.view-toggle { @include gateai.gateai-view-toggle; }
.log-filters { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.log-drill-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  font-size: 14px;
  color: #475569;
  background: #f0f7ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;

  strong { color: #1677ff; }
}
.trigger-count-tag {
  cursor: pointer;
}
.priority-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  background: linear-gradient(180deg, #f0f7ff 0%, #e8f2ff 100%);
  border: 1px solid #b9d6ff;
  color: #1677ff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
    transform: scale(0.96);
  }
}
.opening-changed { color: #dc2626; font-weight: 600; }
</style>
