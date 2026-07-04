// ============================================================
// Mock 数据仓库 — 向家坝水电站实时模拟（后端就绪后移除）
// ============================================================
import type { AlarmRecord, AlarmExceedLog, AlarmFilterParams, AlarmStatsResult } from '@/types/alarm'
import { ALARM_TYPE_MAP } from '@/constants/alarm'
import { fuzzyMatch } from '@/utils/fuzzyMatch'
import type {
  DispatchStatus, DecisionDetail, PredictionData, DispatchRecord,
} from '@/types/dispatch'
import type {
  SimulationRealtimeData, SimulationParams, SimulationStartPayload,
  SimulationSpeed, AiModel, SimulationReport, FaultReview, TrainingTask,
} from '@/types/simulation'
import { XIANGJIABA_HYDRO } from '@/constants/xiangjiaba'
import {
  createInitialTelemetry,
  stepHydrology,
  diurnalInflowOffset,
  type StationTelemetry,
} from '@/utils/xiangjiabaTelemetry'

const STATION = '向家坝水电站'
let tick = 0
const TICK_SEC = 3

/** 向家坝水文站实时遥测（调度 / 孪生共用） */
let stationLive: StationTelemetry = createInitialTelemetry()

function jitter(base: number, range: number) {
  return +(base + Math.sin(tick * 0.3) * range * 0.5 + (Math.random() - 0.5) * range * 0.3).toFixed(2)
}

function pushHistory() {
  const t = simState.status === 'running' ? simState.elapsedSec : Math.floor(Date.now() / 1000) % 100000
  simState.historyLevels.push({ time: t, value: simState.currentLevel })
  simState.historyFlows.push({ time: t, value: simState.currentFlow })
  if (simState.historyLevels.length > 180) simState.historyLevels.shift()
  if (simState.historyFlows.length > 180) simState.historyFlows.shift()
}

function syncSimFromStation() {
  simState.currentLevel = stationLive.upstreamLevel
  simState.currentDownstreamLevel = stationLive.downstreamLevel
  simState.currentFlow = stationLive.inflowRate
  simState.currentOpening = stationLive.gateOpening
}

function syncDispatchFromStation() {
  dispatchStatus.upstreamLevel = stationLive.upstreamLevel
  dispatchStatus.downstreamLevel = stationLive.downstreamLevel
  dispatchStatus.flowRate = stationLive.inflowRate
  dispatchStatus.gateOpening = stationLive.gateOpening
}

function nowIso(offsetMin = 0) {
  return new Date(Date.now() - offsetMin * 60000).toISOString()
}

