// ============================================================
// 全局急停 — API 接口层
// ============================================================
import type { ApiResponse } from '@/shared/types'
import { mockApi } from './mockStore'

async function fetchMock<T>(_url: string, _options?: RequestInit): Promise<ApiResponse<T>> {
  throw new Error('API not ready')
}

async function withMockFallback<T>(
  url: string,
  mockFn: () => Promise<ApiResponse<T>>,
  options?: RequestInit,
): Promise<ApiResponse<T>> {
  try {
    return await fetchMock<T>(url, options)
  } catch {
    return mockFn()
  }
}

/** 全局急停 — 停止调度执行、暂停仿真、闸门开度归零 */
export async function globalEmergencyStop(): Promise<
  ApiResponse<{ stop_log_id: number; command_id: string }>
> {
  return withMockFallback('/dispatch/emergency-stop', () => mockApi.globalEmergencyStop(), {
    method: 'POST',
    body: JSON.stringify({ stop_reason: '人工触发急停' }),
  })
}
