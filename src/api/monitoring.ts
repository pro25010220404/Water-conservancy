// ============================================================
// 监控大屏 — 全部 API（Mock 降级可通过 MOCK_FALLBACK 开关控制）
// ============================================================
import http from './request'
import type { ApiResponse, PageResult } from '@/shared/types'
import type { RealtimeKpi, DashboardAlarm } from '@/types/monitoring'

/**
 * 全局 Mock 降级开关：
 *   true  — API 失败时自动走 Mock（默认，不影响使用）
 *   false — API 失败直接抛错，方便调试是否真正接上了后端
 */
export const MOCK_FALLBACK = false

// ═══ 类型 ═══

interface RealtimeRaw {
  upstream_level: string; downstream_level: string; water_head?: string
  inflow_rate: string; outflow_rate: string; gate_opening: string
  power_output: string; timestamp: string
}
interface TrendPointRaw { timestamp: string; value: number }
interface GateRaw {
  id: number; name: string; code: string; status: string
  opening: number; target_opening: number; mode: string
  flow_rate: number; last_action_at: string
}
interface AlarmRaw {
  id: number; alarm_no?: string; level: string; type?: string
  message: string; status?: string; created_at: string
}
interface PowerUnitRaw {
  id: number; reservoir_id: number; reservoir_name: string; name: string
  code: string; type: string; installed_capacity: number; status: string
  current_output: number; manufacturer: string; model: string
  commission_date: string; utilization_rate: number
}
interface PowerTrendRaw {
  granularity: string; start_time: string; end_time: string
  series: Array<{ reservoir_id: number; reservoir_name: string; data: Array<{ time: string; avg_power: number; max_power: number; min_power: number; total_energy: number }> }>
}
interface CameraRaw {
  id: number; name: string; area: string; status: string; motion: string; alarmZone: string
}
interface DoorRaw {
  id: number; name: string; location: string; type: string; status: string; last_access: string; last_user: string
}
interface PatrolRaw {
  id: number; route: string; patrol_user: string; start_time: string; end_time: string | null
  status: string; checkpoints: number; abnormal: number; summary: string
}
interface SecurityAlarmRaw {
  id: number; alarm_no: string; type: string; level: string; message: string
  location: string; status: string; trigger_time: string; acknowledge_time: string | null
}
interface GateActionRaw {
  id: number; equipment_id: number; previous_opening: number; target_opening: number
  actual_opening: number; action_type: string; action_source: string
  duration_ms: number; is_smoothed: number; acted_at: string
}
interface PredictionRaw { /* 未定义 schema */ }

// ═══ L1 ═══

export function getMonitoringRealtime(params: { reservoir_id: string }) {
  return http.get<ApiResponse<RealtimeRaw>>('/monitoring/realtime', { params })
}
export function getMonitoringTrend(params: { reservoir_id: number; range: string; data_type: string }) {
  return http.get<ApiResponse<TrendPointRaw[]>>('/monitoring/trend', { params })
}
export function getMonitoringGates(params?: { reservoir_id?: number }) {
  return http.get<ApiResponse<GateRaw[]>>('/monitoring/gates', { params })
}
export function getAlarms(params?: { page?: number; page_size?: number; level?: string; status?: string }) {
  return http.get<ApiResponse<PageResult<AlarmRaw>>>('/v1/alarms', { params })
}
export function getPowerUnits(params?: { reservoir_id?: string }) {
  return http.get<ApiResponse<PowerUnitRaw[]>>('/v1/power/units', { params })
}
export function getPowerTrend(params?: { reservoir_id?: string; granularity?: string }) {
  return http.get<ApiResponse<PowerTrendRaw>>('/v1/power/trend', { params })
}
export function getSecurityCameras(params?: { status?: string; resolution?: string }) {
  return http.get<ApiResponse<CameraRaw[]>>('/v1/security/cameras', { params })
}
export function getSecurityDoors(params?: { status?: string }) {
  return http.get<ApiResponse<{ total: number; locked: number; list: DoorRaw[] }>>('/v1/security/doors', { params })
}
export function getSecurityPatrols(params?: { status?: string; keyword?: string }) {
  return http.get<ApiResponse<{ total: number; list: PatrolRaw[] }>>('/v1/security/patrols', { params })
}
export function getSecurityAlarms(params?: { status?: string; level?: string }) {
  return http.get<ApiResponse<{ total: number; unhandled: number; list: SecurityAlarmRaw[] }>>('/v1/security/alarms', { params })
}
export function getGateActions(params?: Record<string, unknown>) {
  return http.get<ApiResponse<PageResult<GateActionRaw>>>('/v1/dispatch/gate-actions', { params })
}
export function getPredictions(params: { reservoir_id: number }) {
  return http.get<ApiResponse<PredictionRaw>>('/v1/dispatch/predictions', { params })
}