// ---------- 告警 ----------
const alarmStore: AlarmRecord[] = [
  {
    id: 1001, level: 'URGENT', type: 'HIGH_WATER', content: `${STATION}上游水位持续超限`,
    threshold: 380.5, currentValue: 381.2, durationSec: 42, status: 'pending',
    confirmedAt: null, confirmedBy: null, confirmedByName: null,
    handledAt: null, handledBy: null, handledByName: null, remark: null,
    createdAt: nowIso(15), pointName: '上游水文站', deviceType: 'hydro',
    snapshot: { upstreamLevel: 381.2, downstreamLevel: 278.5, flowRate: 1850, gateOpening: 45, recordedAt: nowIso(15) },
  },
  {
    id: 1002, level: 'IMPORTANT', type: 'FLOW_SPIKE', content: '入库流量突变，变化率超阈值',
    threshold: 2000, currentValue: 2350, durationSec: 35, status: 'pending',
    confirmedAt: null, confirmedBy: null, confirmedByName: null,
    handledAt: null, handledBy: null, handledByName: null, remark: null,
    createdAt: nowIso(28), pointName: '入库监测站', deviceType: 'hydro',
    snapshot: { upstreamLevel: 380.8, downstreamLevel: 278.3, flowRate: 2350, gateOpening: 42, recordedAt: nowIso(28) },
  },
  {
    id: 1003, level: 'IMPORTANT', type: 'DEVICE_OFFLINE', content: '3号闸门执行器通信中断',
    threshold: 30, currentValue: 0, durationSec: 68, status: 'confirmed',
    confirmedAt: nowIso(10), confirmedBy: 1, confirmedByName: '张调度',
    handledAt: null, handledBy: null, handledByName: null, remark: null,
    createdAt: nowIso(45), pointName: '3号闸门', deviceType: 'gate', snapshot: null,
  },
  {
    id: 1004, level: 'NORMAL', type: 'LOW_WATER', content: '下游生态流量偏低预警',
    threshold: 1200, currentValue: 1150, durationSec: 31, status: 'handled',
    confirmedAt: nowIso(120), confirmedBy: 2, confirmedByName: '李运维',
    handledAt: nowIso(90), handledBy: 2, handledByName: '李运维',
    remark: '已调整3号闸门开度至55%，生态流量恢复达标。',
    createdAt: nowIso(150), pointName: '下游生态站', deviceType: 'hydro', snapshot: null,
  },
  {
    id: 1005, level: 'NORMAL', type: 'EXEC_TIMEOUT', content: '5号闸门开度调节执行超时',
    threshold: 60, currentValue: 85, durationSec: 32, status: 'handled',
    confirmedAt: nowIso(200), confirmedBy: 1, confirmedByName: '张调度',
    handledAt: nowIso(180), handledBy: 1, handledByName: '张调度',
    remark: '现场检查液压系统，重启执行器后恢复正常。',
    createdAt: nowIso(220), pointName: '5号闸门', deviceType: 'gate', snapshot: null,
  },
  {
    id: 1006, level: 'URGENT', type: 'EXEC_FAIL', content: '1号闸门执行失败，需人工介入',
    threshold: 0, currentValue: 1, durationSec: 45, status: 'pending',
    confirmedAt: null, confirmedBy: null, confirmedByName: null,
    handledAt: null, handledBy: null, handledByName: null, remark: null,
    createdAt: nowIso(5), pointName: '1号闸门', deviceType: 'gate',
    snapshot: { upstreamLevel: 380.6, downstreamLevel: 278.4, flowRate: 1920, gateOpening: 38, recordedAt: nowIso(5) },
  },
  {
    id: 1007, level: 'IMPORTANT', type: 'HIGH_WATER', content: '2号表孔水位传感器读数异常偏高',
    threshold: 380.0, currentValue: 380.9, durationSec: 38, status: 'pending',
    confirmedAt: null, confirmedBy: null, confirmedByName: null,
    handledAt: null, handledBy: null, handledByName: null, remark: null,
    createdAt: nowIso(8), pointName: '2号表孔传感器', deviceType: 'sensor',
    snapshot: { upstreamLevel: 380.9, downstreamLevel: 278.2, flowRate: 1880, gateOpening: 40, recordedAt: nowIso(8) },
  },
  {
    id: 1008, level: 'NORMAL', type: 'FLOW_SPIKE', content: '出库流量短时波动，疑似传感器噪声',
    threshold: 1800, currentValue: 1950, durationSec: 33, status: 'handled',
    confirmedAt: nowIso(60), confirmedBy: 2, confirmedByName: '李运维',
    handledAt: nowIso(50), handledBy: 2, handledByName: '李运维',
    remark: '经复核为传感器校准偏差，已标记误告警并完成校准。',
    createdAt: nowIso(80), pointName: '出库流量传感器', deviceType: 'sensor',
    isFalseAlarm: true, snapshot: null,
  },
  {
    id: 1009, level: 'URGENT', type: 'HIGH_WATER', content: '向家坝库区水位逼近汛限，需调度关注',
    threshold: 380.5, currentValue: 381.0, durationSec: 55, status: 'confirmed',
    confirmedAt: nowIso(3), confirmedBy: 1, confirmedByName: '张调度',
    handledAt: null, handledBy: null, handledByName: null, remark: null,
    createdAt: nowIso(12), pointName: '库区水位监测站', deviceType: 'hydro',
    snapshot: { upstreamLevel: 381.0, downstreamLevel: 278.6, flowRate: 2100, gateOpening: 48, recordedAt: nowIso(12) },
  },
  {
    id: 1010, level: 'IMPORTANT', type: 'DEVICE_OFFLINE', content: '4号闸门位移传感器离线',
    threshold: 0, currentValue: 0, durationSec: 40, status: 'handled',
    confirmedAt: nowIso(300), confirmedBy: 1, confirmedByName: '张调度',
    handledAt: nowIso(280), handledBy: 1, handledByName: '张调度',
    remark: '更换通信模块后恢复在线，位移数据正常。',
    createdAt: nowIso(320), pointName: '4号闸门', deviceType: 'gate', snapshot: null,
  },
]

