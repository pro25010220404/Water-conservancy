<script setup lang="ts">
// ============================================================
// 设备管理 — 设备列表 + 详情面板 + 远程重启 + 状态变更
// ============================================================

// ── 1. 外部依赖 ──
import { ref, computed, onMounted, watch } from 'vue'
import {
  ElTable,
  ElTableColumn,
  ElInput,
  ElSelect,
  ElOption,
  ElButton,
  ElTag,
  ElPagination,
  ElDialog,
  ElForm,
  ElFormItem,
  ElMessage,
  ElMessageBox,
  ElDescriptions,
  ElDescriptionsItem,
  ElCollapse,
  ElCollapseItem,
  ElCard,
} from 'element-plus'
import { Search, Refresh, Download, Warning } from '@element-plus/icons-vue'
import { EQUIPMENT_TYPE, EQUIPMENT_STATUS, EQUIPMENT_TYPE_OPTIONS, EQUIPMENT_STATUS_OPTIONS } from '@/constants'
import { getEquipmentList, getEquipmentDetail, restartEquipment, updateEquipmentStatus } from '@/api/equipment'
import type { Equipment, EquipmentDetail } from '@/shared/types'

// ── 3. Props & Emits ──
// (无)

// ── 5. 响应式数据 ──
const loading = ref(false)
const list = ref<Equipment[]>([])
const selectedId = ref<number | null>(null)
const detail = ref<EquipmentDetail | null>(null)
const detailLoading = ref(false)

// 筛选条件
const typeFilter = ref('')
const statusFilter = ref('')
const keyword = ref('')
const page = ref(1)
const pageSize = ref(15)
const total = ref(0)

// 弹窗
const restartVisible = ref(false)
const statusVisible = ref(false)
const restartForm = ref({ reason: '' })
const restartDeviceName = ref('')
const newStatus = ref('')
const submitting = ref(false)

// ── 6. Computed ──
const typeLabelMap = computed(() => {
  const map: Record<string, string> = {}
  Object.values(EQUIPMENT_TYPE).forEach((d) => { map[d.value as string] = d.label })
  return map
})

const pageSizeOptions = [10, 15, 20, 50]

// ── 7. 方法函数 ──

/** Mock 设备数据（14 种硬件） */
const MOCK_EQUIPMENT: Equipment[] = [
  { id: 1, name: '1# 超声波液位计', code: 'LS-001', type: 'level_sensor', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '西门子', model: 'SITRANS LU150', health_score: 98, last_online: '2026-07-03 10:05:22' },
  { id: 2, name: '2# 超声波液位计', code: 'LS-002', type: 'level_sensor', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '西门子', model: 'SITRANS LU150', health_score: 95, last_online: '2026-07-03 10:05:18' },
  { id: 3, name: '超声波流量计', code: 'FS-001', type: 'flow_sensor', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: 'KROHNE', model: 'OPTISONIC 3400', health_score: 92, last_online: '2026-07-03 10:05:20' },
  { id: 4, name: 'PLC S7-200', code: 'PLC-001', type: 'plc', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '西门子', model: 'S7-200 SMART', health_score: 99, last_online: '2026-07-03 10:05:24' },
  { id: 5, name: 'PLC 模拟量模块', code: 'PLC-AM03', type: 'plc', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '西门子', model: 'EM AM03', health_score: 97, last_online: '2026-07-03 10:05:22' },
  { id: 6, name: 'Jetson Orin Nano', code: 'EG-001', type: 'edge_gateway', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: 'NVIDIA', model: 'Orin Nano 8GB', health_score: 88, last_online: '2026-07-03 10:05:24' },
  { id: 7, name: '电动推杆', code: 'ACT-001', type: 'actuator', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '力纳克', model: 'LA36', health_score: 94, last_online: '2026-07-03 10:05:19' },
  { id: 8, name: '24V 电源', code: 'PSU-001', type: 'plc', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '明纬', model: 'LRS-350-24', health_score: 100, last_online: '2026-07-03 10:05:24' },
  { id: 9, name: '水泵', code: 'PMP-001', type: 'actuator', reservoir_id: 1, reservoir_name: '示范水库', status: 'offline', manufacturer: '格兰富', model: 'CR 15-3', health_score: 45, last_online: '2026-07-02 23:15:00' },
  { id: 10, name: 'USB 转 RS485', code: 'COM-001', type: 'edge_gateway', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: 'FTDI', model: 'FT232RL', health_score: 100, last_online: '2026-07-03 10:05:23' },
  { id: 11, name: '折叠蓄水池', code: 'TNK-001', type: 'flow_sensor', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '定制', model: '2m³', health_score: 96, last_online: '2026-07-03 10:05:21' },
  { id: 12, name: '降压模块', code: 'REG-001', type: 'plc', reservoir_id: 1, reservoir_name: '示范水库', status: 'maintenance', manufacturer: '德州仪器', model: 'LM2596', health_score: 78, last_online: '2026-07-03 09:30:00' },
  { id: 13, name: '快速接头', code: 'FIT-001', type: 'actuator', reservoir_id: 1, reservoir_name: '示范水库', status: 'fault', manufacturer: '派克', model: '60 系列', health_score: 32, last_online: '2026-07-03 08:45:00' },
  { id: 14, name: '亚克力闸门板 ×2', code: 'GAT-001', type: 'actuator', reservoir_id: 1, reservoir_name: '示范水库', status: 'online', manufacturer: '定制', model: '1200×800mm', health_score: 91, last_online: '2026-07-03 10:05:20' },
]

