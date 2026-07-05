<script setup lang="ts">
// ============================================================
// 安防检测 — 多路摄像头：主画面 + 缩略图切换 + 截图/全屏 + 告警联动
// ============================================================
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElNotification } from 'element-plus'
import { pendingAlarmCount } from '@/composables/useAlarmNotify'

// ── USB 摄像头 ──
const usbStream = ref<MediaStream | null>(null)
const usbConnected = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)

onMounted(async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasVideo = devices.some((d) => d.kind === 'videoinput')
    if (hasVideo) await startUSBCamera()
  } catch { /* 静默失败 */ }
})

async function startUSBCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    usbStream.value = stream
    usbConnected.value = true
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      videoRef.value.play().catch(() => {})
    }
  } catch {
    usbConnected.value = false
  }
}

onUnmounted(() => {
  usbStream.value?.getTracks().forEach((t) => t.stop())
})

// ── 摄像头数据 ──
interface CameraDef {
  id: string
  name: string
  area: string
  status: 'online' | 'offline'
  motion: string
  alarmZone: string
}

const cameras: CameraDef[] = [
  { id: 'c1', name: '坝顶 1#', area: '坝顶', status: 'online', motion: '2分钟前', alarmZone: '坝顶' },
  { id: 'c2', name: '坝顶 2#', area: '坝顶', status: 'online', motion: '刚刚', alarmZone: '坝顶' },
  { id: 'c3', name: '厂房入口', area: '厂房', status: 'online', motion: '5分钟前', alarmZone: '厂房' },
  { id: 'c4', name: '中控室', area: '厂房', status: 'online', motion: '—', alarmZone: '中控室' },
  { id: 'c5', name: '下游河道', area: '下游', status: 'offline', motion: '—', alarmZone: '下游' },
  { id: 'c6', name: '开关站', area: '下游', status: 'online', motion: '1小时前', alarmZone: '开关站' },
]

const ALARM_ZONE_TO_CAMERA: Record<string, string> = {
  坝顶: 'c1', 厂房: 'c3', 中控室: 'c4', 下游: 'c5', 开关站: 'c6',
}

// ── 门禁 / 巡检 / 告警 ──
interface DoorDef { id: string; name: string; status: 'locked' | 'unlocked'; last: string }
interface PatrolDef { time: string; route: string; person: string; result: string; dur: string }
interface AlarmDef { time: string; loc: string; type: string; level: 'warning' | 'critical'; status: string }

const doors: DoorDef[] = [
  { id: 'd1', name: '主厂房大门', status: 'locked', last: '14:25 张工' },
  { id: 'd2', name: '中控室', status: 'locked', last: '14:10 李工' },
  { id: 'd3', name: 'GIS 室', status: 'locked', last: '—' },
  { id: 'd4', name: '坝顶通道', status: 'unlocked', last: '13:50 巡检员' },
]

const patrols: PatrolDef[] = [
  { time: '09:30', route: '坝顶 → 厂房 → 下游', person: '王巡检', result: '正常', dur: '45分钟' },
  { time: '14:00', route: 'GIS室 → 开关站 → 中控', person: '赵巡检', result: '正常', dur: '38分钟' },
  { time: '18:30', route: '坝顶 → 下游河道 → 厂房', person: '王巡检', result: '待执行', dur: '—' },
]

const alarms = ref<AlarmDef[]>([
  { time: '12:05', loc: '下游河道', type: '周界入侵', level: 'warning', status: '已处理' },
  { time: '08:22', loc: '开关站', type: '门禁异常', level: 'critical', status: '已处理' },
])

// ── 主画面切换：点击缩略图 → 大画面显示该摄像头 ──
const activeCamId = ref('c1')
const activeCamera = computed(() => cameras.find((c) => c.id === activeCamId.value) ?? cameras[0])

function switchCamera(camId: string) {
  activeCamId.value = camId
  if (alarmFlashTimer) { clearInterval(alarmFlashTimer); alarmFlashTimer = null }
  alarmSwitchedCamera.value = null
  alarmFlashActive.value = false
}

// Tab 键循环切换摄像头
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const idx = cameras.findIndex((c) => c.id === activeCamId.value)
    if (e.shiftKey) {
      // Shift+Tab → 上一个
      const prev = idx <= 0 ? cameras.length - 1 : idx - 1
      switchCamera(cameras[prev].id)
    } else {
      // Tab → 下一个（循环）
      const next = idx >= cameras.length - 1 ? 0 : idx + 1
      switchCamera(cameras[next].id)
    }
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// 切回 c1 时重新挂载视频流
watch(activeCamId, (id) => {
  if (id === 'c1' && usbConnected.value && usbStream.value && videoRef.value) {
    if (videoRef.value.srcObject !== usbStream.value) {
      videoRef.value.srcObject = usbStream.value
      videoRef.value.play().catch(() => {})
    }
  }
})