const exceedLogs: AlarmExceedLog[] = [
  { id: 501, point: '上游水文站', type: 'HIGH_WATER', value: 380.8, threshold: 380.5, durationSec: 18, createdAt: nowIso(2) },
  { id: 502, point: '入库监测站', type: 'FLOW_SPIKE', value: 2100, threshold: 2000, durationSec: 22, createdAt: nowIso(1) },
  { id: 503, point: '下游生态站', type: 'LOW_WATER', value: 1180, threshold: 1200, durationSec: 15, createdAt: nowIso(0) },
  { id: 504, point: '2号表孔传感器', type: 'HIGH_WATER', value: 380.6, threshold: 380.5, durationSec: 12, createdAt: nowIso(4) },
  { id: 505, point: '出库流量传感器', type: 'FLOW_SPIKE', value: 2050, threshold: 2000, durationSec: 8, createdAt: nowIso(6) },
  { id: 506, point: '1号闸门', type: 'EXEC_TIMEOUT', value: 72, threshold: 60, durationSec: 25, createdAt: nowIso(3) },
]

// ---------- 调度 ----------
type AutoLevel = 1 | 2 | 3

let dispatchStatus: DispatchStatus = {
  mode: 'auto', autoLevel: 2 as AutoLevel,
  upstreamLevel: stationLive.upstreamLevel,
  downstreamLevel: stationLive.downstreamLevel,
  flowRate: stationLive.inflowRate,
  gateOpening: stationLive.gateOpening,
  lastDispatchAt: nowIso(30), isExecuting: false,
}

const decisionBase: DecisionDetail = {
  id: 1, trace_id: 'trace-001', reservoir_id: 1,
  decision_time: nowIso(0), decision_mode: 'L2', risk_rank: 1,
  upstream_level: 380.65, downstream_level: 278.42, inflow_rate: 1920, current_opening: 45,
  lstm_predictions: { '1h': { level: 380.8, flow: 1950 }, '3h': { level: 381.1, flow: 2100 }, '6h': { level: 381.5, flow: 2300 } },
  recommended_opening: 52, confidence: 87,
  factors: [
    { name: '当前水位', value: '380.65 m', direction: 'up', weight: 0.22 },
    { name: 'LSTM预测水位', value: '381.10 m', direction: 'up', weight: 0.25 },
    { name: '实时流量', value: '1920 m³/s', direction: 'up', weight: 0.18 },
    { name: '闸门开度', value: '45%', direction: 'neutral', weight: 0.12 },
    { name: '防洪安全约束', value: '0.85 m', direction: 'down', weight: 0.13 },
    { name: '生态流量要求', value: '达标', direction: 'neutral', weight: 0.10 },
  ],
  alternatives: [
    { id: '推荐', opening: 52, expectedLevel: 380.2, power: 2850, safetyScore: 92, totalScore: 91, recommended: true, confidence: 87 },
    { id: '保守', opening: 38, expectedLevel: 380.8, power: 2100, safetyScore: 96, totalScore: 85, recommended: false, confidence: 72 },
    { id: '激进', opening: 65, expectedLevel: 379.6, power: 3200, safetyScore: 78, totalScore: 82, recommended: false, confidence: 58 },
  ],
  weights_used: { power_weight: 0.40, safety_weight: 0.35, ecology_weight: 0.25 },
  reward_score: 0.87, physics_validation: null,
  execution_status: 'pending', executed_opening: null, actual_level_after: null, actual_power_after: null,
  created_at: nowIso(0),
}

const dispatchRecords: DispatchRecord[] = [
  { id: 1, decision_time: nowIso(30), decision_mode: 'L2', recommended_opening: 45, confidence: 85, risk_rank: 1, execution_status: 'executed', physics_validation: null },
  { id: 2, decision_time: nowIso(90), decision_mode: 'L1', recommended_opening: 42, confidence: 72, risk_rank: 2, execution_status: 'executed', physics_validation: null },
  { id: 3, decision_time: nowIso(180), decision_mode: 'L3', recommended_opening: 48, confidence: 91, risk_rank: 1, execution_status: 'executed', physics_validation: null },
]

// ---------- 仿真 ----------
let simState: SimulationRealtimeData = {
  status: 'idle', elapsedSec: 0,
  currentLevel: stationLive.upstreamLevel,
  currentDownstreamLevel: stationLive.downstreamLevel,
  currentFlow: stationLive.inflowRate,
  currentOpening: stationLive.gateOpening,
  historyLevels: [], historyFlows: [],
}

// 预填近期水位曲线，进入页面即可见动态趋势
for (let i = 24; i >= 0; i--) {
  const lv = +(stationLive.upstreamLevel - i * 0.012 + Math.sin(i * 0.4) * 0.025).toFixed(2)
  simState.historyLevels.push({ time: i, value: lv })
  simState.historyFlows.push({ time: i, value: stationLive.inflowRate + Math.sin(i * 0.3) * 30 })
}