// ═══ L2: Mock 降级 ═══

function delay<T>(data: T, ms = 150): Promise<T> {
  return new Promise((r) => setTimeout(() => r(data), ms))
}

// ── Realtime KPI ──
function mockKpi(): RealtimeKpi {
  const t = Math.sin(Date.now() / 30000)
  return {
    upstreamLevel: +(378.52 + t * 0.3).toFixed(2), downstreamLevel: +(269.18 + t * 0.05).toFixed(2),
    inflowRate: Math.round(6350 + t * 200), outflowRate: Math.round(5820 + t * 180),
    gateOpening: +(34 + t * 5).toFixed(1), powerOutput: Math.round(4119 + t * 30),
    capacity: +(48.36 + t * 0.1).toFixed(2), timestamp: new Date().toISOString(),
  }
}
export async function fetchRealtimeKpi(reservoirId: number): Promise<RealtimeKpi> {
  try {
    const res = await getMonitoringRealtime({ reservoir_id: String(reservoirId) })
    if (res.data?.code === 0 && res.data.data) {
      const d = res.data.data
      return {
        upstreamLevel: parseFloat(d.upstream_level), downstreamLevel: parseFloat(d.downstream_level),
        inflowRate: parseFloat(d.inflow_rate), outflowRate: parseFloat(d.outflow_rate),
        gateOpening: parseFloat(d.gate_opening), powerOutput: parseFloat(d.power_output),
        capacity: 48.36, timestamp: d.timestamp,
      }
    }
  } catch (e) { if (!MOCK_FALLBACK) throw e }
  return delay(mockKpi())
}

// ── 告警 ──
const DEFAULT_ALARMS: DashboardAlarm[] = [
  { time: '14:32', level: 'warning', msg: '1#边缘网关 CPU 使用率 88%', status: '未处理' },
  { time: '12:05', level: 'warning', msg: '下游河道周界入侵告警', status: '已确认' },
  { time: '08:22', level: 'critical', msg: '开关站门禁异常开启', status: '已处理' },
]
export async function fetchDashboardAlarms(): Promise<DashboardAlarm[]> {
  try {
    const res = await getAlarms({ page: 1, page_size: 5 })
    if (res.data?.code === 0 && res.data.data) {
      return res.data.data.list.map((a) => ({
        time: a.created_at?.slice(11, 16) ?? '--:--',
        level: (a.level === 'critical' ? 'critical' : 'warning') as DashboardAlarm['level'],
        msg: a.message, status: a.status ?? '未处理',
      }))
    }
  } catch (e) { if (!MOCK_FALLBACK) throw e }
  return delay([...DEFAULT_ALARMS])
}

// ── 闸门列表 ──
export async function fetchGates(reservoirId?: number): Promise<GateRaw[]> {
  try {
    const res = await getMonitoringGates(reservoirId ? { reservoir_id: reservoirId } : undefined)
    if (res.data?.code === 0 && Array.isArray(res.data.data)) return res.data.data
  } catch (e) { if (!MOCK_FALLBACK) throw e }
  return delay(gateMocks())
}
function gateMocks(): GateRaw[] {
  return [
    { id:1,name:'1#',code:'G01',status:'online',opening:62,target_opening:60,mode:'AI-DQN',flow_rate:120,last_action_at:'14:32' },
    { id:2,name:'2#',code:'G02',status:'online',opening:48,target_opening:50,mode:'AI-DQN',flow_rate:95,last_action_at:'14:08' },
    { id:3,name:'3#',code:'G03',status:'online',opening:35,target_opening:35,mode:'AI-DQN',flow_rate:70,last_action_at:'13:45' },
    { id:4,name:'4#',code:'G04',status:'online',opening:71,target_opening:70,mode:'AI-DQN',flow_rate:140,last_action_at:'14:20' },
    { id:5,name:'5#',code:'G05',status:'online',opening:55,target_opening:55,mode:'AI-DQN',flow_rate:108,last_action_at:'14:10' },
    { id:6,name:'6#',code:'G06',status:'online',opening:42,target_opening:40,mode:'AI-DQN',flow_rate:82,last_action_at:'13:55' },
    { id:7,name:'7#',code:'G07',status:'online',opening:38,target_opening:40,mode:'AI-DQN',flow_rate:75,last_action_at:'12:10' },
    { id:8,name:'8#',code:'G08',status:'online',opening:60,target_opening:60,mode:'AI-DQN',flow_rate:118,last_action_at:'14:28' },
    { id:9,name:'中1#',code:'G09',status:'online',opening:18,target_opening:20,mode:'manual',flow_rate:35,last_action_at:'13:30' },
    { id:10,name:'中2#',code:'G10',status:'online',opening:22,target_opening:20,mode:'manual',flow_rate:42,last_action_at:'13:32' },
    { id:11,name:'底1#',code:'G11',status:'offline',opening:0,target_opening:0,mode:'manual',flow_rate:0,last_action_at:'--' },
    { id:12,name:'底2#',code:'G12',status:'offline',opening:0,target_opening:0,mode:'manual',flow_rate:0,last_action_at:'--' },
  ]
}

