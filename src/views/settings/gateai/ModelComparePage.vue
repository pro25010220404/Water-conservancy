<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'
import GateAiPageShell from '../components/GateAiPageShell.vue'
import ModelMetricsPanel from '../components/ModelMetricsPanel.vue'

const error = ref<string | null>(null)
onErrorCaptured((err) => {
  error.value = String(err)
  console.error('[ModelComparePage]', err)
  return false
})
</script>

<template>
  <GateAiPageShell>
    <div v-if="error" style="padding: 40px; text-align: center; color: #999;">
      <p>模型版本对比加载失败</p>
      <p style="font-size: 12px; margin-top: 8px;">{{ error }}</p>
    </div>
    <ModelMetricsPanel v-else fixed-mode="compare" />
  </GateAiPageShell>
</template>
