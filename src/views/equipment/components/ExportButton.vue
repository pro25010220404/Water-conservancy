<script setup lang="ts">
// ============================================================
// 导出按钮 — Excel / CSV 格式选择
// ============================================================

import { ref } from 'vue'
import { ElDropdown, ElDropdownMenu, ElDropdownItem, ElButton, ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { exportEquipment } from '@/api/equipment'
import { useEquipmentStore } from '@/stores/equipment'
import { useOperationLog } from '@/composables/useOperationLog'
import { DEVICE_TYPE, DEVICE_STATUS } from '@/constants'

const store = useEquipmentStore()
const { record: recordLog } = useOperationLog()

const exporting = ref(false)

// ── 字典映射 ──
function getTypeLabel(type: string): string {
  return DEVICE_TYPE[type]?.label ?? type
}

function getStatusLabel(status: string): string {
  return DEVICE_STATUS[status]?.label ?? status
}

// ── 生成 CSV 内容 ──
function generateCSV(): string {
  const BOM = '﻿'
  const headers = [
    '序号',
    '设备名称',
    '设备编号',
    '设备类型',
    '运行状态',
    '制造商',
    '型号',
    '健康评分',
    '最后心跳时间',
  ]
  const rows = store.deviceList.map((r, i) => [
    i + 1,
    `"${r.name}"`,
    `"${r.code}"`,
    getTypeLabel(r.type),
    getStatusLabel(r.status),
    `"${r.manufacturer}"`,
    `"${r.model}"`,
    r.health_score,
    r.last_online ?? '',
  ])
  return BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

// ── 下载 Blob ──
function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.URL.revokeObjectURL(url)
}

// ── 导出 Excel ──
async function handleExportExcel() {
  if (store.deviceList.length === 0) {
    ElMessage.warning('没有可导出的数据')
    return
  }
  exporting.value = true
  try {
    const res = await exportEquipment({
      format: 'xlsx',
      type: store.filters.type || undefined,
      status: store.filters.status || undefined,
    })
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    downloadBlob(blob, `设备台账_${new Date().toISOString().slice(0, 10)}.xlsx`)
    recordLog('设备管理', '导出', `导出 ${store.deviceList.length} 条设备台账（Excel）`, 1)
    ElMessage.success('导出成功')
  } catch {
    // 降级：本地生成 CSV 格式
    const csv = generateCSV()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `设备台账_${new Date().toISOString().slice(0, 10)}.csv`)
    ElMessage.warning('Excel 导出失败，已降级导出 CSV 格式')
  } finally {
    exporting.value = false
  }
}

// ── 导出 CSV ──
async function handleExportCSV() {
  if (store.deviceList.length === 0) {
    ElMessage.warning('没有可导出的数据')
    return
  }
  exporting.value = true
  try {
    const res = await exportEquipment({
      format: 'csv',
      type: store.filters.type || undefined,
      status: store.filters.status || undefined,
    })
    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `设备台账_${new Date().toISOString().slice(0, 10)}.csv`)
    recordLog('设备管理', '导出', `导出 ${store.deviceList.length} 条设备台账（CSV）`, 1)
    ElMessage.success('导出成功')
  } catch {
    // 降级：本地生成 CSV
    const csv = generateCSV()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, `设备台账_${new Date().toISOString().slice(0, 10)}.csv`)
    recordLog('设备管理', '导出', `导出 ${store.deviceList.length} 条设备台账（CSV 本地生成）`, 1)
    ElMessage.success('导出成功')
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <ElDropdown trigger="click"
:disabled="exporting">
    <ElButton type="primary"
:icon="Download" :loading="exporting"
>
导出台账
</ElButton>
    <template #dropdown>
      <ElDropdownMenu>
        <ElDropdownItem @click="handleExportExcel">
          <span class="export-button__item">导出 Excel</span>
        </ElDropdownItem>
        <ElDropdownItem @click="handleExportCSV">
          <span class="export-button__item">导出 CSV</span>
        </ElDropdownItem>
      </ElDropdownMenu>
    </template>
  </ElDropdown>
</template>

<style scoped lang="scss">
.export-button {
  &__item {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 120px;
  }
}
</style>
