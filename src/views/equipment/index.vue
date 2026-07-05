<script setup lang="ts">
// ============================================================
// 设备管理 — 页面入口（布局+筛选栏+数据获取+组件组装）
// 按需求文档 4.3 / 4.4 节
// ============================================================
import { ref, onMounted, watch, onErrorCaptured } from 'vue'
import { ElSelect, ElOption, ElInput, ElButton, ElMessage, ElMessageBox } from 'element-plus'
import { Search, Refresh } from '@element-plus/icons-vue'
import { DEVICE_TYPE_OPTIONS, DEVICE_STATUS_OPTIONS, DEVICE_GROUP_OPTIONS } from '@/constants'
import { useOperationLog } from '@/composables/useOperationLog'
import { useEquipmentStore } from '@/stores/equipment'
import DeviceList from './components/DeviceList.vue'
import DeviceDetail from './components/DeviceDetail.vue'
import RestartDialog from './components/RestartDialog.vue'
import type { Equipment, EquipmentDetail } from '@/shared/types'

onErrorCaptured((err) => {
  console.error('Equipment page error:', err)
  return false
})

const { record: recordLog } = useOperationLog()
const store = useEquipmentStore()

// ── 设备列表状态（本地管理，与 store 同步）──
const loading = ref(false)
const list = ref<Equipment[]>([])
const selectedId = ref<number | null>(null)
const selectedIds = ref<number[]>([])

// 筛选
const typeFilter = ref('')
const statusFilter = ref('')
const groupFilter = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(15)
const total = ref(0)

// 弹窗
const restartVisible = ref(false)
const restartTarget = ref({ name: '', type: '' })

// WebSocket 状态
const wsStatusMap = ref<Record<number, string>>({})

// ── Mock ──
const MOCK_EQUIPMENT: Equipment[] = [
  {
    id: 1,
    name: '超声波液位计（上游）',
    code: 'LS-001',
    type: 'sensor' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '西门子',
    model: 'SITRANS LU150',
    health_score: 98,
    last_online: '2026-07-03 10:05:22',
  },
  {
    id: 2,
    name: '超声波液位计（下游）',
    code: 'LS-002',
    type: 'sensor' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '西门子',
    model: 'SITRANS LU150',
    health_score: 95,
    last_online: '2026-07-03 10:05:18',
  },
  {
    id: 3,
    name: '超声波流量计',
    code: 'FS-001',
    type: 'sensor' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: 'KROHNE',
    model: 'OPTISONIC 3400',
    health_score: 92,
    last_online: '2026-07-03 10:05:20',
  },
  {
    id: 4,
    name: 'PLC S7-200 SMART',
    code: 'PLC-001',
    type: 'plc' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '西门子',
    model: 'S7-200 SMART SR20',
    health_score: 99,
    last_online: '2026-07-03 10:05:24',
  },
  {
    id: 5,
    name: 'PLC 模拟量输入模块',
    code: 'PLC-AM04',
    type: 'plc' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '西门子',
    model: 'EM AE04',
    health_score: 97,
    last_online: '2026-07-03 10:05:22',
  },
  {
    id: 6,
    name: 'Jetson Orin Nano',
    code: 'EG-001',
    type: 'gateway' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: 'NVIDIA',
    model: 'Orin Nano 8GB',
    health_score: 88,
    last_online: '2026-07-03 10:05:24',
  },
  {
    id: 7,
    name: '电动推杆（闸门驱动）',
    code: 'ACT-001',
    type: 'actuator' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '力纳克',
    model: 'LA36',
    health_score: 94,
    last_online: '2026-07-03 10:05:19',
  },
  {
    id: 8,
    name: '24V 导轨式开关电源',
    code: 'PSU-001',
    type: 'power' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '明纬',
    model: 'LRS-350-24',
    health_score: 100,
    last_online: '2026-07-03 10:05:24',
  },
  {
    id: 9,
    name: '小型自吸循环水泵',
    code: 'PMP-001',
    type: 'pump' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'offline' as any,
    manufacturer: '格兰富',
    model: 'CR 15-3',
    health_score: 45,
    last_online: '2026-07-02 23:15:00',
  },
  {
    id: 10,
    name: 'USB转RS485转换器',
    code: 'COM-001',
    type: 'accessory' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: 'FTDI',
    model: 'FT232RL',
    health_score: 100,
    last_online: '2026-07-03 10:05:23',
  },
  {
    id: 11,
    name: '折叠式模拟蓄水池',
    code: 'TNK-001',
    type: 'accessory' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '定制',
    model: '2m³',
    health_score: 96,
    last_online: '2026-07-03 10:05:21',
  },
  {
    id: 12,
    name: '24V转12V降压模块',
    code: 'REG-001',
    type: 'accessory' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'maintenance' as any,
    manufacturer: '德州仪器',
    model: 'LM2596',
    health_score: 78,
    last_online: '2026-07-03 09:30:00',
  },
  {
    id: 13,
    name: 'DN15不锈钢快速接头',
    code: 'FIT-001',
    type: 'accessory' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'fault' as any,
    manufacturer: '派克',
    model: '60 系列',
    health_score: 32,
    last_online: '2026-07-03 08:45:00',
  },
  {
    id: 14,
    name: '透明亚克力闸门板',
    code: 'GAT-001',
    type: 'accessory' as any,
    reservoir_id: 1,
    reservoir_name: '示范水库',
    status: 'online' as any,
    manufacturer: '定制',
    model: '1200×800mm',
    health_score: 91,
    last_online: '2026-07-03 10:05:20',
  },
]

