// ============================================================
// 水库管理 API（设备管理页 — 水库详情）
// ============================================================
import http from './request'
import type { ApiResponse } from '@/shared/types'
import type { PhysicsGuardSummary } from '@/types/dispatch'
import { RESERVOIR_OPTIONS, gateaiSharedStore } from '@/api/gateaiSharedStore'

export interface ReservoirDetail {
  id: number
  name: string
  code: string
  type: 'daily_regulation' | 'seasonal' | 'multi_year'
  type_label: string
  normal_water_level: number
  installed_capacity: number
  status: 'normal' | 'maintenance'
  edge_node_count: number
  equipment_count: number
}

const TYPE_LABEL: Record<ReservoirDetail['type'], string> = {
  daily_regulation: '日调节',
  seasonal: '季调节',
  multi_year: '多年调节',
}

const MOCK_DETAIL: Record<number, Omit<ReservoirDetail, 'equipment_count'>> = {
  1: { id: 1, name: '向家坝', code: 'XJB', type: 'daily_regulation', type_label: '日调节', normal_water_level: 380, installed_capacity: 6400000, status: 'normal', edge_node_count: 2 },
  2: { id: 2, name: '溪洛渡', code: 'XLD', type: 'seasonal', type_label: '季调节', normal_water_level: 600, installed_capacity: 13860000, status: 'normal', edge_node_count: 1 },
  3: { id: 3, name: '三峡', code: 'SX', type: 'multi_year', type_label: '多年调节', normal_water_level: 175, installed_capacity: 22500000, status: 'normal', edge_node_count: 1 },
  4: { id: 4, name: '模拟水库', code: 'SIM', type: 'daily_regulation', type_label: '日调节', normal_water_level: 190, installed_capacity: 500000, status: 'normal', edge_node_count: 1 },
}

function delay<T>(data: T, ms = 120) {
  return new Promise<T>((resolve) => setTimeout(() => resolve(data), ms))
}

export function fetchReservoirList() {
  return delay(RESERVOIR_OPTIONS)
}

export async function getReservoirDetail(id: number, equipmentCount = 0): Promise<ApiResponse<ReservoirDetail>> {
  try {
    const res = await http.get<ApiResponse<ReservoirDetail>>(`/reservoirs/${id}`)
    if (res.data?.code === 0 && res.data.data) return res.data
  } catch { /* mock */ }
  const base = MOCK_DETAIL[id] ?? {
    id,
    name: RESERVOIR_OPTIONS.find((r) => r.id === id)?.name ?? `水库#${id}`,
    code: `R${id}`,
    type: 'daily_regulation' as const,
    type_label: TYPE_LABEL.daily_regulation,
    normal_water_level: 200,
    installed_capacity: 1000000,
    status: 'normal' as const,
    edge_node_count: 1,
  }
  return {
    code: 0,
    msg: 'ok',
    success: true,
    trace_id: 'mock-reservoir',
    data: { ...base, equipment_count: equipmentCount },
  }
}

export function fetchReservoirPhysicsSummary(reservoirId: number): Promise<PhysicsGuardSummary> {
  return delay(gateaiSharedStore.getPhysicsSummary(reservoirId) as PhysicsGuardSummary)
}
