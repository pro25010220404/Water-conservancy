<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  CanvasRenderer,
])
import { isReplaying } from '@/composables/useReplayMode'

// ═══ 模拟数据 ═══
const allData = ref<any[]>([])
function genData() {
  const now = Date.now()
  const arr = []
  for (let i = 96; i >= 0; i--) {
    const t = now - i * 15 * 60000
    arr.push({
      time: t,
      label: new Date(t).toLocaleString('zh-CN'),
      upstreamLevel: +(378.5 + Math.sin(i / 8) * 1.2 + (Math.random() - 0.5) * 0.2).toFixed(2),
      downstreamLevel: +(269.2 + Math.sin(i / 12) * 0.2 + (Math.random() - 0.5) * 0.05).toFixed(2),
      inflowRate: Math.round(6350 + Math.sin(i / 6) * 800 + (Math.random() - 0.5) * 200),
      outflowRate: Math.round(5820 + Math.sin(i / 6) * 700 + (Math.random() - 0.5) * 150),
      gateOpening: +(34 + Math.sin(i / 4) * 15 + (Math.random() - 0.5) * 3).toFixed(1),
      powerOutput: Math.round(680 + Math.sin(i / 5) * 15 + (Math.random() - 0.5) * 5),
      event: null as any,
    })
  }
  arr[20].event = { type: 'alarm', label: '水位超预警', color: '#ef4444' }
  arr[45].event = { type: 'dispatch', label: '闸门调度', color: '#3b82f6' }
  arr[70].event = { type: 'gate', label: '3#闸门动作', color: '#f59e0b' }
  allData.value = arr
}
genData()

// ═══ 指标配置 ═══
const metrics = [
  { key: 'upstreamLevel', label: '上游水位', unit: 'm', color: '#3b82f6' },
  { key: 'downstreamLevel', label: '下游水位', unit: 'm', color: '#06b6d4' },
  { key: 'inflowRate', label: '入库流量', unit: 'm³/s', color: '#8b5cf6' },
  { key: 'outflowRate', label: '出库流量', unit: 'm³/s', color: '#22c55e' },
  { key: 'gateOpening', label: '闸门开度', unit: '%', color: '#f59e0b' },
  { key: 'powerOutput', label: '发电功率', unit: 'MW', color: '#ef4444' },
]

// ═══ 回放状态 ═══
const replayTime = ref(0)
const replayPlaying = ref(false)
const replaySpeed = ref(1)
let replayTimer: ReturnType<typeof setInterval> | null = null

const replayTimeMin = computed(() => allData.value[0]?.time ?? 0)
const replayTimeMax = computed(() => allData.value[allData.value.length - 1]?.time ?? 0)
const replayTimeLabel = computed(() => new Date(replayTime.value).toLocaleString('zh-CN'))
const progress = computed(() => {
  const range = replayTimeMax.value - replayTimeMin.value
  return range ? (((replayTime.value - replayTimeMin.value) / range) * 100).toFixed(1) : '0'
})

const replaySnapshot = computed(() => {
  let best = allData.value[0],
    bestDiff = Infinity
  for (const d of allData.value) {
    const diff = Math.abs(d.time - replayTime.value)
    if (diff < bestDiff) {
      bestDiff = diff
      best = d
    }
  }
  return best
})

function togglePlay() {
  replayPlaying.value ? stopTimer() : startTimer()
}
function startTimer() {
  replayPlaying.value = true
  isReplaying.value = true
  replayTimer = setInterval(() => {
    replayTime.value += replaySpeed.value * 15 * 60000
    if (replayTime.value >= replayTimeMax.value) {
      replayTime.value = replayTimeMax.value
      stopTimer()
    }
  }, 100)
}
function stopTimer() {
  replayPlaying.value = false
  isReplaying.value = false
  if (replayTimer) {
    clearInterval(replayTimer)
    replayTimer = null
  }
}
function seek(e: Event) {
  replayTime.value = Number((e.target as HTMLInputElement).value)
}
function jump(d: number) {
  const step = 5 * 15 * 60000
  replayTime.value = Math.min(
    replayTimeMax.value,
    Math.max(replayTimeMin.value, replayTime.value + d * step),
  )
}
function reset() {
  stopTimer()
  replayTime.value = allData.value[Math.floor(allData.value.length / 2)]?.time ?? Date.now()
}

onMounted(() => {
  replayTime.value = allData.value[Math.floor(allData.value.length / 2)]?.time ?? Date.now()
})
onUnmounted(() => {
  stopTimer()
})

