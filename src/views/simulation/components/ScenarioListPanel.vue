<script setup lang="ts">
import { ElButton, ElTag, ElEmpty } from 'element-plus'
import type { SimulationScenarioItem } from '@/types/simulation'

defineProps<{
  scenarios: SimulationScenarioItem[]
  loading?: boolean
}>()

const emit = defineEmits<{
  refresh: []
  create: []
  edit: [item: SimulationScenarioItem]
  delete: [item: SimulationScenarioItem]
}>()

const STATUS_MAP: Record<string, { label: string; type: 'success' | 'info' | 'warning' }> = {
  active: { label: '启用', type: 'success' },
  draft: { label: '草稿', type: 'info' },
  inactive: { label: '停用', type: 'warning' },
}

const TYPE_MAP: Record<string, string> = {
  production: '生产',
  energy: '能源',
  fault: '故障',
}

function formatDuration(sec?: number) {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ''}`
  return `${m}m`
}
</script>

<template>
  <div class="scenario-panel">
    <div class="scenario-panel__toolbar">
      <ElButton size="small" type="primary" @click="emit('create')">新建场景</ElButton>
      <ElButton size="small" :loading="loading" @click="emit('refresh')">刷新</ElButton>
    </div>
    <ElEmpty v-if="!scenarios.length && !loading" description="暂无场景，请新建" />
    <ul v-else class="scenario-panel__list">
      <li v-for="item in scenarios" :key="item.id" class="scenario-panel__item">
        <div class="scenario-panel__head">
          <strong>{{ item.name }}</strong>
          <ElTag size="small" effect="plain">
            {{ STATUS_MAP[item.status]?.label ?? item.status }}
          </ElTag>
        </div>
        <div class="scenario-panel__meta">
          {{ TYPE_MAP[item.type] ?? item.type }}
          · {{ formatDuration(item.duration) }}
          <template v-if="item.speed"> · {{ item.speed }}x</template>
        </div>
        <div class="scenario-panel__actions">
          <ElButton link type="primary" @click="emit('edit', item)">编辑</ElButton>
          <ElButton link type="danger" @click="emit('delete', item)">删除</ElButton>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.scenario-panel {
  font-size: $cockpit-font-base;

  &__toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;

    :deep(.el-button) {
      padding: 6px 12px;
      font-size: $cockpit-font-sm;
      height: auto;
    }
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__item {
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #f8fafc;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: $cockpit-font-base;

    strong {
      font-size: $cockpit-font-base;
      font-weight: 600;
    }
  }

  &__meta {
    margin-top: 4px;
    font-size: $cockpit-font-sm;
    color: #64748b;
  }

  &__actions {
    margin-top: 6px;
    display: flex;
    gap: 8px;

    :deep(.el-button) {
      padding: 0;
      font-size: $cockpit-font-sm;
      height: auto;
    }
  }
}
</style>
