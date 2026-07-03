<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const units = ref([
  { name:'1#', mw:685, eff:94.2, rpm:75, temp:62, vib:2.1, status:'running' as const },
  { name:'2#', mw:692, eff:94.8, rpm:75, temp:60, vib:1.8, status:'running' as const },
  { name:'3#', mw:0,   eff:0,   rpm:0,  temp:28, vib:0,   status:'stopped' as const },
  { name:'4#', mw:678, eff:93.5, rpm:75, temp:64, vib:2.3, status:'running' as const },
  { name:'5#', mw:688, eff:94.1, rpm:75, temp:61, vib:1.9, status:'running' as const },
  { name:'6#', mw:0,   eff:0,   rpm:0,  temp:27, vib:0,   status:'maintenance' as const },
  { name:'7#', mw:695, eff:95.0, rpm:75, temp:59, vib:1.7, status:'running' as const },
  { name:'8#', mw:681, eff:93.9, rpm:75, temp:63, vib:2.0, status:'running' as const },
])

const sc:Record<string,{color:string;label:string}> = {
  running:    {color:'#22c55e',label:'运行'},
  stopped:    {color:'#94a3b8',label:'停机'},
  maintenance:{color:'#f59e0b',label:'检修'},
}

const stats = computed(() => ({
  totalMW: units.value.reduce((s,u)=>s+u.mw,0),
  avgEff: (()=>{const r=units.value.filter(u=>u.status==='running');return r.length?+(r.reduce((s,u)=>s+u.eff,0)/r.length).toFixed(1):0})(),
  today: 1248.6,
  running: units.value.filter(u=>u.status==='running').length,
}))

const trendData = ref<[string,number][]>([])
let t:ReturnType<typeof setInterval>
onMounted(()=>{
  const now=Date.now()
  for(let i=59;i>=0;i--) trendData.value.push([new Date(now-i*60000).toLocaleTimeString('zh-CN'),650+Math.random()*50])
  t=setInterval(()=>{
    trendData.value.push([new Date().toLocaleTimeString('zh-CN'),680+Math.random()*30])
    if(trendData.value.length>60) trendData.value.shift()
    units.value.forEach(u=>{if(u.status==='running')u.mw=+(u.mw+(Math.random()-.5)*3).toFixed(0)})
  },3000)
})
onUnmounted(()=>clearInterval(t))

const barOpt = computed(() => ({
  backgroundColor:'transparent',
  grid:{left:60,right:20,top:10,bottom:28},
  xAxis:{type:'category',data:units.value.map(u=>u.name+'机组'),axisLine:{lineStyle:{color:'#e5e7eb'}},axisLabel:{color:'#64748b',fontSize:12}},
  yAxis:{type:'value',splitLine:{lineStyle:{color:'#f3f4f6'}},axisLabel:{color:'#94a3b8',fontSize:10,formatter:(v:number)=>v+' MW'}},
  series:[{type:'bar',data:units.value.map(u=>({value:u.mw,itemStyle:{color:u.mw>0?'#3b82f6':'#e5e7eb',borderRadius:[4,4,0,0]}})),barWidth:28,emphasis:{itemStyle:{color:'#2563eb'}}}],
  tooltip:{trigger:'axis',backgroundColor:'#fff',borderColor:'#e5e7eb',textStyle:{color:'#374151',fontSize:12}},
}))