/** 获取设备列表 */
async function fetchList() {
  loading.value = true
  try {
    const res = await getEquipmentList({
      page: page.value,
      page_size: pageSize.value,
      type: typeFilter.value || undefined,
      status: statusFilter.value || undefined,
      keyword: keyword.value || undefined,
    })
    const body = res.data
    if (body.code === 0 && body.data.list.length > 0) {
      list.value = body.data.list
      total.value = body.data.total
      return
    }
  } catch { /* API 不可用时使用 mock */ }
  // ── Mock 降级 ──
  let filtered = [...MOCK_EQUIPMENT]
  if (typeFilter.value) filtered = filtered.filter((e) => e.type === typeFilter.value)
  if (statusFilter.value) filtered = filtered.filter((e) => e.status === statusFilter.value)
  if (keyword.value) {
    const kw = keyword.value.toLowerCase()
    filtered = filtered.filter((e) => e.name.toLowerCase().includes(kw) || e.code.toLowerCase().includes(kw))
  }
  total.value = filtered.length
  const start = (page.value - 1) * pageSize.value
  list.value = filtered.slice(start, start + pageSize.value)
  loading.value = false
}

/** 搜索（防抖重置页码） */
let searchTimer: ReturnType<typeof setTimeout> | null = null
function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    fetchList()
  }, 300)
}

/** 筛选变更 */
function onFilterChange() {
  page.value = 1
  fetchList()
}

/** 选中设备行 */
async function onRowClick(row: Equipment) {
  selectedId.value = row.id
  detailLoading.value = true
  try {
    const res = await getEquipmentDetail(row.id)
    const body = res.data
    if (body.code === 0 && body.data) { detail.value = body.data; detailLoading.value = false; return }
  } catch { /* fallback */ }
  // ── Mock 详情 ──
  detail.value = {
    ...row,
    install_location: '坝体右侧观测井',
    ip: '192.168.1.' + (100 + row.id),
    cpu_usage: row.status === 'online' ? Math.floor(Math.random() * 60) + 10 : undefined,
    memory_usage: row.status === 'online' ? Math.floor(Math.random() * 50) + 20 : undefined,
    current_alarms: row.status === 'fault' ? [
      { id: 1, alarm_no: 'ALM-20260703-000' + row.id, level: 'urgent', type: 'equipment', message: row.name + ' 心跳超时，设备无响应', created_at: '2026-07-03 08:45:00' },
    ] : row.status === 'offline' ? [
      { id: 2, alarm_no: 'ALM-20260702-000' + row.id, level: 'important', type: 'comm_loss', message: row.name + ' 通信中断超过 30 分钟', created_at: '2026-07-02 23:45:00' },
    ] : undefined,
    latest_monitoring: ['level_sensor', 'flow_sensor'].includes(row.type) ? {
      upstream_level: 92.50, downstream_level: 85.30, inflow_rate: 350.0, outflow_rate: 320.0, gate_opening: 35.0, power_output: 150.3, timestamp: '2026-07-03 10:05:00',
    } : undefined,
  }
  detailLoading.value = false
}