let simParams: SimulationParams = {
  scene: 'normal',
  initialLevel: XIANGJIABA_HYDRO.normalPoolLevel,
  inflowRate: XIANGJIABA_HYDRO.normalInflow,
  durationMin: 60,
}

let simSpeed: SimulationSpeed = 1

const models: AiModel[] = [
  { id: 1, type: 'LSTM', version: 'v2.1.0', filePath: '/models/lstm_v210.pt', status: 'active', metrics: { mae: 0.042, rmse: 0.068, accuracy: 94.2 }, remark: '向家坝水位预测主模型', createdAt: nowIso(43200), activatedAt: nowIso(1440) },
  { id: 2, type: 'DQN', version: 'v2.3.1', filePath: '/models/dqn_v231.pt', status: 'active', metrics: { mae: 0.035, accuracy: 91.8 }, remark: '闸门调度决策模型', createdAt: nowIso(21600), activatedAt: nowIso(720) },
  { id: 3, type: 'LSTM', version: 'v2.0.5', filePath: '/models/lstm_v205.pt', status: 'inactive', metrics: { mae: 0.055, rmse: 0.082, accuracy: 89.5 }, remark: '上一版本', createdAt: nowIso(86400), activatedAt: null },
]

const reports: SimulationReport[] = [
  {
    id: 1, runId: 101, scene: 'flood', params: { scene: 'flood', initialLevel: 380.2, inflowRate: 3500, durationMin: 120 },
    summary: { maxLevel: 381.8, minLevel: 380.2, totalDischarge: 125000, estimatedPower: 28500 },
    content: '洪水场景下闸门逐步加大开度，最高水位381.8m，未突破汛限。建议汛前预泄方案可提前30min启动。',
    filePath: '/reports/r001.pdf', createdAt: nowIso(2880), operatorName: '王算法',
  },
  {
    id: 2, runId: 102, scene: 'normal', params: { scene: 'normal', initialLevel: 379.8, inflowRate: 1850, durationMin: 60 },
    summary: { maxLevel: 380.1, minLevel: 379.6, totalDischarge: 68000, estimatedPower: 15200 },
    content: '常规调度仿真：开度45%时水位稳定在379.9m附近，发电效率最优。',
    filePath: '/reports/r002.pdf', createdAt: nowIso(1440), operatorName: '张调度',
  },
  {
    id: 3, runId: 103, scene: 'dry', params: { scene: 'dry', initialLevel: 378.5, inflowRate: 900, durationMin: 90 },
    summary: { maxLevel: 378.8, minLevel: 378.2, totalDischarge: 32000, estimatedPower: 9800 },
    content: '枯水期仿真：生态流量保障优先，最小下泄流量满足要求。',
    filePath: '/reports/r003.pdf', createdAt: nowIso(720), operatorName: '李运维',
  },
]

const reviews: FaultReview[] = [
  {
    id: 1, alarmId: 1001, faultType: '高水位超限', impactScope: '上游库区、1-3号闸门',
    reviewed: false, status: 'pending', createdAt: nowIso(1440),
    timeline: [
      { time: '09:12:05', event: '水位超限持续35s，触发紧急告警' },
      { time: '09:12:40', event: '调度员确认告警' },
      { time: '09:13:10', event: 'AI建议开度60%（置信度72%）' },
      { time: '09:13:25', event: '调度员手动执行开度55%' },
      { time: '09:14:00', event: '水位开始下降' },
      { time: '09:18:30', event: '处置完成' },
    ],
    conclusion: null,
  },
  {
    id: 2, alarmId: 1004, faultType: '生态流量不足', impactScope: '下游河道生态段',
    reviewed: true, status: 'reviewed', createdAt: nowIso(4320),
    timeline: [
      { time: '14:20:00', event: '生态流量低于阈值，触发一般告警' },
      { time: '14:25:30', event: '调整3号闸门开度' },
      { time: '14:35:00', event: '生态流量恢复达标' },
    ],
    conclusion: { rootCause: '枯水期来水偏少，生态流量分配权重不足', improvements: '优化枯水期生态流量保障策略', responsibleDept: '调度中心', reviewedBy: '李运维', reviewedAt: nowIso(4000) },
  },
  {
    id: 3, alarmId: 1006, faultType: '闸门执行失败', impactScope: '1号表孔闸门、泄洪通道',
    reviewed: false, status: 'pending', createdAt: nowIso(480),
    timeline: [
      { time: '08:05:12', event: '1号闸门开度指令下发失败' },
      { time: '08:05:57', event: '持续超限42s，触发紧急告警' },
      { time: '08:06:20', event: '现场人员检查液压系统' },
      { time: '08:12:00', event: '切换备用执行器，闸门恢复正常' },
    ],
    conclusion: null,
  },
  {
    id: 4, alarmId: 1008, faultType: '传感器误报', impactScope: '出库流量监测',
    reviewed: true, status: 'reviewed', createdAt: nowIso(960),
    timeline: [
      { time: '16:30:00', event: '出库流量传感器短时超限' },
      { time: '16:30:33', event: '触发一般告警' },
      { time: '16:35:00', event: '人工复核确认为校准偏差' },
    ],
    conclusion: { rootCause: '传感器零点漂移导致读数偏高', improvements: '纳入月度校准计划，增加交叉校验', responsibleDept: '设备管理', reviewedBy: '王算法', reviewedAt: nowIso(900) },
  },
]

