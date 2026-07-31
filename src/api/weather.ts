// ============================================================
// 天气接口 — 实时 / 小时 / 逐日预报（Apifox §14）
// ============================================================
import http from './request'
import type { ApiResponse } from '@/shared/types'
import type { WeatherCurrent, WeatherHourly, WeatherDaily } from '@/types/weather'

/** GET /v1/weather/current — 获取实时天气 */
export function getWeatherCurrent(params?: { latitude?: number; longitude?: number }) {
  return http.get<ApiResponse<WeatherCurrent>>('/v1/weather/current', { params })
}

/** GET /v1/weather/hourly — 获取逐小时预报 */
export function getWeatherHourly(params?: {
  latitude?: number
  longitude?: number
  hours?: number
}) {
  return http.get<ApiResponse<WeatherHourly>>('/v1/weather/hourly', { params })
}

/** GET /v1/weather/daily — 获取逐日预报 */
export function getWeatherDaily(params?: { latitude?: number; longitude?: number; days?: number }) {
  return http.get<ApiResponse<WeatherDaily>>('/v1/weather/daily', { params })
}
