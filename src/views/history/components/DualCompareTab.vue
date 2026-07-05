<script setup lang="ts">
import { ref, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

// 时段 A / B
const rangeA = ref({ start: '', end: '' })
const rangeB = ref({ start: '', end: '' })
const compareMode = ref(false)
const queried = ref(false)

// 生成模拟数据
function genData(baseTime: number, color: string) {
  const arr = []
  for (let i = 0; i < 48; i++) {
    arr.push({
      time: baseTime + i * 3600000,
      label: new Date(baseTime + i * 3600000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit' }),
      level: +(378.5 + Math.sin(i / 8) * 1.2 + (Math.random() - 0.5) * 0.3).toFixed(2),
      flow: Math.round(6350 + Math.sin(i / 6) * 800 + (Math.random() - 0.5) * 200),
    })
  }
  return arr
}

const dataA = ref<any[]>([])
const dataB = ref<any[]>([])

function doQuery() {
  const now = Date.now()
  const startA = rangeA.value.start ? new Date(rangeA.value.start).getTime() : now - 7 * 86400000
  const startB = rangeB.value.start ? new Date(rangeB.value.start).getTime() : now - 30 * 86400000
  dataA.value = genData(startA, '#1890ff')
  dataB.value = genData(startB, '#ff7f0e')
  compareMode.value = true
  queried.value = true
}

// 差异统计
const diffStats = computed(() => {
  if (!dataA.value.length || !dataB.value.length) return null
  const len = Math.min(dataA.value.length, dataB.value.length)
  let maxDiff = 0, sumDiff = 0
  for (let i = 0; i < len; i++) {
    const d = Math.abs(dataA.value[i].level - dataB.value[i].level)
    if (d > maxDiff) maxDiff = d
    sumDiff += d
  }
  return { maxDiff: +maxDiff.toFixed(2), avgDiff: +(sumDiff / len).toFixed(2), pct: +((sumDiff / len) / 378.5 * 100).toFixed(1) }
})

// 图表
const chartOpt = computed(() => {
  const allLabels = dataA.value.map((d, i) => (dataB.value[i] || d).label)
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['时段A 水位', '时段A 流量', '时段B 水位', '时段B 流量'], top: 0 },
    grid: { left: 60, right: 60, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: allLabels, axisLabel: { interval: 5 } },
    yAxis: [
      { type: 'value', name: '水位(m)' },
      { type: 'value', name: '流量(m³/s)' },
    ],
    dataZoom: [{ type: 'slider', bottom: 0, height: 22 }],
    series: [
      { name: '时段A 水位', type: 'line', data: dataA.value.map(d => d.level), smooth: true, lineStyle: { color: '#1890ff', width: 2 }, itemStyle: { color: '#1890ff' }, symbol: 'none' },
      { name: '时段A 流量', type: 'line', data: dataA.value.map(d => d.flow), smooth: true, yAxisIndex: 1, lineStyle: { color: '#91caff' }, itemStyle: { color: '#91caff' }, symbol: 'none' },
      { name: '时段B 水位', type: 'line', data: dataB.value.map(d => d.level), smooth: true, lineStyle: { color: '#ff7f0e', width: 2, type: 'dashed' }, itemStyle: { color: '#ff7f0e' }, symbol: 'none' },
      { name: '时段B 流量', type: 'line', data: dataB.value.map(d => d.flow), smooth: true, yAxisIndex: 1, lineStyle: { color: '#ffbb78', type: 'dashed' }, itemStyle: { color: '#ffbb78' }, symbol: 'none' },
    ],
  }
})

function doExport() {
  const rows = [['时间', 'A水位', 'A流量', 'B水位', 'B流量']]
  const len = Math.max(dataA.value.length, dataB.value.length)
  for (let i = 0; i < len; i++) {
    rows.push([
      dataA.value[i]?.label ?? '',
      dataA.value[i]?.level ?? '', dataA.value[i]?.flow ?? '',
      dataB.value[i]?.level ?? '', dataB.value[i]?.flow ?? '',
    ])
  }
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `历史数据_对比_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}
</script>

<template>
  <div class="dc">
    <div class="dc__filters">
      <div class="dc__period">
        <span class="dc__badge dc__badge--a">时段 A</span>
        <input type="datetime-local" v-model="rangeA.start" />
        <span>—</span>
        <input type="datetime-local" v-model="rangeA.end" />
      </div>
      <div class="dc__period">
        <span class="dc__badge dc__badge--b">时段 B</span>
        <input type="datetime-local" v-model="rangeB.start" />
        <span>—</span>
        <input type="datetime-local" v-model="rangeB.end" />
      </div>
      <button class="dc__btn dc__btn--q" @click="doQuery">对比查询</button>
      <button class="dc__btn" @click="doExport" :disabled="!queried">导出 CSV</button>
    </div>

    <div v-if="diffStats" class="dc__stats">
      <span>最大差 <b>{{ diffStats.maxDiff }}m</b></span>
      <span>平均差 <b>{{ diffStats.avgDiff }}m</b></span>
      <span>变化率 <b>{{ diffStats.pct }}%</b></span>
    </div>

    <div class="dc__chart">
      <VChart v-if="queried" :option="chartOpt" autoresize style="width:100%;height:100%" />
      <div v-else class="dc__empty">请选择 A / B 时段并点击"对比查询"</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dc {
  display: flex; flex-direction: column; height: 100%; padding: 18px 24px; gap: 14px;
  &__filters { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  &__period { display: flex; align-items: center; gap: 8px; }
  &__badge { padding: 4px 14px; font-size: 13px; font-weight: 700; color: #fff; border-radius: 4px;
    &--a { background: #1890ff; } &--b { background: #ff7f0e; }
  }
  input { padding: 7px 10px; font-size: 14px; border: 1px solid #d1d5db; border-radius: 6px; }
  &__btn { padding: 8px 16px; font-size: 14px; font-weight: 500; color: #64748b; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;
    &:hover:not(:disabled) { background: #f3f4f6; }
    &:disabled { opacity: 0.4; }
    &--q { color: #fff; background: #3b82f6; border-color: #3b82f6; &:hover:not(:disabled) { background: #2563eb; } }
  }
  &__stats { display: flex; gap: 20px; padding: 10px 16px; background: #f8fafc; border-radius: 8px; font-size: 14px; color: #64748b;
    b { color: #1e293b; font-family: 'SF Mono', monospace; margin-left: 4px; }
  }
  &__chart { flex: 1; min-height: 0; background: #fff; border-radius: 8px; border: 1px solid #eef0f2; }
  &__empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #94a3b8; font-size: 16px; }
}
</style>
