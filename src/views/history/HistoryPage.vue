<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent, CanvasRenderer])

// ═══ 主题 ═══
const darkMode = ref(localStorage.getItem('history-theme') === 'dark')
watch(darkMode, v => localStorage.setItem('history-theme', v ? 'dark' : 'light'))

// ═══ 离线检测 ═══
const isOnline = ref(navigator.onLine)
onMounted(() => { window.addEventListener('online', ()=>isOnline.value=true); window.addEventListener('offline', ()=>isOnline.value=false) })

// ═══ 筛选 ═══
const dateRange = ref({ start: '', end: '' })
const selectedMetrics = ref<string[]>(['upstreamLevel', 'flowRate'])
const granularity = ref<'raw'|'5min'|'hour'|'day'>('5min')
const metricOptions = [
  { value:'upstreamLevel', label:'上游水位', unit:'m', color:'#3b82f6' },
  { value:'downstreamLevel', label:'下游水位', unit:'m', color:'#06b6d4' },
  { value:'inflowRate', label:'入库流量', unit:'m³/s', color:'#8b5cf6' },
  { value:'outflowRate', label:'出库流量', unit:'m³/s', color:'#22c55e' },
  { value:'gateOpening', label:'闸门开度', unit:'%', color:'#f59e0b' },
  { value:'powerOutput', label:'发电功率', unit:'MW', color:'#ef4444' },
]
const granularityOptions = [
  { value:'raw', label:'原始' }, { value:'5min', label:'5分钟' },
  { value:'hour', label:'小时' }, { value:'day', label:'日' },
]
const queried = ref(false)

// ═══ 模拟数据 ═══
const allData = ref<any[]>([])
const tableData = ref<any[]>([])
const tablePage = ref(1)
const tablePageSize = 15
const chartZoom = ref<[number, number] | null>(null)

function generateMock() {
  const now = Date.now()
  const arr = []
  for (let i = 96; i >= 0; i--) { // 只生成96个点，每15分钟一个 = 24小时
    const t = now - i * 15 * 60000
    arr.push({
      time: t, label: new Date(t).toLocaleString('zh-CN'),
      upstreamLevel: +(378.5 + Math.sin(i/8)*1.2).toFixed(2),
      downstreamLevel: +(269.2 + Math.sin(i/12)*0.2).toFixed(2),
      inflowRate: Math.round(6350 + Math.sin(i/6)*800),
      outflowRate: Math.round(5820 + Math.sin(i/6)*700),
      gateOpening: +(34 + Math.sin(i/4)*15).toFixed(1),
      powerOutput: Math.round(680 + Math.sin(i/5)*15),
      event: null as any,
    })
  }
  // 加几个事件标记
  arr[20].event = { type:'alarm', label:'水位超预警', color:'#ef4444' }
  arr[45].event = { type:'dispatch', label:'闸门调度', color:'#3b82f6' }
  arr[70].event = { type:'gate', label:'3#闸门动作', color:'#f59e0b' }
  allData.value = arr
}

function applyFilters() {
  let data = [...allData.value]
  if (dateRange.value.start) data = data.filter(d => d.time >= new Date(dateRange.value.start).getTime())
  if (dateRange.value.end) data = data.filter(d => d.time <= new Date(dateRange.value.end).getTime())
  tableData.value = data
  tablePage.value = 1
  queried.value = true
}
function resetFilters() {
  dateRange.value = { start:'', end:'' }
  selectedMetrics.value = ['upstreamLevel', 'flowRate']
  granularity.value = '5min'
  tableData.value = [...allData.value]
  queried.value = false
  chartZoom.value = null
}

const metricLabel = (v: string) => metricOptions.find(o => o.value === v)?.label ?? v
const metricUnit = (v: string) => metricOptions.find(o => o.value === v)?.unit ?? ''

const pagedData = computed(() => {
  const s = (tablePage.value - 1) * tablePageSize
  return tableData.value.slice(s, s + tablePageSize)
})
const totalPages = computed(() => Math.ceil(tableData.value.length / tablePageSize))

// ═══ 图表双向联动 ═══
function onChartZoom(params: any) {
  if (params.batch?.[0]) {
    const z = params.batch[0]
    chartZoom.value = [z.start, z.end]
    // 根据 zoom 范围过滤表格
    const startIdx = Math.floor(z.start / 100 * tableData.value.length)
    const endIdx = Math.floor(z.end / 100 * tableData.value.length)
    tableData.value = allData.value.slice(startIdx, endIdx + 1)
    tablePage.value = 1
  }
}