// ── 发电机组 ──
export async function fetchPowerUnits(reservoirId?: number): Promise<PowerUnitRaw[]> {
  try {
    const res = await getPowerUnits(reservoirId ? { reservoir_id: String(reservoirId) } : undefined)
    if (res.data?.code === 0 && Array.isArray(res.data.data)) return res.data.data
  } catch (e) { if (!MOCK_FALLBACK) throw e }
  return delay(powerUnitMocks())
}
function powerUnitMocks(): PowerUnitRaw[] {
  return [
    { id:1,reservoir_id:1,reservoir_name:'示范水库',name:'1#机组',code:'GEN01',type:'hydro',installed_capacity:7500,status:'online',current_output:685,manufacturer:'东方电机',model:'SF750-80',commission_date:'2003-06-01',utilization_rate:0.94 },
    { id:2,reservoir_id:1,reservoir_name:'示范水库',name:'2#机组',code:'GEN02',type:'hydro',installed_capacity:7500,status:'online',current_output:692,manufacturer:'东方电机',model:'SF750-80',commission_date:'2003-07-01',utilization_rate:0.95 },
    { id:3,reservoir_id:1,reservoir_name:'示范水库',name:'3#机组',code:'GEN03',type:'hydro',installed_capacity:7500,status:'stopped',current_output:0,manufacturer:'哈尔滨电机',model:'SF750-80',commission_date:'2003-08-01',utilization_rate:0 },
    { id:4,reservoir_id:1,reservoir_name:'示范水库',name:'4#机组',code:'GEN04',type:'hydro',installed_capacity:7500,status:'online',current_output:678,manufacturer:'东方电机',model:'SF750-80',commission_date:'2003-09-01',utilization_rate:0.93 },
    { id:5,reservoir_id:1,reservoir_name:'示范水库',name:'5#机组',code:'GEN05',type:'hydro',installed_capacity:7500,status:'online',current_output:688,manufacturer:'哈尔滨电机',model:'SF750-80',commission_date:'2003-10-01',utilization_rate:0.94 },
    { id:6,reservoir_id:1,reservoir_name:'示范水库',name:'6#机组',code:'GEN06',type:'hydro',installed_capacity:7500,status:'maintenance',current_output:0,manufacturer:'东方电机',model:'SF750-80',commission_date:'2003-11-01',utilization_rate:0 },
    { id:7,reservoir_id:1,reservoir_name:'示范水库',name:'7#机组',code:'GEN07',type:'hydro',installed_capacity:7500,status:'online',current_output:695,manufacturer:'哈尔滨电机',model:'SF750-80',commission_date:'2004-01-01',utilization_rate:0.95 },
    { id:8,reservoir_id:1,reservoir_name:'示范水库',name:'8#机组',code:'GEN08',type:'hydro',installed_capacity:7500,status:'online',current_output:681,manufacturer:'东方电机',model:'SF750-80',commission_date:'2004-02-01',utilization_rate:0.94 },
  ]
}

// ── 发电趋势 ──
export async function fetchPowerTrendData(reservoirId?: number): Promise<PowerTrendRaw['series'][0]['data']> {
  try {
    const res = await getPowerTrend(reservoirId ? { reservoir_id: String(reservoirId) } : undefined)
    if (res.data?.code === 0 && res.data.data?.series?.[0]?.data) return res.data.data.series[0].data
  } catch (e) { if (!MOCK_FALLBACK) throw e }
  return delay(powerTrendMocks())
}
function powerTrendMocks() {
  const now = Date.now()
  return Array.from({length: 60}, (_, i) => ({
    time: new Date(now - (59 - i) * 60000).toLocaleTimeString('zh-CN'),
    avg_power: 650 + Math.random() * 50, max_power: 700 + Math.random() * 20,
    min_power: 600 + Math.random() * 50, total_energy: 37500 + i * 38,
  }))
}

// ── 安防 ──
// 3 秒超时辅助
function raceTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