const lineOpt = computed(() => ({
  backgroundColor:'transparent',
  grid:{left:56,right:12,top:6,bottom:24},
  xAxis:{type:'category',data:trendData.value.map(d=>d[0]),axisLine:{lineStyle:{color:'#e5e7eb'}},axisLabel:{color:'#9ca3af',fontSize:9,interval:9}},
  yAxis:{type:'value',splitLine:{lineStyle:{color:'#f3f4f6'}},axisLabel:{color:'#9ca3af',fontSize:9,formatter:(v:number)=>v+'MW'}},
  series:[{type:'line',data:trendData.value.map(d=>d[1]),smooth:true,symbol:'none',lineStyle:{color:'#3b82f6',width:2},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(59,130,246,0.15)'},{offset:1,color:'rgba(59,130,246,0.01)'}]}}}],
  tooltip:{trigger:'axis',backgroundColor:'#fff',borderColor:'#e5e7eb',textStyle:{color:'#374151',fontSize:11}},
}))
</script>

<template>
  <div class="gp">
    <!-- KPI 数字条 -->
    <div class="kpis">
      <span class="kpis__label">总出力</span><span class="kpis__val">{{ stats.totalMW }}<small> MW</small></span>
      <span class="kpis__sep"/>
      <span class="kpis__label">平均效率</span><span class="kpis__val">{{ stats.avgEff }}<small> %</small></span>
      <span class="kpis__sep"/>
      <span class="kpis__label">今日发电</span><span class="kpis__val">{{ stats.today }}<small> 万kWh</small></span>
      <span class="kpis__sep"/>
      <span class="kpis__label">运行机组</span><span class="kpis__val" style="color:#16a34a">{{ stats.running }}<small> / 8</small></span>
      <span class="kpis__badge" :style="{background:stats.running>0?'#f0fdf4':'#fef2f2',color:stats.running>0?'#16a34a':'#ef4444'}">{{ stats.running>0?'已并网':'离网' }}</span>
    </div>

    <div class="main">
      <!-- 上：机组出力柱状图 -->
      <div class="section">
        <div class="section__title">机组出力对比</div>
        <v-chart class="chart-bar" :option="barOpt" autoresize/>
      </div>

      <!-- 下：数据表 + 趋势图 -->
      <div class="bottom">
        <div class="section" style="flex:1">
          <div class="section__title">机组详情</div>
          <table class="tbl">
            <thead><tr><th>机组</th><th>出力</th><th>效率</th><th>转速</th><th>温度</th><th>振动</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="u in units" :key="u.name" :class="{off:u.status!=='running'}">
                <td class="td-n">{{ u.name }} 机组</td>
                <td class="td-v">{{ u.status==='running'?u.mw+' MW':'—' }}</td>
                <td>{{ u.status==='running'?u.eff+'%':'—' }}</td>
                <td>{{ u.status==='running'?u.rpm:'—' }}<small> rpm</small></td>
                <td>{{ u.temp }}<small> °C</small></td>
                <td>{{ u.status==='running'?u.vib:'—' }}<small> mm/s</small></td>
                <td><span :style="{color:sc[u.status].color,fontWeight:600}">{{ sc[u.status].label }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="section" style="width:360px;flex-shrink:0">
          <div class="section__title">出力趋势 · 60 分钟</div>
          <v-chart class="chart-line" :option="lineOpt" autoresize/>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gp { height:calc(100vh - 56px); display:flex; flex-direction:column; background:#f5f6f8; overflow:hidden; }

// KPI 数字条
.kpis { display:flex; align-items:center; gap:16px; padding:16px 28px; background:#fff; border-bottom:1px solid #eef0f2; flex-shrink:0; }
.kpis__label { font-size:13px; color:#8b9198; }
.kpis__val { font-size:24px; font-weight:700; color:#1e293b; font-family:'SF Mono','Cascadia Code',monospace; small{font-size:12px;font-weight:400;color:#94a3b8;margin-left:2px;} }
.kpis__sep { width:1px; height:28px; background:#eef0f2; }
.kpis__badge { font-size:11px; font-weight:600; padding:3px 12px; border-radius:100px; }

// 主区域
.main { flex:1; display:flex; flex-direction:column; gap:14px; padding:14px 24px; min-height:0; overflow-y:auto; }

.section { background:#fff; border:1px solid #eef0f2; border-radius:8px; padding:14px 18px; }
.section__title { font-size:14px; font-weight:600; color:#374151; margin-bottom:10px; }

.chart-bar { height:200px; width:100%; }
.chart-line { height:100%; width:100%; min-height:200px; }

.bottom { flex:1; display:flex; gap:14px; min-height:0; }

// 表格
.tbl { width:100%; border-collapse:collapse; font-size:13px;
  th { text-align:left; padding:8px 10px; color:#8b9198; font-weight:500; font-size:11px; border-bottom:1px solid #eef0f2; }
  td { padding:9px 10px; color:#475569; border-bottom:1px solid #f8f9fb;
    small { color:#94a3b8; font-size:11px; } }
  tbody tr:nth-child(even) td { background:#fafbfc; }
  tbody tr:hover td { background:#f0f4ff; }
}
.td-n { font-weight:600; color:#1e293b; }
.td-v { font-weight:700; font-family:'SF Mono',monospace; color:#3b82f6; }
tr.off td { color:#c0c4cc; .td-n{color:#94a3b8} .td-v{color:#c0c4cc} }
</style>

<style lang="scss">
.main-layout__content:has(.gp) { padding:0 !important; overflow:hidden !important; }
</style>