// ═══ 图表配置 ═══
const chartOpt = computed(() => {
  const data = tableData.value.length > 0 ? tableData.value.slice(0, 200) : allData.value.slice(0, 200)
  if (data.length === 0) return {}
  const series: any[] = selectedMetrics.value.map(m => {
    const cfg = metricOptions.find(o => o.value === m)
    if (!cfg) return null
    const s: any = { name: cfg.label, type:'line', data: data.map(d => [d.label, d[m]]), smooth:true, symbol:'none', lineStyle:{color:cfg.color, width:2} }
    if (m === 'upstreamLevel' || m === 'downstreamLevel') s.yAxisIndex = 0; else s.yAxisIndex = 1
    return s
  }).filter(Boolean)
  const events = data.filter(d => d.event)
  if (series.length > 0 && events.length > 0) {
    series[0].markPoint = { data: events.map(d => ({ name:d.event.label, coord:[d.label, d.upstreamLevel], symbol:'pin', symbolSize:28, itemStyle:{color:d.event.color}, label:{show:true, fontSize:10} })) }
  }
  return {
    backgroundColor:'transparent', legend:{data:selectedMetrics.value.map(m=>metricLabel(m)),textStyle:{color:'#64748b',fontSize:11},top:0},
    grid:{left:56,right:56,top:30,bottom:60},
    tooltip:{trigger:'axis'}, animation:false,
    xAxis:{type:'category',data:data.map(d=>d.label),axisLabel:{fontSize:9,interval:Math.max(1,Math.floor(data.length/6))}},
    yAxis:[{type:'value',splitLine:{lineStyle:{color:'#f1f5f9'}},axisLabel:{fontSize:10}},{type:'value',splitLine:{show:false},axisLabel:{fontSize:10}}],
    dataZoom:[{type:'slider',start:0,end:100,height:20,bottom:0}], series,
  }
})

// ═══ 导出 ═══
const exporting = ref(false)
function doExport(format: 'csv'|'xlsx') {
  exporting.value = true
  setTimeout(() => {
    const headers = ['时间', ...selectedMetrics.value.map(m => metricLabel(m))]
    const rows = tableData.value.map(d => [d.label, ...selectedMetrics.value.map(m => d[m])])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `历史数据_${new Date().toISOString().slice(0,10)}.${format === 'csv' ? 'csv' : 'csv'}`
    a.click()
    exporting.value = false
  }, 800)
}

// ═══ 智能报告 ═══
const reportVisible = ref(false)
const reportData = computed(() => {
  const data = tableData.value.length > 0 ? tableData.value : allData.value.slice(-100)
  const calc = (key: string) => ({ max: Math.max(...data.map(d=>d[key])).toFixed(2), min: Math.min(...data.map(d=>d[key])).toFixed(2), avg: (data.reduce((s,d)=>s+d[key],0)/data.length).toFixed(2) })
  return { upstreamLevel:calc('upstreamLevel'), inflowRate:calc('inflowRate'), powerOutput:calc('powerOutput'), gateOpening:calc('gateOpening'), anomalies: data.filter(d=>d.event).length, total: data.length }
})

generateMock()
tableData.value = [...allData.value]
</script>