// ── 数据获取 ──
function fetchList() {
  loading.value = true
  let filtered = [...MOCK_EQUIPMENT]
  if (typeFilter.value) filtered = filtered.filter((e) => e.type === typeFilter.value)
  if (statusFilter.value) filtered = filtered.filter((e) => e.status === statusFilter.value)
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    filtered = filtered.filter(
      (e) => e.name.toLowerCase().includes(kw) || e.code.toLowerCase().includes(kw),
    )
  }
  total.value = filtered.length
  list.value = filtered.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
  loading.value = false
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchList()
  }, 300)
}

function onFilterChange() {
  page.value = 1
  fetchList()
}

function onRowClick(row: Equipment) {
  selectedId.value = row.id
  store.detailLoading = true
  store.currentDevice = {
    ...row,
    install_location: '坝体右侧观测井',
    ip: '192.168.1.' + (100 + row.id),
    current_alarms:
      row.status === 'fault'
        ? [
            {
              id: 1,
              alarm_no: 'ALM-20260703-000' + row.id,
              level: 'urgent',
              type: 'equipment',
              message: row.name + ' 心跳超时',
              created_at: '2026-07-03 08:45:00',
            },
          ]
        : undefined,
    latest_monitoring: ['sensor', 'actuator'].includes(row.type)
      ? {
          upstream_level: 92.5,
          downstream_level: 85.3,
          inflow_rate: 350.0,
          outflow_rate: 320.0,
          gate_opening: 35.0,
          power_output: 150.3,
          timestamp: '2026-07-03 10:05:00',
        }
      : null,
  } as EquipmentDetail
  store.detailLoading = false
}

function onPageChange(p: number) {
  page.value = p
  fetchList()
}
function onSizeChange(s: number) {
  pageSize.value = s
  page.value = 1
  fetchList()
}
function handleCloseDetail() {
  selectedId.value = null
  store.currentDevice = null
}
function handleDetailRestart() {
  openRestartDialog({
    name: store.currentDevice?.name ?? '',
    type: store.currentDevice?.type ?? '',
  })
}

// ── 操作 ──
function openRestartDialog(device: { name: string; type: string }) {
  restartTarget.value = device
  restartVisible.value = true
}

function handleRestartConfirm(_reason: string) {
  recordLog('设备管理', '重启', `远程重启设备「${restartTarget.value.name}」`, 1)
  ElMessage.success('重启指令已发送')
  restartVisible.value = false
}