export async function fetchSecurityCameras(): Promise<CameraRaw[]> {
  const mock: CameraRaw[] = [
    { id:1,name:'坝顶 1#',area:'坝顶',status:'online',motion:'2分钟前',alarmZone:'坝顶' },
    { id:2,name:'坝顶 2#',area:'坝顶',status:'online',motion:'刚刚',alarmZone:'坝顶' },
    { id:3,name:'厂房入口',area:'厂房',status:'online',motion:'5分钟前',alarmZone:'厂房' },
    { id:4,name:'中控室',area:'厂房',status:'online',motion:'—',alarmZone:'中控室' },
    { id:5,name:'下游河道',area:'下游',status:'offline',motion:'—',alarmZone:'下游' },
    { id:6,name:'开关站',area:'下游',status:'online',motion:'1小时前',alarmZone:'开关站' },
  ]
  return raceTimeout((async () => {
    try { const res = await getSecurityCameras(); if (res.data?.code === 0 && Array.isArray(res.data.data)) return res.data.data } catch { /* */ }
    return mock
  })(), 3000, mock)
}
export async function fetchSecurityDoors(): Promise<DoorRaw[]> {
  const mock: DoorRaw[] = [
    { id:1,name:'主厂房大门',location:'厂房',type:'主入口',status:'locked',last_access:'14:25',last_user:'张工' },
    { id:2,name:'中控室',location:'厂房',type:'控制区',status:'locked',last_access:'14:10',last_user:'李工' },
    { id:3,name:'GIS 室',location:'厂房',type:'设备区',status:'locked',last_access:'—',last_user:'—' },
    { id:4,name:'坝顶通道',location:'坝顶',type:'通道',status:'unlocked',last_access:'13:50',last_user:'巡检员' },
  ]
  return raceTimeout((async () => {
    try { const res = await getSecurityDoors(); if (res.data?.code === 0 && res.data.data?.list) return res.data.data.list } catch { /* */ }
    return mock
  })(), 3000, mock)
}
export async function fetchSecurityPatrols(): Promise<PatrolRaw[]> {
  const mock: PatrolRaw[] = [
    { id:1,route:'坝顶 → 厂房 → 下游',patrol_user:'王巡检',start_time:'09:30',end_time:'10:15',status:'completed',checkpoints:12,abnormal:0,summary:'正常' },
    { id:2,route:'GIS室 → 开关站 → 中控',patrol_user:'赵巡检',start_time:'14:00',end_time:'14:38',status:'completed',checkpoints:8,abnormal:0,summary:'正常' },
    { id:3,route:'坝顶 → 下游河道 → 厂房',patrol_user:'王巡检',start_time:'18:30',end_time:null,status:'in_progress',checkpoints:10,abnormal:0,summary:'待执行' },
  ]
  return raceTimeout((async () => {
    try { const res = await getSecurityPatrols(); if (res.data?.code === 0 && res.data.data?.list) return res.data.data.list } catch { /* */ }
    return mock
  })(), 3000, mock)
}
export async function fetchSecurityAlarmList(): Promise<SecurityAlarmRaw[]> {
  const mock: SecurityAlarmRaw[] = [
    { id:1,alarm_no:'SEC-001',type:'周界入侵',level:'warning',message:'下游河道周界入侵告警',location:'下游河道',status:'已处理',trigger_time:'12:05',acknowledge_time:'12:10' },
    { id:2,alarm_no:'SEC-002',type:'门禁异常',level:'critical',message:'开关站门禁异常开启',location:'开关站',status:'已处理',trigger_time:'08:22',acknowledge_time:'08:30' },
  ]
  return raceTimeout((async () => {
    try { const res = await getSecurityAlarms(); if (res.data?.code === 0 && res.data.data?.list) return res.data.data.list } catch { /* */ }
    return mock
  })(), 3000, mock)
}

// ── 闸门动作日志 ──
export async function fetchGateActionLogs(): Promise<GateActionRaw[]> {
  try { const res = await getGateActions(); if (res.data?.code === 0 && res.data.data?.list) return res.data.data.list } catch { /* mock */ }
  return delay([
    { id:1,equipment_id:3,previous_opening:32,target_opening:28,actual_opening:28,action_type:'close',action_source:'AI调度',duration_ms:12000,is_smoothed:1,acted_at:'14:32' },
    { id:2,equipment_id:10,previous_opening:15,target_opening:20,actual_opening:20,action_type:'open',action_source:'张工',duration_ms:8000,is_smoothed:0,acted_at:'14:08' },
    { id:3,equipment_id:5,previous_opening:28,target_opening:35,actual_opening:35,action_type:'open',action_source:'LSTM',duration_ms:15000,is_smoothed:1,acted_at:'13:45' },
    { id:4,equipment_id:2,previous_opening:35,target_opening:30,actual_opening:30,action_type:'close',action_source:'AI调度',duration_ms:11000,is_smoothed:1,acted_at:'13:22' },
    { id:5,equipment_id:7,previous_opening:40,target_opening:32,actual_opening:32,action_type:'close',action_source:'急停',duration_ms:14000,is_smoothed:0,acted_at:'12:10' },
  ])
}