/** 翻页 */
function onPageChange(p: number) { page.value = p; fetchList() }
function onSizeChange(s: number) { pageSize.value = s; page.value = 1; fetchList() }

/** 远程重启 */
function openRestartDialog(device: Equipment) {
  restartDeviceName.value = device.name
  restartForm.value.reason = ''
  restartVisible.value = true
}

async function handleRestart() {
  if (!restartForm.value.reason) {
    ElMessage.warning('请填写重启原因')
    return
  }
  if (!selectedId.value) return
  submitting.value = true
  try {
    const res = await restartEquipment(selectedId.value, { reason: restartForm.value.reason })
    if (res.data.code === 0) {
      ElMessage.success('重启指令已下发')
      restartVisible.value = false
    }
  } finally {
    submitting.value = false
  }
}

/** 状态变更 */
function openStatusDialog() {
  if (!detail.value) return
  newStatus.value = detail.value.status
  statusVisible.value = true
}

async function handleStatusChange() {
  if (!selectedId.value) return
  submitting.value = true
  try {
    const res = await updateEquipmentStatus(selectedId.value, { status: newStatus.value as EquipmentDetail['status'] })
    if (res.data.code === 0) {
      ElMessage.success('状态更新成功')
      statusVisible.value = false
      if (selectedId.value) {
        onRowClick({ id: selectedId.value } as Equipment)
      }
      fetchList()
    }
  } finally {
    submitting.value = false
  }
}

