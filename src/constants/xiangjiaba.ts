// ============================================================
// 向家坝水电站 — 真实水文特征值（公开资料）
// ============================================================

/** 向家坝水电站关键高程与流量特征（单位：m / m³/s） */
export const XIANGJIABA_HYDRO = {
  /** 电站名称 */
  name: '向家坝水电站',
  /** 坝顶高程 */
  crestElevation: 384,
  /** 正常蓄水位 */
  normalPoolLevel: 380,
  /** 主汛期汛限水位（5–9 月） */
  floodLimitLevel: 380,
  /** 非主汛期汛限水位 */
  floodLimitLevelOffSeason: 375,
  /** 死水位 */
  deadLevel: 374,
  /** 设计洪水位 */
  designFloodLevel: 382.31,
  /** 预警水位（调度系统阈值） */
  warningLevel: 381.5,
  /** 下游尾水位（常年均值参考） */
  downstreamNormalLevel: 278.42,
  /** 额定入库流量参考 */
  normalInflow: 1850,
  /** 装机所在河流 */
  river: '金沙江',
} as const

/** 将实际上游水位 (m) 映射到 3D 场景水面高度 */
export function upstreamLevelToSceneY(level: number, damVisualHeight = 28): number {
  const { deadLevel, crestElevation } = XIANGJIABA_HYDRO
  const t = Math.max(0, Math.min(1, (level - deadLevel) / (crestElevation - deadLevel)))
  return 1.5 + t * (damVisualHeight * 0.82)
}

/** 水位相对特征值的差值描述 */
export function getLevelStatus(level: number): { label: string; color: string } {
  const h = XIANGJIABA_HYDRO
  if (level >= h.warningLevel) return { label: '超预警', color: '#ff4757' }
  if (level >= h.floodLimitLevel) return { label: '达汛限', color: '#ffa502' }
  if (level >= h.normalPoolLevel - 0.3) return { label: '正常蓄水', color: '#2ed573' }
  if (level <= h.deadLevel + 0.5) return { label: '接近死水位', color: '#3b82f6' }
  return { label: '偏低运行', color: '#70a1ff' }
}

/** 水位在特征标尺上的百分比位置 (0–100) */
export function levelGaugePercent(level: number): number {
  const { deadLevel, crestElevation } = XIANGJIABA_HYDRO
  return Math.max(0, Math.min(100, ((level - deadLevel) / (crestElevation - deadLevel)) * 100))
}