<template>
  <div class="hp" :class="{ dark: darkMode }">
    <!-- 筛选区 -->
    <div class="filter">
      <div class="filter__row">
        <label>日期范围</label>
        <input type="datetime-local" v-model="dateRange.start" class="inp" />
        <span>—</span>
        <input type="datetime-local" v-model="dateRange.end" class="inp" />
      </div>
      <div class="filter__row">
        <label>数据项</label>
        <div class="tags">
          <span v-for="m in metricOptions" :key="m.value" class="tag" :class="{on:selectedMetrics.includes(m.value)}" @click="selectedMetrics.includes(m.value)?selectedMetrics=selectedMetrics.filter(x=>x!==m.value):selectedMetrics.push(m.value)" :style="{'--c':m.color}">{{ m.label }}</span>
        </div>
      </div>
      <div class="filter__row">
        <label>粒度</label>
        <div class="tags">
          <span v-for="g in granularityOptions" :key="g.value" class="tag" :class="{on:granularity===g.value}" @click="granularity=g.value as any">{{ g.label }}</span>
        </div>
      </div>
      <div class="filter__btns">
        <button class="btn btn--q" @click="applyFilters" :disabled="!isOnline">查询</button>
        <button class="btn" @click="resetFilters">重置</button>
        <button class="btn" @click="darkMode=!darkMode">{{ darkMode ? '☀' : '☾' }}</button>
        <span v-if="!isOnline" class="offline">离线 · 查询导出已禁用</span>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-wrap">
      <v-chart class="chart" :option="chartOpt" autoresize @datazoom="onChartZoom" />
    </div>

    <!-- 表格区 -->
    <div class="tbl-wrap">
      <div class="tbl__hd">
        <span>数据点 · {{ tableData.length }} 条</span>
        <div class="tbl__acts">
          <button class="btn btn--sm" @click="doExport('csv')" :disabled="!isOnline || exporting">{{ exporting ? '导出中...' : 'CSV 导出' }}</button>
          <button class="btn btn--sm" @click="reportVisible=true">📊 智能报告</button>
        </div>
      </div>
      <table class="tbl">
        <thead><tr><th>时间</th><th v-for="m in selectedMetrics" :key="m">{{ metricLabel(m) }}</th></tr></thead>
        <tbody>
          <tr v-for="d in pagedData" :key="d.time">
            <td>{{ d.label }}</td>
            <td v-for="m in selectedMetrics" :key="m">{{ d[m] }} {{ metricUnit(m) }}</td>
          </tr>
        </tbody>
      </table>
      <div class="tbl__pg">
        <button :disabled="tablePage<=1" @click="tablePage--">‹</button>
        <span>{{ tablePage }} / {{ totalPages }}</span>
        <button :disabled="tablePage>=totalPages" @click="tablePage++">›</button>
      </div>
    </div>

    <!-- 智能报告弹窗 -->
    <Transition name="fade">
      <div v-if="reportVisible" class="modal" @click.self="reportVisible=false">
        <div class="modal__box">
          <h2>智能分析报告</h2>
          <div class="rep">
            <div class="rep__item"><span>数据点数</span><b>{{ reportData.total }}</b></div>
            <div class="rep__item"><span>异常点数</span><b style="color:#ef4444">{{ reportData.anomalies }}</b></div>
            <div class="rep__item"><span>上游水位</span><b>最大 {{ reportData.upstreamLevel.max }}m / 最小 {{ reportData.upstreamLevel.min }}m / 平均 {{ reportData.upstreamLevel.avg }}m</b></div>
            <div class="rep__item"><span>入库流量</span><b>最大 {{ reportData.inflowRate.max }}m³/s / 最小 {{ reportData.inflowRate.min }}m³/s / 平均 {{ reportData.inflowRate.avg }}m³/s</b></div>
            <div class="rep__item"><span>发电功率</span><b>最大 {{ reportData.powerOutput.max }}MW / 最小 {{ reportData.powerOutput.min }}MW / 平均 {{ reportData.powerOutput.avg }}MW</b></div>
            <div class="rep__item"><span>闸门开度</span><b>最大 {{ reportData.gateOpening.max }}% / 最小 {{ reportData.gateOpening.min }}% / 平均 {{ reportData.gateOpening.avg }}%</b></div>
          </div>
          <button class="btn" @click="reportVisible=false">关闭</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.hp { height:calc(100vh - 56px); display:flex; flex-direction:column; background:#f8f9fb; overflow:hidden; }
.hp.dark { background:#0f172a; color:#e2e8f0; }

.filter { padding:16px 24px; background:var(--bg,#fff); border-bottom:1px solid var(--br,#eef0f2); flex-shrink:0; display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap }
.dark .filter { --bg:#1e293b; --br:#334155 }
.filter__row { display:flex; align-items:center; gap:8px }
.filter__row label { font-size:11px; color:var(--tx,#94a3b8); text-transform:uppercase; font-weight:600; white-space:nowrap }
.dark .filter__row label { --tx:#64748b }
.inp { padding:5px 8px; border:1px solid #d1d5db; border-radius:5px; font-size:12px; background:#fff; color:#374151 }
.dark .inp { background:#334155; border-color:#475569; color:#e2e8f0 }
.tags { display:flex; gap:4px; flex-wrap:wrap }
.tag { padding:3px 10px; border:1px solid #e5e7eb; border-radius:100px; font-size:11px; cursor:pointer; color:#64748b; background:#fff; transition:all 0.15s }
.tag:hover { border-color:#93c5fd }
.tag.on { background:var(--c); border-color:var(--c); color:#fff }
.dark .tag { background:#334155; border-color:#475569; color:#94a3b8 }
.dark .tag.on { background:var(--c); border-color:var(--c); color:#fff }
.filter__btns { display:flex; gap:6px; align-items:center; margin-left:auto }
.btn { padding:6px 14px; border:1px solid #d1d5db; background:#fff; border-radius:5px; font-size:12px; cursor:pointer; color:#64748b; font-weight:500 }
.btn:hover:not(:disabled) { background:#f3f4f6 }
.btn:disabled { opacity:0.4; cursor:not-allowed }
.btn--q { background:#3b82f6; border-color:#3b82f6; color:#fff }
.btn--q:hover:not(:disabled) { background:#2563eb }
.btn--sm { padding:4px 10px; font-size:11px }
.dark .btn { background:#334155; border-color:#475569; color:#94a3b8 }
.dark .btn--q { background:#3b82f6; border-color:#3b82f6; color:#fff }
.offline { font-size:11px; color:#ef4444; margin-left:4px }

.chart-wrap { min-height:280px; padding:12px 24px; flex-shrink:0 }
.chart { width:100%; height:280px }

.tbl-wrap { flex:1; overflow:hidden; display:flex; flex-direction:column; margin:0 24px 16px; background:var(--bg,#fff); border:1px solid var(--br,#eef0f4); border-radius:10px }
.dark .tbl-wrap { --bg:#1e293b; --br:#334155 }
.tbl__hd { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid var(--br,#eef0f4); font-size:12px; color:#94a3b8 }
.tbl__acts { display:flex; gap:6px }
.tbl { width:100%; border-collapse:collapse; flex:1; overflow-y:auto; display:block }
.tbl thead, .tbl tbody { display:table; width:100%; table-layout:fixed }
.tbl th { text-align:left; padding:8px 14px; font-size:10px; color:#94a3b8; font-weight:500; text-transform:uppercase; letter-spacing:0.3px; border-bottom:1px solid var(--br,#f1f5f9) }
.tbl td { padding:7px 14px; font-size:12px; color:var(--tx,#475569); border-bottom:1px solid #f8fafc; white-space:nowrap }
.dark .tbl td { --tx:#94a3b8; border-color:#1e293b }
.tbl tr:hover td { background:var(--hb,#fafbfc) }
.dark .tbl tr:hover td { --hb:#283448 }
.tbl__pg { display:flex; justify-content:center; align-items:center; gap:10px; padding:10px; border-top:1px solid var(--br,#eef0f4); font-size:12px; color:#64748b }
.tbl__pg button { padding:4px 12px; border:1px solid #d1d5db; background:#fff; border-radius:4px; cursor:pointer; font-size:14px }
.tbl__pg button:disabled { opacity:0.3; cursor:default }
.dark .tbl__pg button { background:#334155; border-color:#475569; color:#e2e8f0 }

.modal { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9999; display:flex; align-items:center; justify-content:center }
.modal__box { background:#fff; border-radius:12px; padding:28px; width:520px; max-height:80vh; overflow-y:auto }
.dark .modal__box { background:#1e293b; color:#e2e8f0 }
.modal__box h2 { font-size:18px; font-weight:700; margin:0 0 20px }
.rep { display:flex; flex-direction:column; gap:8px; margin-bottom:16px }
.rep__item { padding:8px 12px; background:#f8fafc; border-radius:6px; display:flex; gap:10px; font-size:13px }
.rep__item span { color:#94a3b8; font-weight:500; min-width:80px }
.rep__item b { color:#1e293b; font-weight:600 }
.dark .rep__item { background:#334155 }
.dark .rep__item b { color:#e2e8f0 }

.fade-enter-active, .fade-leave-active { transition:opacity 0.2s }
.fade-enter-from, .fade-leave-to { opacity:0 }
</style>

<style lang="scss">
.main-layout__content:has(.hp) { padding:0 !important; overflow:hidden !important }
</style>