/** 导出台账 */
function handleExport() {
  const rows = list.value
  if (rows.length === 0) {
    ElMessage.warning('没有可导出的数据'); return
  }
  ElMessageBox.confirm(`确定导出当前筛选结果的设备台账？（共 ${rows.length} 条）`, '导出确认', {
    confirmButtonText: '导出 CSV',
    cancelButtonText: '取消',
  }).then(() => {
    // BOM 解决中文乱码
    const BOM = '﻿'
    const headers = ['序号', '设备名称', '设备编号', '类型', '状态', '制造商', '型号', '健康评分', '所属水库', '最后在线']
    const csv = [headers.join(',')]
    rows.forEach((r, i) => {
      csv.push([
        i + 1,
        `"${r.name}"`,
        `"${r.code}"`,
        typeLabelMap.value[r.type] ?? r.type,
        EQUIPMENT_STATUS[r.status]?.label ?? r.status,
        `"${r.manufacturer}"`,
        `"${r.model}"`,
        r.health_score,
        `"${r.reservoir_name ?? '-'}"`,
        r.last_online ?? '',
      ].join(','))
    })
    const blob = new Blob([BOM + csv.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `设备台账_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  }).catch(() => { /* 取消 */ })
}

// ── 8. 生命周期 ──
onMounted(() => { fetchList() })

watch([typeFilter, statusFilter], onFilterChange)
</script>

<template>
  <div class="page equipment-page">
    <!-- ═══ 左侧：表格区 ═══ -->
    <div class="equipment-page__main" :class="{ 'has-detail': selectedId }">
      <div class="equipment-page__toolbar">
        <div class="equipment-page__filters">
          <el-select
            v-model="typeFilter"
            placeholder="设备类型"
            clearable
            style="width: 160px"
            @change="onFilterChange"
          >
            <el-option v-for="opt in EQUIPMENT_TYPE_OPTIONS" :key="String(opt.value)" :label="opt.label" :value="String(opt.value)" />
          </el-select>
          <el-select
            v-model="statusFilter"
            placeholder="设备状态"
            clearable
            style="width: 140px"
            @change="onFilterChange"
          >
            <el-option v-for="opt in EQUIPMENT_STATUS_OPTIONS" :key="String(opt.value)" :label="opt.label" :value="String(opt.value)" />
          </el-select>
          <el-input
            v-model="keyword"
            placeholder="搜索设备名称/编号"
            clearable
            style="width: 240px"
            :prefix-icon="Search"
            @input="onKeywordInput"
          />
        </div>
        <div class="equipment-page__actions">
          <el-button :icon="Refresh" @click="fetchList">刷新</el-button>
          <el-button type="primary" :icon="Download" @click="handleExport">导出台账</el-button>
        </div>
      </div>

      <!-- ═══ 表格 ═══ -->
      <el-table
        :data="list"
        v-loading="loading"
        stripe
        highlight-current-row
        @row-click="onRowClick"
        class="equipment-page__table"
      >
        <el-table-column type="index" label="#" width="50" />
        <el-table-column prop="name" label="设备名称" min-width="160" show-overflow-tooltip />
        <el-table-column prop="code" label="设备编号" width="120" />
        <el-table-column prop="type" label="类型" width="130">
          <template #default="scope">
            {{ typeLabelMap[scope.row.type] ?? scope.row.type }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="scope">
            <el-tag
              :type="(scope.row.status === 'online' ? 'success' : scope.row.status === 'fault' ? 'danger' : scope.row.status === 'offline' ? 'info' : 'warning') as 'success' | 'danger' | 'info' | 'warning'"
              size="small"
              disable-transitions
            >
              {{ EQUIPMENT_STATUS[scope.row.status]?.label ?? scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="manufacturer" label="制造商" width="120" show-overflow-tooltip />
        <el-table-column prop="model" label="型号" width="120" show-overflow-tooltip />
        <el-table-column prop="health_score" label="健康评分" width="90" sortable />
        <el-table-column prop="last_online" label="最后在线" width="170" />
      </el-table>

      <!-- ═══ 分页 ═══ -->
      <div class="equipment-page__pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="pageSizeOptions"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @current-change="onPageChange"
          @size-change="onSizeChange"
        />
      </div>
    </div>

    <!-- ═══ 右侧详情面板 ═══ -->
    <transition name="slide">
      <div v-if="selectedId" class="equipment-page__detail">
        <el-card v-loading="detailLoading" shadow="never">
          <template #header>
            <div class="equipment-page__detail-header">
              <span class="equipment-page__detail-title">{{ detail?.name ?? '设备详情' }}</span>
              <el-button text size="small" @click="selectedId = null; detail = null">✕</el-button>
            </div>
          </template>

          <template v-if="detail">
            <el-descriptions :column="1" border size="small" class="equipment-page__detail-desc">
              <el-descriptions-item label="设备编号">{{ detail.code }}</el-descriptions-item>
              <el-descriptions-item label="设备类型">{{ typeLabelMap[detail.type] ?? detail.type }}</el-descriptions-item>
              <el-descriptions-item label="所属水库">{{ detail.reservoir_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="制造商">{{ detail.manufacturer || '-' }}</el-descriptions-item>
              <el-descriptions-item label="型号">{{ detail.model || '-' }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag
                  :type="(detail.status === 'online' ? 'success' : detail.status === 'fault' ? 'danger' : detail.status === 'offline' ? 'info' : 'warning') as 'success' | 'danger' | 'info' | 'warning'"
                  size="small"
                >
                  {{ EQUIPMENT_STATUS[detail.status]?.label ?? detail.status }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="健康评分">{{ detail.health_score }}</el-descriptions-item>
              <el-descriptions-item label="最后在线">{{ detail.last_online || '-' }}</el-descriptions-item>
            </el-descriptions>

            <!-- 实时监测 -->
            <div v-if="detail.latest_monitoring" class="equipment-page__monitor">
              <h4>实时监测数据</h4>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="上游水位">{{ detail.latest_monitoring.upstream_level }} m</el-descriptions-item>
                <el-descriptions-item label="下游水位">{{ detail.latest_monitoring.downstream_level }} m</el-descriptions-item>
                <el-descriptions-item label="入库流量">{{ detail.latest_monitoring.inflow_rate }} m³/s</el-descriptions-item>
                <el-descriptions-item label="出库流量">{{ detail.latest_monitoring.outflow_rate }} m³/s</el-descriptions-item>
                <el-descriptions-item label="闸门开度">{{ detail.latest_monitoring.gate_opening }}%</el-descriptions-item>
                <el-descriptions-item label="发电功率">{{ detail.latest_monitoring.power_output }} kW</el-descriptions-item>
              </el-descriptions>
            </div>

            <!-- 操作按钮组 -->
            <div class="equipment-page__ops">
              <el-button type="warning" @click="openStatusDialog">状态变更</el-button>
              <el-button type="danger" @click="openRestartDialog({ name: detail.name, id: detail.id } as Equipment)">
                远程重启
              </el-button>
            </div>

            <!-- 故障记录 -->
            <el-collapse v-if="detail.current_alarms?.length" style="margin-top:12px">
              <el-collapse-item title="当前告警" name="alarms">
                <div v-for="alarm in detail.current_alarms" :key="alarm.id" class="equipment-page__alarm-item">
                  <el-tag :type="(alarm.level === 'urgent' ? 'danger' : alarm.level === 'important' ? 'warning' : 'info') as 'danger' | 'warning' | 'info'" size="small">
                    {{ alarm.level }}
                  </el-tag>
                  <span>{{ alarm.message }}</span>
                  <span class="equipment-page__alarm-time">{{ alarm.created_at }}</span>
                </div>
              </el-collapse-item>
            </el-collapse>
          </template>
        </el-card>
      </div>
    </transition>

    <!-- ═══ 状态变更弹窗 ═══ -->
    <el-dialog v-model="statusVisible" title="设备状态变更" width="420px">
      <el-form label-width="80px">
        <el-form-item label="新状态">
          <el-select v-model="newStatus" style="width: 100%">
            <el-option v-for="opt in EQUIPMENT_STATUS_OPTIONS" :key="String(opt.value)" :label="opt.label" :value="String(opt.value)" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleStatusChange">确认变更</el-button>
      </template>
    </el-dialog>

    <!-- ═══ 远程重启弹窗 ═══ -->
    <el-dialog v-model="restartVisible" title="远程重启设备" width="480px">
      <div class="restart-dialog">
        <div class="restart-dialog__warn">
          <el-icon :size="20"><Warning /></el-icon>
          <span>重启操作将导致设备短暂中断，请确认后执行</span>
        </div>
        <p class="restart-dialog__device">设备名称：<strong>{{ restartDeviceName }}</strong></p>
        <el-form label-width="80px" style="margin-top: 16px">
          <el-form-item label="重启原因" required>
            <el-input
              v-model="restartForm.reason"
              type="textarea"
              :rows="3"
              placeholder="请填写重启原因（必填）"
              maxlength="200"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="restartVisible = false">取消</el-button>
        <el-button type="danger" :loading="submitting" @click="handleRestart">确认重启</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.equipment-page {
  display: flex;
  gap: var(--spacing-lg);
  height: calc(100vh - var(--header-height) - 2 * var(--spacing-lg));

  &__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    overflow: hidden;

    &.has-detail {
      flex: 1 1 65%;
    }
  }

  &__table {
    flex: 1;
    min-height: 0;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--spacing-sm);
    flex-shrink: 0;
  }

  &__filters {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-wrap: wrap;
  }

  &__actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  &__pagination {
    display: flex;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  &__detail {
    width: 380px;
    flex-shrink: 0;
    overflow-y: auto;

    :deep(.el-card__body) {
      padding: var(--spacing-md);
    }
  }

  &__detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__detail-title {
    font-weight: 600;
    font-size: var(--font-size-lg);
  }

  &__detail-desc {
    margin-bottom: var(--spacing-md);
  }

  &__monitor {
    margin-top: var(--spacing-md);
    h4 { margin-bottom: var(--spacing-sm); font-size: var(--font-size-base); color: var(--color-text); }
  }

  &__ops {
    display: flex;
    gap: var(--spacing-sm);
    margin-top: var(--spacing-md);
  }

  &__alarm-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: 6px 0;
    font-size: var(--font-size-sm);
    border-bottom: 1px solid var(--color-border);
  }

  &__alarm-time {
    margin-left: auto;
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
  }
}

// 详情面板滑入动画
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.restart-dialog {
  &__warn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: var(--border-radius-base);
    color: #ef4444;
    font-size: var(--font-size-sm);
  }

  &__device {
    margin-top: var(--spacing-md);
    font-size: var(--font-size-base);
  }
}
</style>
