<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElSelect, ElOption, ElButton, ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { RESERVOIR_OPTIONS } from '@/constants/settings'
import { getInterlockRules, updateInterlockRule, toggleInterlockRule } from '@/api/settings'
import type { InterlockRule } from '@/stores/gateInterlock'
import InterlockRuleTable from './components/InterlockRuleTable.vue'
import RuleEditDialog from './components/RuleEditDialog.vue'

const reservoirId = ref<number>(1)
const rules = ref<InterlockRule[]>([])
const loading = ref(false)

const editDialogVisible = ref(false)
const editingRule = ref<InterlockRule | null>(null)

// ── Mock ──
function generateMockRules(): InterlockRule[] {
  return [
    {
      id: 1,
      code: 'spillway_intake_mutex',
      name: '泄洪-发电互斥',
      description: '溢洪道开度 > 80% 时，发电引水闸 ≤ 50%',
      scope: 'global',
      reservoir_id: null,
      priority: 1,
      trigger_conditions: [{ field: 'spillway_opening', operator: 'gt', threshold: 80 }],
      constraint_actions: [{ field: 'intake_opening', type: 'cap', threshold: 50 }],
      is_enabled: true,
      trigger_count_7d: 12,
      updated_at: '2026-07-03T10:00:00',
    },
    {
      id: 2,
      code: 'downstream_impact_protect',
      name: '下游冲击保护',
      description: '任两闸门同时增开 > 30%，第三个闸门禁止同向动作',
      scope: 'global',
      reservoir_id: null,
      priority: 2,
      trigger_conditions: [{ field: 'total_opening', operator: 'rate_gt', threshold: 30 }],
      constraint_actions: [{ field: 'total_opening', type: 'block_same_direction', threshold: 0 }],
      is_enabled: true,
      trigger_count_7d: 3,
      updated_at: '2026-07-02T08:00:00',
    },
    {
      id: 3,
      code: 'symmetry_constraint',
      name: '对称性约束',
      description: '溢洪道与泄洪洞开度差 > 40%，强制调整至差值 ≤ 40%',
      scope: 'global',
      reservoir_id: null,
      priority: 3,
      trigger_conditions: [{ field: 'spillway_opening', operator: 'gt', threshold: 40 }],
      constraint_actions: [{ field: 'spillway_opening', type: 'align', threshold: 40 }],
      is_enabled: true,
      trigger_count_7d: 0,
      updated_at: '2026-06-28T14:00:00',
    },
    {
      id: 4,
      code: 'min_discharge_guarantee',
      name: '最小下泄保障',
      description: '三闸门总开度 < 5% 时禁止再关',
      scope: 'reservoir',
      reservoir_id: 1,
      reservoir_name: '示范水库',
      priority: 4,
      trigger_conditions: [{ field: 'total_opening', operator: 'lt', threshold: 5 }],
      constraint_actions: [
        { field: 'total_opening', type: 'block_opposite_direction', threshold: 0 },
      ],
      is_enabled: false,
      trigger_count_7d: 0,
      updated_at: '2026-06-20T09:00:00',
    },
  ]
}

// ── Fetch ──
async function fetchRules() {
  loading.value = true
  try {
    const res = await getInterlockRules({ reservoir_id: reservoirId.value })
    if (res.data?.code === 0 && res.data.data) {
      rules.value = res.data.data
      return
    }
  } catch {
    /* fallback */
  }
  rules.value = generateMockRules()
  loading.value = false
}

function onReservoirChange() {
  fetchRules()
}

function handleEdit(rule: InterlockRule) {
  editingRule.value = rule
  editDialogVisible.value = true
}

function handleNew() {
  editingRule.value = null
  editDialogVisible.value = true
}

async function handleToggle(rule: InterlockRule) {
  try {
    await toggleInterlockRule(rule.id)
    rule.is_enabled = !rule.is_enabled
    ElMessage.success(`规则「${rule.name}」已${rule.is_enabled ? '启用' : '禁用'}`)
  } catch {
    rule.is_enabled = !rule.is_enabled
    ElMessage.error('操作失败')
  }
}

function handleReorder(data: { ruleId: number; direction: 'up' | 'down' }) {
  const idx = rules.value.findIndex((r) => r.id === data.ruleId)
  if (idx < 0) return
  if (data.direction === 'up' && idx > 0) {
    const temp = rules.value[idx - 1]
    rules.value[idx - 1] = rules.value[idx]
    rules.value[idx] = temp
    // Update priorities
    rules.value.forEach((r, i) => {
      r.priority = i + 1
    })
  } else if (data.direction === 'down' && idx < rules.value.length - 1) {
    const temp = rules.value[idx + 1]
    rules.value[idx + 1] = rules.value[idx]
    rules.value[idx] = temp
    rules.value.forEach((r, i) => {
      r.priority = i + 1
    })
  }
}

async function handleSave(rule: InterlockRule) {
  editDialogVisible.value = false
  const existingIdx = rules.value.findIndex((r) => r.id === rule.id)
  if (existingIdx >= 0) {
    rules.value[existingIdx] = rule
    ElMessage.success('规则已更新')
  } else {
    rule.id = Math.max(...rules.value.map((r) => r.id), 0) + 1
    rule.priority = rules.value.length + 1
    rules.value.push(rule)
    ElMessage.success('规则已创建')
  }
  // Optionally call API
  try {
    await updateInterlockRule(rule.id, rule)
  } catch {
    /* mock */
  }
}

onMounted(() => {
  fetchRules()
})
</script>

<template>
  <div class="gate-interlock-page">
    <div class="page-header">
      <h2 class="page-title">
闸门互锁规则
</h2>
      <div class="header-actions">
        <ElSelect
          v-model="reservoirId"
          placeholder="选择水库"
          style="width: 180px"
          @change="onReservoirChange"
        >
          <ElOption
            v-for="opt in RESERVOIR_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </ElSelect>
        <ElButton type="primary" :icon="Plus" @click="handleNew"> 新建规则 </ElButton>
      </div>
    </div>

    <InterlockRuleTable
      :rules="rules"
      :loading="loading"
      @edit="handleEdit"
      @toggle="handleToggle"
      @reorder="handleReorder"
    />

    <RuleEditDialog
      :visible="editDialogVisible"
      :rule="editingRule"
      @update:visible="(v: boolean) => (editDialogVisible = v)"
      @save="handleSave"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/text-mixins.scss' as *;
.gate-interlock-page {
  padding: var(--spacing-md);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-lg);
}

.page-title {
  font-size: var(--font-size-xxl);
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}
</style>
