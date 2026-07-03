// ============================================================
// 向家坝水电站 — 简化水文实时演算（Mock / 后端未就绪前）
// 依据：入库流量、闸门开度 → 库区水位、尾水位变化
// ============================================================
import { XIANGJIABA_HYDRO } from '@/constants/xiangjiaba'

export interface StationTelemetry {
  upstreamLevel: number
  downstreamLevel: number
  inflowRate: number
  outflowRate: number
  gateOpening: number
  updatedAt: number
}

/** 有效泄流能力 (m³/s)，与开度、水头相关 */
export function estimateSpillwayDischarge(upstreamLevel: number, gateOpeningPct: number): number {
  const opening = Math.max(0, Math.min(100, gateOpeningPct)) / 100
  if (opening < 0.02) return 80 + opening * 200
  const head = Math.max(0, upstreamLevel - XIANGJIABA_HYDRO.downstreamNormalLevel - 95)
  return opening * (900 + head * 12 + upstreamLevel * 2.5)
}

/** 日变化来水（枯汛期向家坝典型波动） */
export function diurnalInflowOffset(hour: number): number {
  return Math.sin(((hour - 8) / 24) * Math.PI * 2) * 110
}

/** 微幅自然波动（风、局部回流） */
export function naturalRipple(tick: number): number {
  return Math.sin(tick * 0.11) * 0.018 + Math.sin(tick * 0.037) * 0.012
}

function clampLevel(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * 推进一个时间步的水位状态
 * @param dtSec 步长（秒）
 * @param reservoirFactor 库容换算系数，越大水位变化越慢
 */
export function stepHydrology(
  state: StationTelemetry,
  tick: number,
  dtSec: number,
  reservoirFactor = 1 / 280000,
): StationTelemetry {
  const hour = new Date().getHours()
  const inflow = state.inflowRate + diurnalInflowOffset(hour) * 0.15
  const outflow = estimateSpillwayDischarge(state.upstreamLevel, state.gateOpening)
  const net = inflow - outflow
  const dUpstream = net * reservoirFactor * dtSec + naturalRipple(tick)

  const upstreamLevel = +clampLevel(
    state.upstreamLevel + dUpstream,
    XIANGJIABA_HYDRO.deadLevel + 0.15,
    XIANGJIABA_HYDRO.crestElevation - 0.25,
  ).toFixed(2)

  const tailBase = XIANGJIABA_HYDRO.downstreamNormalLevel
  const dDownstream = (outflow - 900) * 0.000018 * dtSec + Math.sin(tick * 0.06) * 0.008
  const downstreamLevel = +clampLevel(
    state.downstreamLevel + dDownstream,
    tailBase - 0.35,
    tailBase + 1.2,
  ).toFixed(2)

  return {
    upstreamLevel,
    downstreamLevel,
    inflowRate: Math.round(inflow),
    outflowRate: Math.round(outflow),
    gateOpening: state.gateOpening,
    updatedAt: Date.now(),
  }
}

/** 初始运行态（略高于正常蓄水，符合汛期向家坝公开数据量级） */
export function createInitialTelemetry(): StationTelemetry {
  return {
    upstreamLevel: 380.38,
    downstreamLevel: XIANGJIABA_HYDRO.downstreamNormalLevel,
    inflowRate: XIANGJIABA_HYDRO.normalInflow,
    outflowRate: estimateSpillwayDischarge(380.38, 45),
    gateOpening: 45,
    updatedAt: Date.now(),
  }
}