function handleExport() {
  const rows = list.value
  if (!rows.length) {
    ElMessage.warning('没有可导出的数据')
    return
  }
  ElMessageBox.confirm(`确定导出当前筛选结果的设备台账？（共 ${rows.length} 条）`, '导出确认', {
    confirmButtonText: '导出 CSV',
    cancelButtonText: '取消',
  })
    .then(() => {
      const BOM = '﻿'
      const headers = [
        '序号',
        '设备名称',
        '设备编号',
        '类型',
        '状态',
        '制造商',
        '型号',
        '健康评分',
        '所属水库',
        '最后在线',
      ]
      const csv = [headers.join(',')]
      const typeLabelMap: Record<string, string> = {}
      DEVICE_TYPE_OPTIONS.forEach((o) => {
        typeLabelMap[o.value as string] = o.label
      })
      rows.forEach((r, i) => {
        csv.push(
          [
            i + 1,
            `"${r.name}"`,
            `"${r.code}"`,
            typeLabelMap[r.type] ?? r.type,
            r.status,
            `"${r.manufacturer}"`,
            `"${r.model}"`,
            r.health_score,
            `"${r.reservoir_name ?? '-'}"`,
            r.last_online ?? '',
          ].join(','),
        )
      })
      const blob = new Blob([BOM + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `设备台账_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      recordLog('设备管理', '导出', `导出了 ${rows.length} 条设备台账`, 1)
      ElMessage.success('导出成功')
    })
    .catch(() => {})
}

// ── 生命周期 ──
onMounted(() => {
  fetchList()
})
watch([typeFilter, statusFilter, groupFilter], onFilterChange)
</script>

<template>
  <div class="equipment-page">
    <!-- 顶部工具栏 -->
    <div class="equipment-page__toolbar">
      <div class="equipment-page__filters">
        <ElSelect
          v-model="typeFilter"
          placeholder="设备类型"
          clearable
          style="width: 140px"
          @change="onFilterChange"
        >
          <ElOption
            v-for="opt in DEVICE_TYPE_OPTIONS"
            :key="String(opt.value)"
            :label="opt.label"
            :value="String(opt.value)"
          />
        </ElSelect>
        <ElSelect
          v-model="statusFilter"
          placeholder="运行状态"
          clearable
          style="width: 130px"
          @change="onFilterChange"
        >
          <ElOption
            v-for="opt in DEVICE_STATUS_OPTIONS"
            :key="String(opt.value)"
            :label="opt.label"
            :value="String(opt.value)"
          />
        </ElSelect>
        <ElSelect
          v-model="groupFilter"
          placeholder="所属分组"
          clearable
          style="width: 150px"
          @change="onFilterChange"
        >
          <ElOption
            v-for="opt in DEVICE_GROUP_OPTIONS"
            :key="String(opt.value)"
            :label="opt.label"
            :value="String(opt.value)"
          />
        </ElSelect>
        <ElInput
          v-model="keyword"
          placeholder="搜索设备名称/编号"
          clearable
          style="width: 240px"
          :prefix-icon="Search"
          @input="onKeywordInput"
        />
      </div>
      <div class="equipment-page__actions">
        <ElButton
:icon="Refresh" @click="fetchList"> 刷新 </ElButton>
        <ElButton
type="primary" @click="handleExport"> 导出台账 </ElButton>
      </div>
    </div>

    <!-- 左右分栏 -->
    <div class="equipment-page__body">
      <!-- 左侧：设备列表 -->
      <div
class="equipment-page__left" :class="{ 'has-detail': selectedId }">
        <DeviceList
          :data="list"
          :loading="loading"
          :total="total"
          :current-page="page"
          :page-size="pageSize"
          :selected-id="selectedId"
          :status-map="wsStatusMap"
          @row-click="onRowClick"
          @page-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>

      <!-- 右侧：设备详情 -->
      <transition name="slide">
        <div
v-if="selectedId" class="equipment-page__right">
          <DeviceDetail
            :detail="store.currentDevice"
            :loading="store.detailLoading"
            @close="handleCloseDetail()"
            @restart="handleDetailRestart()"
            @export="handleExport"
          />
        </div>
      </transition>
    </div>

    <!-- 远程重启弹窗 -->
    <RestartDialog
      v-model:visible="restartVisible"
      :device-name="restartTarget.name"
      :device-type="restartTarget.type"
      @confirm="handleRestartConfirm"
    />
  </div>
</template>

<style scoped lang="scss">
.equipment-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  height: calc(100vh - var(--header-height, 60px) - 2 * var(--spacing-lg, 16px));
  overflow: hidden;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 8px);
    flex-shrink: 0;
  }

  &__filters {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    flex-wrap: wrap;
  }

  &__actions {
    display: flex;
    gap: var(--spacing-sm, 8px);
    flex-shrink: 0;
  }

  &__body {
    display: flex;
    gap: var(--spacing-md, 16px);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  &__left {
    flex: 1;
    min-width: 0;
    overflow: auto;

    &.has-detail {
      flex: 0 1 65%;
    }
  }

  &__right {
    width: 380px;
    flex-shrink: 0;
    overflow-y: auto;
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