// ---------- 实时 tick（向家坝水文站遥测 + 仿真联动） ----------
setInterval(() => {
  tick++
  const hour = new Date().getHours()
  decisionBase.confidence = Math.round(jitter(87, 3))

  if (simState.status === 'running') {
    simState.elapsedSec += TICK_SEC * simSpeed
    const targetInflow = simParams.inflowRate + diurnalInflowOffset(hour) * 0.25
    stationLive = {
      ...stationLive,
      inflowRate: Math.round(targetInflow + (Math.random() - 0.5) * 40),
      gateOpening: simState.currentOpening,
      upstreamLevel: simState.currentLevel,
      downstreamLevel: simState.currentDownstreamLevel,
    }
    stationLive = stepHydrology(stationLive, tick, TICK_SEC * simSpeed, 1 / 220000)
    simState.currentLevel = stationLive.upstreamLevel
    simState.currentDownstreamLevel = stationLive.downstreamLevel
    simState.currentFlow = stationLive.inflowRate
    pushHistory()
    syncDispatchFromStation()
    if (simState.elapsedSec >= simParams.durationMin * 60) {
      simState.status = 'finished'
    }
  } else if (simState.status === 'paused') {
    // 暂停：保持当前值，仅记录历史点
    pushHistory()
  } else {
    // 待机：实时跟踪向家坝水文站（与调度页同源）
    const targetInflow = XIANGJIABA_HYDRO.normalInflow + diurnalInflowOffset(hour)
    stationLive = {
      ...stationLive,
      inflowRate: Math.round(targetInflow + (Math.random() - 0.5) * 35),
    }
    stationLive = stepHydrology(stationLive, tick, TICK_SEC)
    syncSimFromStation()
    syncDispatchFromStation()
    pushHistory()
  }

  decisionBase.factors[0].value = `${dispatchStatus.upstreamLevel} m`
  decisionBase.factors[2].value = `${dispatchStatus.flowRate} m³/s`
}, TICK_SEC * 1000)

function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms))
}

function ok<T>(data: T) {
  return { code: 0, msg: 'success', data, success: true, trace_id: 'mock' }
}

function filterAlarms(params: AlarmFilterParams) {
  let list = [...alarmStore]
  if (params.level) list = list.filter((a) => a.level === params.level)
  if (params.status) list = list.filter((a) => a.status === params.status)
  if (params.type) list = list.filter((a) => a.type === params.type)
  if (params.deviceType) list = list.filter((a) => a.deviceType === params.deviceType)
  if (params.startTime) {
    const start = new Date(params.startTime).getTime()
    list = list.filter((a) => new Date(a.createdAt).getTime() >= start)
  }
  if (params.endTime) {
    const end = new Date(params.endTime).getTime()
    list = list.filter((a) => new Date(a.createdAt).getTime() <= end)
  }
  if (params.keyword) {
    list = list.filter((a) => fuzzyMatch(
      params.keyword!,
      a.content,
      a.pointName,
      String(a.id),
      ALARM_TYPE_MAP[a.type]?.label,
    ))
  }
  return list
}

