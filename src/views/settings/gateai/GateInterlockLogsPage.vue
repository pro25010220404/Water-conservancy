<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import GateAiPageShell from '../components/GateAiPageShell.vue'
import GateInterlockPanel from '../components/GateInterlockPanel.vue'

const error = ref<string | null>(null)
onErrorCaptured((err) => {
  error.value = String(err)
  console.error('[GateInterlockLogsPage]', err)
  return false
})
</script>

<template>
  <GateAiPageShell>
    <div v-if="error" style="padding: 40px; text-align: center; color: #999;">
      <p>互锁触发日志加载失败</p>
      <p style="font-size: 12px; margin-top: 8px;">{{ error }}</p>
    </div>
    <GateInterlockPanel v-else fixed-view="logs" standalone />
  </GateAiPageShell>
</template>
