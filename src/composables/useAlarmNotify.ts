// ============================================================
// 告警管理 — WebSocket 实时通知 Composable
// 依据：《水电站闸门智能调度系统-详细需求报告》§2.7
// ============================================================
import { ref } from 'vue'
import { ElNotification } from 'element-plus'
import type { AlarmPushMessage, AlarmRecord } from '@/types/alarm'
import { ALARM_LEVEL_MAP, ALARM_TYPE_MAP } from '@/constants/alarm'

/** 未处理告警数量（全局共享，供侧边栏角标使用） */
export const pendingAlarmCount = ref(0)

/** 是否有声音提示（本地设置） */
const soundEnabled = ref(localStorage.getItem('alarmSound') !== 'off')

// ---------- 音频上下文（惰性初始化） ----------
let audioCtx: AudioContext | null = null

function playBeep() {
  if (!soundEnabled.value) return
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.value = 0.15
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
    osc.stop(audioCtx.currentTime + 0.3)
  } catch {
    // 忽略自动播放策略限制
  }
}

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
    customClass: 'alarm-notify',
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
      playBeep()
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