function todayStartMs() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ---------- 导出 API 函数 ----------
export const mockApi = {
  // 告警
  getAlarmList(params: AlarmFilterParams) {
    let list = filterAlarms(params)
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const total = list.length
    const start = (params.pageNum - 1) * params.pageSize
    list = list.slice(start, start + params.pageSize)
    const pendingCount = alarmStore.filter((a) => a.status === 'pending').length
    return delay(ok({ list, total, pageNum: params.pageNum, pageSize: params.pageSize, pendingCount }))
  },

  getAlarmDetail(id: number) {
    const item = alarmStore.find((a) => a.id === id)
    if (!item) return delay(Promise.reject(new Error('not found')))
    return delay(ok(item))
  },

  confirmAlarm(id: number) {
    const item = alarmStore.find((a) => a.id === id)
    if (item && item.status === 'pending') {
      item.status = 'confirmed'
      item.confirmedAt = nowIso(0)
      item.confirmedBy = 1
      item.confirmedByName = '当前用户'
    }
    return delay(ok(null))
  },

  handleAlarm(params: { id: number; remark: string }) {
    const item = alarmStore.find((a) => a.id === params.id)
    if (item && item.status !== 'handled') {
      item.status = 'handled'
      item.handledAt = nowIso(0)
      item.handledBy = 1
      item.handledByName = '当前用户'
      item.remark = params.remark
    }
    return delay(ok(null))
  },

  getExceedLogs(params?: { keyword?: string }) {
    let list = [...exceedLogs]
    if (params?.keyword) {
      list = list.filter((log) => fuzzyMatch(
        params.keyword!,
        log.point,
        ALARM_TYPE_MAP[log.type]?.label,
        String(log.value),
      ))
    }
    return delay(ok({ list, total: list.length, pageNum: 1, pageSize: 20 }))
  },

  getAlarmStats() {
    const start = todayStartMs()
    const todayList = alarmStore.filter((a) => new Date(a.createdAt).getTime() >= start)
    const stats: AlarmStatsResult = {
      today: todayList.length,
      pending: alarmStore.filter((a) => a.status === 'pending').length,
      handled: alarmStore.filter((a) => a.status === 'handled').length,
      falseAlarm: alarmStore.filter((a) => a.isFalseAlarm).length,
      levelDistribution: {
        URGENT: alarmStore.filter((a) => a.level === 'URGENT').length,
        IMPORTANT: alarmStore.filter((a) => a.level === 'IMPORTANT').length,
        NORMAL: alarmStore.filter((a) => a.level === 'NORMAL').length,
      },
    }
    return delay(ok(stats))
  },

  // 调度
  getDispatchStatus() { return delay(ok({ ...dispatchStatus })) },

  getDecisionDetail() {
    return delay(ok({ ...decisionBase, factors: [...decisionBase.factors], alternatives: [...decisionBase.alternatives] }))
  },

  getPrediction(horizon: '1h' | '3h' | '6h') {
    const termMap = { '1h': 1 as const, '3h': 2 as const, '6h': 3 as const }
    const pts = horizon === '1h' ? 12 : horizon === '3h' ? 36 : 72
    const now = Date.now()
    const step = 5 * 60000
    const water_seq = Array.from({ length: pts }, (_, i) => ({
      time: new Date(now + i * step).toISOString(),
      value: +(380.65 + Math.sin(i * 0.2 + tick * 0.1) * 0.4 + i * 0.005).toFixed(2),
    }))
    const flow_seq = Array.from({ length: pts }, (_, i) => ({
      time: water_seq[i].time,
      value: Math.round(1920 + Math.sin(i * 0.15) * 150 + i * 2),
    }))
    return delay(ok({ id: 1, base_time: new Date(now).toISOString(), predict_term: termMap[horizon], water_seq, flow_seq, predict_accuracy: 94.2, created_at: new Date(now).toISOString() } as PredictionData))
  },

  executeDispatch(params: { targetOpening: number }) {
    const v = Math.max(0, Math.min(100, Math.round(params.targetOpening)))
    dispatchStatus.gateOpening = v
    stationLive.gateOpening = v
    simState.currentOpening = v
    dispatchStatus.isExecuting = true
    setTimeout(() => { dispatchStatus.isExecuting = false }, 2000)
    dispatchRecords.unshift({ id: Date.now(), decision_time: nowIso(0), decision_mode: 'L1', recommended_opening: params.targetOpening, confidence: 100, risk_rank: 1, execution_status: 'executed', physics_validation: null })
    return delay(ok(null))
  },

  emergencyStop() {
    dispatchStatus.isExecuting = false
    dispatchStatus.mode = 'manual'
    dispatchStatus.autoLevel = 1
    dispatchStatus.gateOpening = 0
    if (simState.status === 'running') simState.status = 'paused'
    stationLive.gateOpening = 0
    simState.currentOpening = 0
    return delay(ok({ stop_log_id: Date.now(), command_id: `estop-${Date.now()}` }))
  },

  /** 全局急停 — 调度 + 仿真联动，闸门归零 */
  globalEmergencyStop() {
    dispatchStatus.isExecuting = false
    dispatchStatus.mode = 'manual'
    dispatchStatus.autoLevel = 1
    dispatchStatus.gateOpening = 0
    if (simState.status === 'running') simState.status = 'paused'
    stationLive.gateOpening = 0
    simState.currentOpening = 0
    return delay(ok({ stop_log_id: Date.now(), command_id: `estop-${Date.now()}` }))
  },

  changeMode(params: { mode: 'auto' | 'manual' }) {
    dispatchStatus.mode = params.mode
    return delay(ok(null))
  },

  changeAutoLevel(params: { level: AutoLevel }) {
    dispatchStatus.autoLevel = params.level
    return delay(ok(null))
  },

  acceptDecision() {
    dispatchStatus.gateOpening = decisionBase.recommended_opening
    dispatchRecords.unshift({ id: Date.now(), decision_time: nowIso(0), decision_mode: 'L2', recommended_opening: decisionBase.recommended_opening, confidence: decisionBase.confidence, risk_rank: decisionBase.risk_rank, execution_status: 'executed', physics_validation: null })
    return delay(ok(null))
  },

  ignoreDecision() { return delay(ok(null)) },

  getDispatchLogs(params?: { keyword?: string }) {
    let list = [...dispatchRecords]
    if (params?.keyword) {
      list = list.filter((r) => fuzzyMatch(
        params.keyword!,
        r.decision_mode,
        String(r.recommended_opening),
        r.execution_status,
        String(r.confidence),
      ))
    }
    return delay(ok({ list: list.slice(0, 20), total: list.length, pageNum: 1, pageSize: 20 }))
  },

  getRiskLevel() {
    const safe = 380.0
    const diff = Math.abs(dispatchStatus.upstreamLevel - safe)
    if (diff <= 0.5) return delay(ok({ level: 'low' as const, diff, safeMin: safe - 0.5, safeMax: safe + 0.5 }))
    if (diff <= 1.0) return delay(ok({ level: 'medium' as const, diff, safeMin: safe - 1, safeMax: safe + 1 }))
    return delay(ok({ level: 'high' as const, diff, safeMin: safe - 1, safeMax: safe + 1 }))
  },

  // 仿真
  getSimulationStatus() { return delay(ok({ ...simState, historyLevels: [...simState.historyLevels], historyFlows: [...simState.historyFlows] })) },

  startSimulation(params: SimulationStartPayload) {
    simParams = {
      scene: params.scene,
      initialLevel: params.initialLevel,
      inflowRate: params.inflowRate,
      durationMin: params.durationMin,
    }
    simSpeed = params.speed ?? 1
    const opening = Math.max(0, Math.min(100, Math.round(params.gateOpening ?? stationLive.gateOpening)))
    stationLive = {
      ...createInitialTelemetry(),
      upstreamLevel: params.initialLevel,
      inflowRate: params.inflowRate,
      gateOpening: opening,
    }
    stationLive = stepHydrology(stationLive, tick, 1, 1 / 220000)
    simState = {
      status: 'running',
      elapsedSec: 0,
      currentLevel: stationLive.upstreamLevel,
      currentDownstreamLevel: stationLive.downstreamLevel,
      currentFlow: stationLive.inflowRate,
      currentOpening: opening,
      historyLevels: [{ time: 0, value: stationLive.upstreamLevel }],
      historyFlows: [{ time: 0, value: stationLive.inflowRate }],
    }
    syncDispatchFromStation()
    return delay(ok({ runId: Date.now() }))
  },

  pauseSimulation() {
    if (simState.status !== 'running') return delay(ok(null))
    simState.status = 'paused'
    return delay(ok(null))
  },

  resumeSimulation() {
    if (simState.status !== 'paused') return delay(ok(null))
    simState.status = 'running'
    return delay(ok(null))
  },

  resetSimulation() {
    simSpeed = 1
    stationLive = createInitialTelemetry()
    simState = {
      status: 'idle',
      elapsedSec: 0,
      currentLevel: stationLive.upstreamLevel,
      currentDownstreamLevel: stationLive.downstreamLevel,
      currentFlow: stationLive.inflowRate,
      currentOpening: stationLive.gateOpening,
      historyLevels: [],
      historyFlows: [],
    }
    for (let i = 24; i >= 0; i--) {
      const lv = +(stationLive.upstreamLevel - i * 0.012 + Math.sin(i * 0.4) * 0.025).toFixed(2)
      simState.historyLevels.push({ time: i, value: lv })
      simState.historyFlows.push({ time: i, value: stationLive.inflowRate + Math.sin(i * 0.3) * 30 })
    }
    syncDispatchFromStation()
    return delay(ok(null))
  },

  /** 调节闸门开度 — 实时影响泄流量与水位 */
  setGateOpening(opening: number) {
    const v = Math.max(0, Math.min(100, Math.round(opening)))
    stationLive.gateOpening = v
    simState.currentOpening = v
    dispatchStatus.gateOpening = v
    return delay(ok(null))
  },

  emergencyStopSimulation() {
    dispatchStatus.isExecuting = false
    dispatchStatus.mode = 'manual'
    dispatchStatus.autoLevel = 1
    dispatchStatus.gateOpening = 0
    if (simState.status === 'running') simState.status = 'paused'
    stationLive.gateOpening = 0
    simState.currentOpening = 0
    return delay(ok(null))
  },

  getModelList(params?: { keyword?: string }) {
    let list = [...models]
    if (params?.keyword) {
      list = list.filter((m) => fuzzyMatch(params.keyword!, m.type, m.version, m.remark, m.status))
    }
    return delay(ok(list))
  },
  activateModel(id: number) { models.forEach((m) => { m.status = m.id === id ? 'active' : 'inactive' }); return delay(ok(null)) },
  uploadModel() { return delay(ok(models[0])) },

  startTraining() { return delay(ok({ taskId: `task-${Date.now()}` })) },
  getTrainingProgress(taskId: string): Promise<{ code: number; msg: string; data: TrainingTask; success: boolean; trace_id: string }> {
    const progress = Math.min(100, (tick % 20) * 5 + 20)
    return delay(ok({ taskId, modelId: 1, config: {}, progress, lossCurve: [{ epoch: 1, loss: 0.05 }], status: progress >= 100 ? 'completed' : 'running' }))
  },

  generateReport() { return delay(ok(reports[0])) },
  getReportList(params?: { keyword?: string }) {
    let list = [...reports]
    if (params?.keyword) {
      list = list.filter((r) => fuzzyMatch(params.keyword!, r.content, r.operatorName, r.scene, String(r.runId)))
    }
    return delay(ok({ list, total: list.length, pageNum: 1, pageSize: 10 }))
  },
  downloadReport() { return delay(new Blob(['报告内容'], { type: 'text/plain' })) },

  getFaultReviewList(params?: { keyword?: string; type?: string }) {
    let list = [...reviews]
    if (params?.type) list = list.filter((r) => r.faultType.includes(params.type!))
    if (params?.keyword) {
      list = list.filter((r) => fuzzyMatch(params.keyword!, r.faultType, r.impactScope, r.status))
    }
    return delay(ok({ list, total: list.length, pageNum: 1, pageSize: 10 }))
  },
  getFaultReviewDetail(id: number) {
    const item = reviews.find((r) => r.id === id)
    return item ? delay(ok(item)) : Promise.reject(new Error('not found'))
  },
  submitFaultConclusion(id: number, conclusion: FaultReview['conclusion']) {
    const item = reviews.find((r) => r.id === id)
    if (item) { item.conclusion = conclusion; item.reviewed = true; item.status = 'reviewed' }
    return delay(ok(null))
  },
  importToSimulation() { return delay(ok(simParams)) },
  getSimulationRuns() { return delay(ok({ list: [{ id: 101, scene: 'flood' as const, params: simParams, status: 'finished' as const, summary: reports[0].summary, createdAt: nowIso(2880) }], total: 1, pageNum: 1, pageSize: 10 })) },

  // 驾驶舱 KPI
  getCockpitKpi() {
    return delay(ok({
      station: STATION,
      upstreamLevel: dispatchStatus.upstreamLevel,
      downstreamLevel: dispatchStatus.downstreamLevel,
      flowRate: dispatchStatus.flowRate,
      gateOpening: dispatchStatus.gateOpening,
      power: Math.round(jitter(2850, 120)),
      inspectionRate: Math.round(jitter(86.5, 2)),
      assetHealth: Math.round(jitter(92, 3)),
      workOrderDone: Math.round(jitter(78, 5)),
      pendingTasks: Math.max(1, Math.round(jitter(5, 2))),
      alarmSummary: { urgent: alarmStore.filter((a) => a.level === 'URGENT' && a.status === 'pending').length, important: alarmStore.filter((a) => a.level === 'IMPORTANT' && a.status === 'pending').length, normal: alarmStore.filter((a) => a.status === 'pending' && a.level === 'NORMAL').length },
    }))
  },
}
