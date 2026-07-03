<script setup lang="ts">
import { ref } from 'vue'
import { ElContainer, ElAside, ElMain } from 'element-plus'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import { useVoiceAssistant } from '@/composables/useVoiceAssistant'
import { useDraggable } from '@vueuse/core'

const collapsed = ref(false)
const { listening, transcript, feedback, start: startVoice, stop: stopVoice } = useVoiceAssistant()

// 拖动 + 点击区分
const btnEl = ref<HTMLElement | null>(null)
const startPos = ref({ x: 0, y: 0 })
const wasDragged = ref(false)

const { x, y, style: dragStyle } = useDraggable(btnEl, {
  initialValue: { x: window.innerWidth - 76, y: window.innerHeight - 120 },
  onStart(pos) { startPos.value = { x: pos.x, y: pos.y }; wasDragged.value = false },
  onMove(pos) { if (Math.abs(pos.x - startPos.value.x) > 3 || Math.abs(pos.y - startPos.value.y) > 3) wasDragged.value = true },
  onEnd(pos) {
    const snapX = pos.x > window.innerWidth / 2 ? window.innerWidth - 76 : 28
    x.value = snapX
    y.value = Math.max(12, Math.min(window.innerHeight - 120, pos.y))
  },
})

function handleVA() {
  if (wasDragged.value) return
  listening.value ? stopVoice() : startVoice()
}
</script>

<template>
  <el-container class="main-layout">
    <el-aside :width="collapsed ? '64px' : 'var(--sider-width)'" class="main-layout__aside">
      <AppSidebar :collapsed="collapsed" />
    </el-aside>
    <el-container direction="vertical" class="main-layout__body">
      <AppHeader :collapsed="collapsed" @toggle-collapse="collapsed = !collapsed" />
      <el-main class="main-layout__content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>

  <!-- 语音助手浮动按钮 -->
  <div ref="btnEl" class="voice-btn" :class="{on:listening}" @pointerup="handleVA"
    :style="dragStyle"
    :title="listening?'点击关闭 · 可拖动':'语音助手 · 可拖动'">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  </div>
  <Transition name="fade">
    <div v-if="transcript || feedback" class="voice-pop" :style="{ left: x + 'px', top: (y - 8) + 'px', transform: 'translate(-50%, -100%)' }">
      <div v-if="transcript" class="voice-pop__in">你说：{{ transcript }}</div>
      <div v-if="feedback" class="voice-pop__out">{{ feedback }}</div>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.main-layout {
  height: 100vh;
  &__aside { overflow: hidden; transition: width 0.3s; }
  &__body { min-width: 0; }
  &__content { background: var(--color-bg-dark); padding: var(--spacing-lg); overflow-y: auto; }
}
</style>

<style lang="scss">
.voice-btn {
  position: fixed; z-index: 9999; touch-action: none; user-select: none; -webkit-user-select: none;
  width: 48px; height: 48px; border-radius: 50%; background: #fff;
  border: 1.5px solid #e5e7eb; box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  display: flex; align-items: center; justify-content: center; cursor: grab;
  color: #64748b;
  &:active { cursor: grabbing; }
  &:hover { box-shadow: 0 4px 20px rgba(59,130,246,0.12); border-color: #93c5fd; color: #3b82f6; }
  &.on { background: #3b82f6; border-color: #3b82f6; color: #fff; animation: vp 1.5s infinite; }
  svg { pointer-events: none; }
}
@keyframes vp { 0%,100%{box-shadow:0 0 4px rgba(59,130,246,0.3)} 50%{box-shadow:0 0 20px rgba(59,130,246,0.6)} }

.voice-pop {
  position: fixed; z-index: 9998;
  max-width: 300px; display: flex; flex-direction: column; gap: 6px;
  pointer-events: none;
}
.voice-pop__in, .voice-pop__out {
  padding: 8px 14px; border-radius: 10px; font-size: 12px;
  background: rgba(255,255,255,0.95); border: 1px solid #e5e7eb;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04); color: #374151;
}
.voice-pop__out { color: #3b82f6; border-color: #bfdbfe; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
