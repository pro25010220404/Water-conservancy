// ============================================================
// 告警管理 — WebSocket 实时通知 Composable
// 依据：《水电站闸门智能调度系统-详细需求报告》§2.7
// ============================================================
import { ref } from 'vue'
import { ElNotification, ElMessage } from 'element-plus'
import type { AlarmPushMessage, AlarmRecord } from '@/types/alarm'
import { ALARM_LEVEL_MAP, ALARM_TYPE_MAP } from '@/constants/alarm'

/** 未处理告警数量（全局共享，供侧边栏角标使用） */
export const pendingAlarmCount = ref(0)

/** 是否有声音提示（本地设置） */
const soundEnabled = ref(localStorage.getItem('alarmSound') !== 'off')

import { playAlarmSound } from '@/utils/alarmSound'

// ---------- 弹窗通知 ----------
function showAlarmNotification(alarm: AlarmRecord) {
  const levelInfo = ALARM_LEVEL_MAP[alarm.level]
  const typeLabel = ALARM_TYPE_MAP[alarm.type]?.label ?? alarm.type
  ElNotification({
    title: `【${levelInfo?.label ?? alarm.level}】${typeLabel}`,
    message: alarm.content,
    type: alarm.level === 'URGENT' ? 'error' : alarm.level === 'IMPORTANT' ? 'warning' : 'info',
    duration: alarm.level === 'URGENT' ? 0 : 6000,
    position: 'top-right',
    customClass: 'alarm-notify alarm-notify--center',
  })
}

// ---------- 切换声音 ----------
export function useAlarmNotify() {
  function toggleSound() {
    soundEnabled.value = !soundEnabled.value
    localStorage.setItem('alarmSound', soundEnabled.value ? 'on' : 'off')
  }

  function handlePushMessage(msg: AlarmPushMessage) {
    if (msg.type === 'alarm_new') {
      pendingAlarmCount.value = msg.pendingCount
      showAlarmNotification(msg.data)
      if (soundEnabled.value) playAlarmSound()
    }
  }

  // Websocket 连接由 useWebSocket composable 统一管理
  // 此处仅暴露处理逻辑供页面调用

  return {
    pendingAlarmCount,
    soundEnabled,
    toggleSound,
    handlePushMessage,
  }
}
