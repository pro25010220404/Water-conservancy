// ============================================================
// 告警管理 — API 接口层
// ============================================================
import type { ApiResponse, PageResult } from '@/shared/types'
import type { AlarmRecord, AlarmFilterParams, AlarmExceedLog, AlarmStatsResult } from '@/types/alarm'
import { mockApi } from './mockStore'

async function fetchMock<T>(_url: string, _options?: RequestInit): Promise<ApiResponse<T>> {
  throw new Error('API not ready')
}

export async function getAlarmList(params: AlarmFilterParams): Promise<ApiResponse<PageResult<AlarmRecord> & { pendingCount: number }>> {
  try {
    const query = new URLSearchParams(Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    return fetchMock(`/api/alarms/list?${query}`)
  } catch {
    return mockApi.getAlarmList(params)
  }
}

export async function getAlarmDetail(id: number): Promise<ApiResponse<AlarmRecord>> {
  try { return fetchMock(`/api/alarms/${id}`) } catch { return mockApi.getAlarmDetail(id) }
}

export async function confirmAlarm(id: number): Promise<ApiResponse<null>> {
  try { return fetchMock(`/api/alarms/${id}/confirm`, { method: 'PUT' }) } catch { return mockApi.confirmAlarm(id) }
}

export async function handleAlarm(params: { id: number; remark: string }): Promise<ApiResponse<null>> {
  try { return fetchMock(`/api/alarms/${params.id}/handle`, { method: 'PUT', body: JSON.stringify({ remark: params.remark }) }) } catch { return mockApi.handleAlarm(params) }
}

export async function getAlarmExceedLogs(params: Record<string, unknown>): Promise<ApiResponse<PageResult<AlarmExceedLog>>> {
  try {
    const query = new URLSearchParams(Object.entries(params).filter(([_, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString()
    return fetchMock(`/api/alarms/logs?${query}`)
  } catch {
    return mockApi.getExceedLogs({ keyword: params.keyword as string | undefined })
  }
}

export async function getPendingAlarmCount(): Promise<ApiResponse<{ count: number }>> {
  try { return fetchMock('/api/alarms/pending-count') } catch {
    const res = await mockApi.getAlarmStats()
    return { ...res, data: { count: res.data.pending } }
  }
}

export async function getAlarmStats(): Promise<ApiResponse<AlarmStatsResult>> {
  try { return fetchMock('/api/alarms/stats') } catch { return mockApi.getAlarmStats() }
}
