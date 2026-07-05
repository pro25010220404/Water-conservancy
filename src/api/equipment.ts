// ============================================================
// 设备管理 API
// 按需求文档 4.5 节接口清单
// ============================================================
import http from './request'
import type {
  ApiResponse,
  PageResult,
  Equipment,
  EquipmentDetail,
  EquipmentRestartParams,
  EquipmentStatusParams,
  StatusChangeResult,
} from '@/shared/types'

// ── 设备列表 ──
export function getEquipmentList(params: {
  page?: number
  page_size?: number
  reservoir_id?: number
  type?: string
  status?: string
  group?: string
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<Equipment>>>('/equipment', { params })
}

// ── 设备详情 ──
export function getEquipmentDetail(id: number) {
  return http.get<ApiResponse<EquipmentDetail>>(`/equipment/${id}`)
}

// ── 修改设备参数 ──
export function updateEquipment(id: number, data: Record<string, unknown>) {
  return http.put<ApiResponse<null>>(`/equipment/${id}`, data)
}

// ── 远程重启 ──
export function restartEquipment(id: number, data: EquipmentRestartParams) {
  return http.post<ApiResponse<{ command_id: string; status: string }>>(
    `/equipment/${id}/restart`,
    data,
  )
}

// ── 标记设备故障 ──
export function markEquipmentFault(id: number, data: { description: string; fault_type?: string }) {
  return http.post<ApiResponse<null>>(`/equipment/${id}/mark-fault`, data)
}

// ── 标记设备恢复正常 ──
export function markEquipmentNormal(id: number) {
  return http.post<ApiResponse<null>>(`/equipment/${id}/mark-normal`)
}

// ── 更新设备状态 ──
export function updateEquipmentStatus(id: number, data: EquipmentStatusParams) {
  return http.put<ApiResponse<StatusChangeResult>>(`/equipment/${id}/status`, data)
}

// ── 设备故障记录 ──
export function getEquipmentFaults(id: number, params?: { page?: number; page_size?: number }) {
  return http.get<ApiResponse<PageResult<Record<string, unknown>>>>(`/equipment/${id}/faults`, {
    params,
  })
}

// ── 设备维护日志 ──
export function getEquipmentLogs(
  id: number,
  params?: { page?: number; page_size?: number; type?: string },
) {
  return http.get<ApiResponse<PageResult<Record<string, unknown>>>>(`/equipment/${id}/logs`, {
    params,
  })
}

// ── 导出设备台账 ──
export function exportEquipment(params: {
  reservoir_id?: number
  type?: string
  status?: string
  format?: string
}) {
  return http.get('/equipment/export', { params, responseType: 'blob' })
}

// ── 获取设备分组列表 ──
export function getEquipmentGroups() {
  return http.get<ApiResponse<string[]>>('/equipment/groups')
}

// ── 查看边缘节点配置同步状态 ──
export function getEdgeSyncStatus(edgeNodeId: string) {
  return http.get<
    ApiResponse<{
      last_sync_time: string
      config_version: string
      sync_status: 'synced' | 'pending' | 'failed'
      config_hash: string
    }>
  >(`/edge/physics-config/${edgeNodeId}`)
}