// ── 全屏 ──
const mainViewRef = ref<HTMLDivElement | null>(null)
const isFullscreen = ref(false)

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

async function toggleFullscreen() {
  if (!mainViewRef.value) return
  try {
    if (!document.fullscreenElement) {
      await mainViewRef.value.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  } catch { /* 不支持 */ }
}

// ── 截图 ──
function captureScreenshot() {
  // 优先截取真实视频画面
  if (activeCamId.value === 'c1' && usbConnected.value && videoRef.value) {
    const video = videoRef.value
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 叠加信息条
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, 0, canvas.width, 28)
    ctx.fillStyle = '#fff'
    ctx.font = '13px sans-serif'
    ctx.fillText(
      `${activeCamera.value.name}  ${new Date().toLocaleString('zh-CN')}`,
      10, 19,
    )

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `screenshot-${activeCamera.value.id}-${Date.now()}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
    return
  }

  // 无视频信号时不截图
  if (activeCamera.value.status === 'offline') return

  // 无实时视频时截取占位画面
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 400
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(canvas.width / 2 - 24, canvas.height / 2 - 28, 48, 56)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, canvas.width, 32)
  ctx.fillStyle = '#fff'
  ctx.font = '14px sans-serif'
  ctx.fillText(`${activeCamera.value.name}  ${new Date().toLocaleString('zh-CN')}`, 14, 22)

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screenshot-${activeCamera.value.id}-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// ── 告警联动 ──
const alarmSwitchedCamera = ref<string | null>(null)
const alarmFlashActive = ref(false)
let alarmFlashTimer: ReturnType<typeof setInterval> | null = null
let alarmScenarioIdx = 0

const SIMULATED_SCENARIOS = [
  { location: '下游河道', type: '周界入侵', level: 'warning' as const },
  { location: '开关站', type: '门禁异常', level: 'critical' as const },
  { location: '中控室', type: '设备离线', level: 'warning' as const },
  { location: '坝顶', type: '人员聚集', level: 'critical' as const },
  { location: '厂房', type: '火警', level: 'critical' as const },
  { location: '下游', type: '非法闯入', level: 'warning' as const },
]

function simulateAlarm() {
  const scenario = SIMULATED_SCENARIOS[alarmScenarioIdx % SIMULATED_SCENARIOS.length]
  alarmScenarioIdx++

  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  alarms.value.unshift({
    time, loc: scenario.location, type: scenario.type,
    level: scenario.level, status: '待处理',
  })

  pendingAlarmCount.value++

  ElNotification({
    title: `【${scenario.level === 'critical' ? '严重' : '警告'}】${scenario.type}`,
    message: `${scenario.location} 触发告警，已自动切换摄像头`,
    type: scenario.level === 'critical' ? 'error' : 'warning',
    duration: 5000, position: 'top-right',
  })

  const cameraId = ALARM_ZONE_TO_CAMERA[scenario.location]
  if (cameraId) triggerAlarmSwitch(cameraId)
}

function triggerAlarmSwitch(cameraId: string) {
  const idx = cameras.findIndex((c) => c.id === cameraId)
  if (idx === -1) return

  activeCamId.value = cameraId
  alarmSwitchedCamera.value = cameraId

  let flashes = 0
  alarmFlashActive.value = true
  if (alarmFlashTimer) clearInterval(alarmFlashTimer)
  alarmFlashTimer = setInterval(() => {
    alarmFlashActive.value = !alarmFlashActive.value
    flashes++
    if (flashes >= 6) {
      clearInterval(alarmFlashTimer!)
      alarmFlashTimer = null
      alarmFlashActive.value = false
      alarmSwitchedCamera.value = null
    }
  }, 250)
}

// ── 模拟时间戳更新 ──
const simTime = ref('')
let simTimer: ReturnType<typeof setInterval>
onMounted(() => {
  simTimer = setInterval(() => {
    const d = new Date()
    simTime.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  }, 1000)
})
onUnmounted(() => clearInterval(simTimer))

// ── 状态映射 ──
const sc: Record<string, { color: string; label: string }> = {
  online: { color: '#22c55e', label: '在线' },
  offline: { color: '#94a3b8', label: '离线' },
  locked: { color: '#22c55e', label: '已锁' },
  unlocked: { color: '#f59e0b', label: '未锁' },
}
const alc: Record<string, string> = { warning: '#f59e0b', critical: '#ef4444' }
</script>

<template>
  <div class="sp">
    <!-- KPI 行 -->
    <div class="kpis">
      <div class="kpi">
        <span class="kpi__d" style="background:#3b82f6" />
        <span class="kpi__l">摄像头</span>
        <span class="kpi__v">{{ cameras.filter(c => c.status === 'online').length }}<small> / {{ cameras.length }}</small></span>
      </div>
      <div class="kpi">
        <span class="kpi__d" style="background:#22c55e" />
        <span class="kpi__l">门禁正常</span>
        <span class="kpi__v">{{ doors.filter(d => d.status === 'locked').length }}<small> / {{ doors.length }}</small></span>
      </div>
      <div class="kpi">
        <span class="kpi__d" style="background:#22c55e" />
        <span class="kpi__l">巡检完成</span>
        <span class="kpi__v">{{ patrols.filter(p => p.result === '正常').length }}<small> / {{ patrols.length }}</small></span>
      </div>
      <div class="kpi">
        <span class="kpi__d" style="background:#d1d5db" />
        <span class="kpi__l">今日告警</span>
        <span class="kpi__v">{{ alarms.length }}<small> 条</small></span>
      </div>
    </div>

    <!-- 主体 -->
    <div class="main">
      <!-- 左：摄像头区域 -->
      <div class="cam-section">
        <!-- Tab 栏 — 循环切换摄像头 -->
        <div class="cam-tabs">
          <button
            v-for="c in cameras"
            :key="c.id"
            class="cam-tab"
            :class="{ active: activeCamId === c.id }"
            @click="switchCamera(c.id)"
          >
            <span class="cam-tab__dot" :style="{ background: sc[c.status].color }" />
            {{ c.name }}
            <span class="cam-tab__area">{{ c.area }}</span>
          </button>
        </div>

        <!-- 主画面 — 占满剩余空间 -->
        <div
          ref="mainViewRef"
          class="cam-main"
          :class="{ 'cam-main--fs': isFullscreen }"
        >
          <!-- USB 实时视频 -->
          <video
            v-show="activeCamId === 'c1' && usbConnected"
            ref="videoRef"
            autoplay muted playsinline
            class="cam-main__vid"
          />

          <!-- 无信号占位 -->
          <div
            v-show="!(activeCamId === 'c1' && usbConnected)"
            class="cam-main__placeholder"
          >
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" opacity="0.12">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" />
            </svg>
            <span>{{ activeCamera.status === 'offline' ? '设备离线' : '无视频信号' }}</span>
          </div>

          <!-- 叠加信息 -->
          <div class="cam-main__ol">
            <span>{{ activeCamera.area }} · {{ activeCamera.name }}</span>
            <span class="cam-main__ol-time">{{ simTime }}</span>
            <span :class="activeCamera.status">{{ sc[activeCamera.status].label }}</span>
          </div>

          <!-- 工具栏 -->
          <div class="cam-toolbar">
            <button class="cam-toolbar__btn" title="截图" @click="captureScreenshot">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <button class="cam-toolbar__btn" :title="isFullscreen ? '退出全屏' : '全屏'" @click="toggleFullscreen">
              <svg v-if="!isFullscreen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="4 8 4 3 9 3" /><polyline points="20 16 20 21 15 21" />
                <line x1="4" y1="3" x2="10" y2="9" /><line x1="20" y1="21" x2="14" y2="15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 右面板 -->
      <div class="right">
        <div class="pn">
          <div class="pn__t">门禁状态</div>
          <div v-for="d in doors" :key="d.id" class="dr">
            <span class="dr__d" :style="{ background: sc[d.status].color }" />
            <span class="dr__n">{{ d.name }}</span>
            <span class="dr__s" :style="{ color: sc[d.status].color }">{{ sc[d.status].label }}</span>
            <span class="dr__l">{{ d.last }}</span>
          </div>
        </div>

        <div class="pn">
          <div class="pn__t">巡检记录</div>
          <div v-for="p in patrols" :key="p.time" class="pr" :class="{ pen: p.result === '待执行' }">
            <span class="pr__t">{{ p.time }}</span>
            <span class="pr__r">{{ p.route }}</span>
            <span>{{ p.person }}</span>
            <span :style="{ color: p.result === '正常' ? '#22c55e' : p.result === '待执行' ? '#f59e0b' : '#6b7280' }">
              {{ p.result }}
            </span>
          </div>
        </div>

        <div class="pn">
          <div class="pn__t">
            最近告警
            <button class="alarm-sim-btn" @click="simulateAlarm">模拟告警</button>
          </div>
          <div v-for="a in alarms" :key="a.time" class="al">
            <span class="al__d" :style="{ background: alc[a.level] }" />
            <div>
              <div class="al__h"><b>{{ a.loc }}</b> · {{ a.type }}</div>
              <div class="al__f">{{ a.time }} · {{ a.status }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sp {
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
  overflow: hidden;
}

.kpis {
  display: flex;
  gap: 0;
  padding: 0 28px;
  background: #fff;
  border-bottom: 1px solid #eef0f2;
  flex-shrink: 0;
}

.kpi {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
}

.kpi__d { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.kpi__l { font-size: 14px; color: #8b9198; }
.kpi__v {
  margin-left: auto; font-size: 20px; font-weight: 700; color: #1e293b;
  font-family: 'SF Mono', monospace;
  small { margin-left: 4px; font-size: 12px; font-weight: 400; color: #94a3b8; }
}

.main {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px 28px;
  min-height: 0;
  overflow: hidden;
}

.cam-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 0;
}

// ── Tab 栏 ──
.cam-tabs {
  display: flex;
  gap: 0;
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px 8px 0 0;
  border: 1px solid #eef0f2;
  border-bottom: none;
  overflow: hidden;
}

.cam-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  background: #f8fafc;
  border: none;
  border-right: 1px solid #eef0f2;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;

  &:last-child { border-right: none; }

  &:hover {
    color: #1e293b;
    background: #f1f5f9;
  }

  &.active {
    color: #fff;
    background: #3b82f6;
    font-weight: 600;

    .cam-tab__area {
      color: rgba(255,255,255,.7);
    }
  }
}

.cam-tab__dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cam-tab__area {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 400;
}

// ── 主画面 ──
.cam-main {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  background: #0f172a;
  border-radius: 0 0 8px 8px;
  overflow: hidden;

  &--fs {
    position: fixed; inset: 0; z-index: 9999; border-radius: 0; background: #000;
  }
}

.cam-main__vid {
  width: 100%; height: 100%; object-fit: contain;
}

.cam-main__placeholder {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
  color: rgba(255,255,255,.08);

  span {
    font-size: 15px;
    color: rgba(255,255,255,.25);
    font-weight: 500;
  }
}

.cam-main__ol {
  position: absolute; top: 0; left: 0; right: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 16px;
  pointer-events: none; z-index: 2;

  span:first-child {
    padding: 4px 12px; font-size: 14px; font-weight: 500;
    color: rgba(255,255,255,.75);
    background: rgba(0,0,0,.55); border-radius: 4px;
  }
  .cam-main__ol-time {
    margin-left: auto; font-size: 14px;
    font-family: 'SF Mono', monospace; color: rgba(255,255,255,.5);
  }
  span:last-child {
    padding: 4px 12px; font-size: 13px; font-weight: 600;
    background: rgba(0,0,0,.55); border-radius: 4px;
    &.online { color: #22c55e; }
    &.offline { color: #94a3b8; }
  }
}

.cam-toolbar {
  position: absolute; top: 10px; right: 10px; z-index: 10;
  display: flex; gap: 6px;
}

.cam-toolbar__btn {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,.7); background: rgba(0,0,0,.5);
  border: none; border-radius: 6px; cursor: pointer;
  transition: all 0.15s;
  &:hover { background: rgba(0,0,0,.75); color: #fff; }
  &:disabled { opacity: .3; cursor: default; }
}

// ── 右面板 ──
.right {
  width: 380px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 14px;
  overflow-y: auto;
}

.pn {
  padding: 16px 18px; background: #fff;
  border: 1px solid #eef0f2; border-radius: 8px;
}

.pn__t {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px; font-size: 15px; font-weight: 600; color: #1e293b;
}

.alarm-sim-btn {
  padding: 4px 14px; font-size: 12px; font-weight: 500; color: #fff;
  background: #ef4444; border: none; border-radius: 5px; cursor: pointer;
  &:hover { background: #dc2626; }
}

.dr {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 0; font-size: 14px; line-height: 1.45;
  & + & { border-top: 1px solid #f1f5f9; }
}
.dr__d { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dr__n { flex: 1; font-weight: 500; color: #1e293b; }
.dr__s { font-size: 13px; font-weight: 600; }
.dr__l { font-size: 13px; color: #64748b; }

.pr {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 0; font-size: 14px; line-height: 1.45; color: #475569;
  & + & { border-top: 1px solid #f1f5f9; }
  &.pen { opacity: .55; }
}
.pr__t { min-width: 48px; flex-shrink: 0; font-size: 13px; font-family: 'SF Mono', monospace; color: #64748b; }
.pr__r { flex: 1; min-width: 0; overflow: hidden; font-weight: 500; color: #1e293b; text-overflow: ellipsis; white-space: nowrap; }

.al {
  display: flex; gap: 10px; padding: 10px 0; line-height: 1.45;
  & + & { border-top: 1px solid #f1f5f9; }
}
.al__d { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; flex-shrink: 0; }
.al__h { font-size: 14px; color: #1e293b; b { font-weight: 600; } }
.al__f { margin-top: 4px; font-size: 13px; color: #64748b; }
</style>

<style lang="scss">
.main-layout__content:has(.sp) {
  padding: 0 !important;
  overflow: hidden !important;
}
</style>