// ═══ 图表 ═══
const chartOpt = computed(() => {
  const data = allData.value
  const series: any[] = metrics.map((m) => ({
    name: m.label,
    type: 'line',
    data: data.map((d) => [d.label, d[m.key]]),
    smooth: true,
    symbol: 'none',
    lineStyle: { color: m.color, width: 1.5 },
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
      data: [{ xAxis: replaySnapshot.value?.label }],
      label: { show: false },
    },
  }))

  const events = data.filter((d) => d.event)
  if (events.length) {
    series[0].markPoint = {
      data: events.map((d) => ({
        name: d.event.label,
        coord: [d.label, d.upstreamLevel],
        symbol: 'pin',
        symbolSize: 36,
        itemStyle: { color: d.event.color },
        label: { show: true, fontSize: 14, color: '#fff' },
      })),
    }
  }

  return {
    backgroundColor: 'transparent',
    legend: {
      data: metrics.map((m) => m.label),
      textStyle: { color: '#64748b', fontSize: 13 },
      top: 0,
    },
    grid: { left: 60, right: 40, top: 36, bottom: 60 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.label),
      axisLabel: { interval: Math.floor(data.length / 6), fontSize: 13 },
    },
    yAxis: [
      { type: 'value', splitLine: { lineStyle: { color: '#f1f5f9' } } },
      { type: 'value', splitLine: { show: false } },
    ],
    dataZoom: [{ type: 'slider', bottom: 0, height: 24 }],
    series,
  }
})
</script>

<template>
  <div class="rp">
    <!-- KPI 快照 -->
    <div class="rp__snap">
      <div v-for="m in metrics" :key="m.key" class="rp__snap-item">
        <span class="rp__snap-label">{{ m.label }}</span>
        <span class="rp__snap-val" :style="{ color: m.color }"
          >{{ replaySnapshot?.[m.key] ?? '--' }} {{ m.unit }}</span
        >
      </div>
    </div>

    <!-- 图表 -->
    <div class="rp__chart">
      <VChart :option="chartOpt" autoresize style="width: 100%; height: 100%" />
    </div>

    <!-- 控制栏 -->
    <div class="rp__ctrl">
      <button class="rp__btn" @click="jump(-1)" title="快退">⏮</button>
      <button class="rp__btn rp__btn--play" @click="togglePlay">
        {{ replayPlaying ? '⏸' : '▶' }}
      </button>
      <button class="rp__btn" @click="jump(1)" title="快进">⏭</button>
      <button class="rp__btn" @click="reset">↺</button>

      <div class="rp__time">{{ replayTimeLabel }}</div>

      <div class="rp__speeds">
        <button
          v-for="s in [1, 2, 5, 10]"
          :key="s"
          class="rp__sp"
          :class="{ on: replaySpeed === s }"
          @click="replaySpeed = s"
        >
          {{ s }}x
        </button>
      </div>

      <div class="rp__slider">
        <input
          type="range"
          :min="replayTimeMin"
          :max="replayTimeMax"
          :value="replayTime"
          @input="seek"
        />
        <span>{{ progress }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/text-mixins.scss' as *;
.rp {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  overflow: hidden;
  &__snap {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    padding: 12px 24px;
    flex-shrink: 0;
    background: linear-gradient(135deg, #fffbeb, #fef3c7);
    border-bottom: 2px solid #f59e0b;
  }
  &__snap-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  &__snap-label {
    @include text-kpi-label;
    color: #92400e;
  }
  &__snap-val {
    @include text-kpi-value;
    font-size: 22px;
  }
  &__chart {
    flex: 1;
    min-height: 0;
    padding: 12px 16px 8px;
  }
  &__ctrl {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: #fff;
    border-top: 1px solid #eef0f2;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  &__btn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #92400e;
    background: #fffbeb;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    cursor: pointer;
    &:hover {
      background: #fef3c7;
    }
    &--play {
      width: 46px;
      height: 46px;
      font-size: 20px;
      background: #f59e0b;
      color: #fff;
      border-radius: 50%;
      border-color: transparent;
      &:hover {
        background: #d97706;
      }
    }
  }
  &__time {
    min-width: 180px;
    @include text-kpi-value;
    font-size: 16px;
    color: #92400e;
  }
  &__speeds {
    display: flex;
    gap: 3px;
  }
  &__sp {
    padding: 5px 12px;
    font-size: 13px;
    font-weight: 600;
    color: #92400e;
    background: #fff;
    border: 1px solid #fcd34d;
    border-radius: 5px;
    cursor: pointer;
    &:hover {
      background: #fffbeb;
    }
    &.on {
      color: #fff;
      background: #f59e0b;
      border-color: #f59e0b;
    }
  }
  &__slider {
    flex: 1;
    min-width: 150px;
    display: flex;
    align-items: center;
    gap: 8px;
    input {
      flex: 1;
      height: 6px;
      -webkit-appearance: none;
      appearance: none;
      background: linear-gradient(90deg, #fcd34d, #f59e0b);
      border-radius: 3px;
      outline: none;
      cursor: pointer;
      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #f59e0b;
        border: 3px solid #fff;
        box-shadow: 0 2px 6px rgba(245, 158, 11, 0.5);
        cursor: pointer;
      }
    }
    span {
      font-size: 12px;
      font-family: 'SF Mono', monospace;
      color: #92400e;
      min-width: 40px;
      text-align: right;
    }
  }
}
</style>
