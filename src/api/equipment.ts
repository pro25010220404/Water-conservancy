// ============================================================
// 设备管理 API
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
  keyword?: string
}) {
  return http.get<ApiResponse<PageResult<Equipment>>>('/equipment', { params })
}

// ── 设备详情 ──
export function getEquipmentDetail(id: number) {
  return http.get<ApiResponse<EquipmentDetail>>(`/equipment/${id}`)
}

// ── 远程重启 ──
export function restartEquipment(id: number, data: EquipmentRestartParams) {
  return http.post<ApiResponse<{ command_id: string; status: string }>>(`/equipment/${id}/restart`, data)
}

// ── 更新设备状态 ──
export function updateEquipmentStatus(id: number, data: EquipmentStatusParams) {
  return http.put<ApiResponse<StatusChangeResult>>(`/equipment/${id}/status`, data)
}

// ── 导出设备台账 ──
export function exportEquipment(params: { reservoir_id?: number; type?: string; status?: string }) {
  return http.get('/equipment/export', { params, responseType: 'blob' })
}
