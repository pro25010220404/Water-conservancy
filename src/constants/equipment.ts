// ============================================================
// 设备管理 — 字典常量
// ============================================================
import type { DictMap } from '@/shared/types'

// ---------- 设备类型 ----------
export const EQUIPMENT_TYPE: DictMap = {
  level_sensor: { label: '超声波液位计', value: 'level_sensor', color: 'blue' },
  flow_sensor: { label: '超声波流量计', value: 'flow_sensor', color: 'cyan' },
  plc: { label: 'PLC', value: 'plc', color: 'orange' },
  edge_gateway: { label: '边缘网关', value: 'edge_gateway', color: 'purple' },
  actuator: { label: '执行器', value: 'actuator', color: 'green' },
}

/** 设备类型筛选下拉选项 */
export const EQUIPMENT_TYPE_OPTIONS = Object.values(EQUIPMENT_TYPE).map((d) => ({
  label: d.label,
  value: d.value,
}))

// ---------- 设备状态 ----------
export const EQUIPMENT_STATUS: DictMap = {
  online: { label: '在线', value: 'online', color: 'green' },
  offline: { label: '离线', value: 'offline', color: 'red' },
  fault: { label: '故障', value: 'fault', color: 'orange' },
  maintenance: { label: '维护中', value: 'maintenance', color: 'blue' },
}

/** 设备状态筛选下拉选项 */
export const EQUIPMENT_STATUS_OPTIONS = Object.values(EQUIPMENT_STATUS).map((d) => ({
  label: d.label,
  value: d.value,
}))

// ---------- 14 种硬件设备名称映射（特殊设备使用） ----------
export const HARDWARE_MODEL_MAP: Record<string, string> = {
  level_sensor: '超声波液位计 ×2',
  flow_sensor: '超声波流量计',
  actuator: '电动推杆',
  plc: 'PLC S7-200',
  plc_analog: 'PLC 模拟量模块',
  edge_gateway: 'Jetson Orin Nano + 触摸屏',
  ups: '24V 电源',
  water_pump: '水泵',
  usb_rs485: 'USB 转 RS485',
  basin: '折叠蓄水池',
  step_down: '降压模块',
  quick_connector: '快速接头',
  silicone_hose: '硅胶软管',
  gate_board: '亚克力闸门板 ×2',
}

// ---------- 心跳配置 ----------
export const HEARTBEAT_INTERVAL = 5 // 秒
export const HEARTBEAT_TIMEOUT = 30 // 秒（超时判定离线）
