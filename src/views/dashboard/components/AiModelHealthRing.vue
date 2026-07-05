<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { fetchModelHealthOverview } from '@/api/gateaiSettings'
import type { ModelHealthOverviewItem } from '@/types/gateai'

use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const GRADE_COLOR: Record<string, string> = { S: '#16a34a', A: '#22c55e', B: '#f59e0b', C: '#f97316', D: '#dc2626' }

const items = ref<ModelHealthOverviewItem[]>([])

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item', formatter: '{b}: {c}分 ({d}%)' },
  legend: { bottom: 0, textStyle: { fontSize: 11 } },
  series: [{
    type: 'pie',
    radius: ['42%', '68%'],
    center: ['50%', '45%'],
    label: { formatter: '{b}\n{c}分', fontSize: 11 },
    data: items.value.map((h) => ({
      name: h.reservoir_name,
      value: +(h.overall_score * 100).toFixed(0),
      itemStyle: { color: GRADE_COLOR[h.health_grade] },
    })),
  }],
}))

onMounted(async () => {
  items.value = await fetchModelHealthOverview()
})
</script>

<template>
  <div class="ai-health-ring">
    <h3>AI 模型状态</h3>
    <VChart v-if="items.length" :option="chartOption" autoresize style="height:200px;width:100%" />
    <div class="ai-health-ring__legend">
      <span v-for="h in items" :key="h.reservoir_id">
        <i :style="{ background: GRADE_COLOR[h.health_grade] }" />{{ h.reservoir_name }} {{ h.health_grade }}
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ai-health-ring {
  padding: 16px; background: #fff; border-radius: 10px; border: 1px solid #eef0f2;
  h3 { margin: 0 0 8px; font-size: 15px; color: #334155; }
  &__legend {
    display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; font-size: 12px; color: #64748b;
    i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
  }
}
</style>
