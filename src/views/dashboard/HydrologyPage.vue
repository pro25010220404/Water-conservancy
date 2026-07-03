<script setup lang="ts">
// ============================================================
// 水情监测 — 全屏地图 + 顶部浮层 KPI + 右侧折叠图表抽屉
// ============================================================
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useHydrologyData, type HydrologySnapshot } from '@/composables/useHydrologyData'

use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const { snapshot, trend, connected, useMock } = useHydrologyData()
const fmt = (v: number | undefined, d = 2) =>
  v != null ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '--'

const NORMAL = 380
const drawerOpen = ref(false)

const T_IMG = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const T_LBL = 'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

type Status = 'normal' | 'warning' | 'critical'
const SC: Record<Status, string> = { normal: '#22c55e', warning: '#f59e0b', critical: '#ef4444' }

interface Station { id: string; name: string; lat: number; lng: number; cat: '水位'|'流量'|'雨量'; key: 'up'|'dn'|'in'|'out'|'rain' }
const SS: Station[] = [
  { id:'ws1',name:'坝前水位',lat:28.644,lng:104.389,cat:'水位',key:'up'},
  { id:'ws2',name:'坝后水位',lat:28.640,lng:104.398,cat:'水位',key:'dn'},
  { id:'fs1',name:'入库流量',lat:28.665,lng:104.362,cat:'流量',key:'in'},
  { id:'fs2',name:'出库流量',lat:28.633,lng:104.408,cat:'流量',key:'out'},
  { id:'rn1',name:'雨量站 A',lat:28.672,lng:104.415,cat:'雨量',key:'rain'},
  { id:'rn2',name:'雨量站 B',lat:28.618,lng:104.372,cat:'雨量',key:'rain'},
]
function sv(s:Station){ const m:Record<string,number>={up:snapshot.value.upstreamLevel,dn:snapshot.value.downstreamLevel,in:snapshot.value.inflowRate,out:snapshot.value.outflowRate,rain:0}; return m[s.key]??0 }
function su(c:string){ return c==='水位'?'m':c==='流量'?'m³/s':'mm' }
function status(s:Station):Status{
  if(s.cat==='雨量')return 'normal'
  const v=sv(s);const base:Record<string,number>={up:378.5,dn:269.2,in:6350,out:5820}
  const d=Math.abs(v-(base[s.key]??0))
  if(s.cat==='水位')return d>=0.8?'critical':d>=0.4?'warning':'normal'
  return d>=600?'critical':d>=300?'warning':'normal'
}

function sample(arr:[string,number][],n=40):[string,number][]{ if(arr.length<=n)return arr;const s=Math.ceil(arr.length/n);return arr.filter((_,i)=>i%s===0) }
function tl(ts:string){const d=new Date(ts);return d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0')}

const levelOpt=computed(()=>{
  const d=sample(trend.value.map((p: HydrologySnapshot)=>[p.timestamp,p.upstreamLevel] as [string,number]))
  return{backgroundColor:'transparent',grid:{left:44,right:12,top:8,bottom:24},xAxis:{type:'category',data:d.map(x=>tl(x[0])),axisLine:{lineStyle:{color:'#e5e7eb'}},axisLabel:{color:'#9ca3af',fontSize:9,interval:Math.max(1,Math.floor(d.length/4))}},yAxis:{type:'value',min:377.5,max:379.5,splitLine:{lineStyle:{color:'#f3f4f6'}},axisLabel:{color:'#9ca3af',fontSize:10}},series:[{type:'line',data:d.map(x=>x[1]),smooth:true,symbol:'none',lineStyle:{color:'#1890ff',width:2},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(24,144,255,0.18)'},{offset:1,color:'rgba(24,144,255,0.02)'}]}}}],tooltip:{trigger:'axis',backgroundColor:'#fff',borderColor:'#e5e7eb',textStyle:{color:'#374151',fontSize:11}}}
})
const flowOpt=computed(()=>{
  const labels:string[]=[],iV:number[]=[],oV:number[]=[]
  sample(trend.value.map((p: HydrologySnapshot)=>[p.timestamp,p.inflowRate] as [string,number])).forEach((d: [string, number])=>{labels.push(tl(d[0]));iV.push(d[1])})
  sample(trend.value.map((p: HydrologySnapshot)=>[p.timestamp,p.outflowRate] as [string,number])).forEach((d: [string, number])=>oV.push(d[1]))
  return{backgroundColor:'transparent',grid:{left:50,right:12,top:8,bottom:24},xAxis:{type:'category',data:labels,axisLine:{lineStyle:{color:'#e5e7eb'}},axisLabel:{color:'#9ca3af',fontSize:9,interval:Math.max(1,Math.floor(labels.length/4))}},yAxis:{type:'value',splitLine:{lineStyle:{color:'#f3f4f6'}},axisLabel:{color:'#9ca3af',fontSize:10,formatter:(v:number)=>(v/1000).toFixed(1)+'k'}},legend:{data:['入库','出库'],textStyle:{color:'#6b7280',fontSize:10},right:0,top:0},series:[{name:'入库',type:'line',data:iV,smooth:true,symbol:'none',lineStyle:{color:'#1890ff',width:2}},{name:'出库',type:'line',data:oV,smooth:true,symbol:'none',lineStyle:{color:'#22c55e',width:2}}],tooltip:{trigger:'axis',backgroundColor:'#fff',borderColor:'#e5e7eb',textStyle:{color:'#374151',fontSize:11}}}
})

const mapEl=ref<HTMLDivElement|null>(null)
let map:L.Map|null=null
let stationLayer:L.LayerGroup|null=null
const DAM:[number,number][]=[[28.647,104.387],[28.641,104.391]]

function mkIcon(s:Station):L.DivIcon{
  const st=status(s);const c=SC[st]
  const pulse=st!=='normal'?`animation:sp ${st==='critical'?'0.7s':'1.6s'} infinite`:''
  return L.divIcon({className:'st-icon',html:`<div class="st-wrap"><div class="st-ring" style="${pulse};border-color:${c}"></div><div class="st-dot" style="background:${c};box-shadow:0 0 6px ${c}"></div></div><div class="st-nm">${s.name}</div>`,iconSize:[60,42],iconAnchor:[30,36]})
}
function refresh(){
  if(!stationLayer)return
  stationLayer.clearLayers()
  SS.forEach(s=>{const m=L.marker([s.lat,s.lng],{icon:mkIcon(s)});const st=status(s),v=sv(s),u=su(s.cat);m.bindPopup(`<div style="text-align:center;min-width:100px;font-size:13px">${s.name}<br><span style="font-size:22px;font-weight:700;color:${SC[st]}">${fmt(v,s.cat==='流量'?0:2)}</span><small style="color:#9ca3af;font-size:11px"> ${u}</small></div>`,{offset:[0,-6],className:'mpop'});stationLayer!.addLayer(m)})
}
function init(){
  if(!mapEl.value||map)return
  map=L.map(mapEl.value,{center:[28.644,104.389],zoom:14,zoomControl:false,attributionControl:false})
  L.control.zoom({position:'bottomright'}).addTo(map)
  L.tileLayer(T_IMG,{maxZoom:19,minZoom:1}).addTo(map)
  L.tileLayer(T_LBL,{maxZoom:19,minZoom:1}).addTo(map)
  L.polyline(DAM,{color:'#1f2937',weight:4,opacity:0.6}).addTo(map)
  const dm=L.latLng((DAM[0][0]+DAM[1][0])/2,(DAM[0][1]+DAM[1][1])/2)
  L.marker(dm,{icon:L.divIcon({className:'dam-icon',html:'⬟',iconSize:[20,20],iconAnchor:[10,10]})}).addTo(map)
  const arrows:[number,number,number][]=[[28.656,104.368,220],[28.637,104.406,50],[28.633,104.412,50]]
  arrows.forEach(([lat,lng,rot])=>L.marker([lat,lng],{icon:L.divIcon({className:'farr',html:`<span style="display:block;transform:rotate(${rot}deg)">▶</span>`,iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map!))
  stationLayer=L.layerGroup().addTo(map)
  refresh()
}
onMounted(()=>requestAnimationFrame(()=>init()))
onUnmounted(()=>{if(map){map.remove();map=null}})
const tmr=setInterval(()=>{if(map)refresh()},2000)
onUnmounted(()=>clearInterval(tmr))
watch(()=>snapshot.value.upstreamLevel,()=>refresh())
</script>

<template>
  <div class="hydro">
    <div ref="mapEl" class="hydro__map"/>
    <div class="hydro__top">
      <div class="kpi" v-for="k in [{l:'上游水位',v:snapshot.upstreamLevel,u:'m',d:2,w:snapshot.upstreamLevel>NORMAL+0.4},{l:'下游水位',v:snapshot.downstreamLevel,u:'m',d:2,w:false},{l:'入库流量',v:snapshot.inflowRate,u:'m³/s',d:0,w:false},{l:'出库流量',v:snapshot.outflowRate,u:'m³/s',d:0,w:false}]" :key="k.l">
        <span class="kpi__l">{{k.l}}</span>
        <span class="kpi__v" :class="{warn:k.w}">{{fmt(k.v,k.d)}}<small>{{k.u}}</small></span>
      </div>
      <span class="hydro__badge" :class="{mock:useMock,live:connected&&!useMock}"><span class="hydro__badge-dot"/>{{useMock?'模拟':'实时'}}</span>
    </div>
    <button class="hydro__btn" @click="drawerOpen=!drawerOpen">{{drawerOpen?'✕':'☰'}}</button>
    <Transition name="dr">
      <div v-if="drawerOpen" class="hydro__dr">
        <div class="hydro__dr-tt">实时图表</div>
        <div class="hydro__cb"><div class="hydro__cb-l">上游水位趋势</div><v-chart class="hydro__ch" :option="levelOpt" autoresize/></div>
        <div class="hydro__cb"><div class="hydro__cb-l">流量趋势 · 入库/出库</div><v-chart class="hydro__ch" :option="flowOpt" autoresize/></div>
        <div class="hydro__dr-tt" style="margin-top:8px">监测站点</div>
        <div v-for="s in SS" :key="s.id" class="hydro__stn">
          <span class="hydro__stn-d" :style="{background:SC[status(s)]}"/><span class="hydro__stn-n">{{s.name}}</span><span class="hydro__stn-v">{{fmt(sv(s),s.cat==='流量'?0:2)}}<small>{{su(s.cat)}}</small></span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.hydro{width:100%;height:calc(100vh - 56px);position:relative;overflow:hidden;background:#e8ecf0}
.hydro__map{width:100%;height:100%}
.hydro__top{position:absolute;top:12px;left:12px;z-index:600;display:flex;align-items:center;gap:10px}
.hydro__badge{display:flex;align-items:center;gap:5px;font-size:10px;padding:4px 10px;border-radius:12px;background:rgba(255,255,255,0.9);border:1px solid #e5e7eb;color:#6b7280;backdrop-filter:blur(8px)}
.hydro__badge.mock{border-color:#fde68a;background:rgba(255,251,235,0.9)}.hydro__badge.live{border-color:#bbf7d0;background:rgba(240,253,244,0.9)}
.hydro__badge-dot{width:6px;height:6px;border-radius:50%}.mock .hydro__badge-dot{background:#f59e0b;animation:kp 2s infinite}.live .hydro__badge-dot{background:#22c55e}
.hydro__btn{position:absolute;top:12px;right:12px;z-index:700;width:36px;height:36px;border-radius:8px;border:1px solid #e5e7eb;background:rgba(255,255,255,0.9);backdrop-filter:blur(8px);font-size:16px;color:#374151;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.08);transition:all 0.15s}
.hydro__btn:hover{background:#fff;border-color:#d1d5db}
.hydro__dr{position:absolute;top:0;right:0;bottom:0;width:340px;z-index:650;background:#fff;border-left:1px solid #e5e7eb;box-shadow:-4px 0 24px rgba(0,0,0,0.08);padding:56px 16px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.hydro__dr-tt{font-size:12px;font-weight:700;color:#374151;letter-spacing:0.5px;text-transform:uppercase}
.hydro__cb{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px}
.hydro__cb-l{font-size:11px;font-weight:600;color:#6b7280;margin-bottom:4px}
.hydro__ch{height:160px;width:100%}
.hydro__stn{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px}.hydro__stn:hover{background:#f9fafb}
.hydro__stn-d{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.hydro__stn-n{flex:1;font-size:12px;color:#374151}
.hydro__stn-v{font-size:13px;font-weight:700;color:#1f2937}.hydro__stn-v small{font-size:10px;font-weight:400;color:#9ca3af;margin-left:2px}
.kpi{padding:6px 14px;background:rgba(255,255,255,0.88);border:1px solid rgba(0,0,0,0.06);border-radius:8px;backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;gap:2px;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.kpi__l{font-size:10px;font-weight:500;color:#9ca3af;text-transform:uppercase;letter-spacing:0.3px}
.kpi__v{font-size:16px;font-weight:700;color:#1f2937;line-height:1.2}.kpi__v small{font-size:10px;font-weight:400;color:#9ca3af;margin-left:2px}.kpi__v.warn{color:#d97706}
.dr-enter-active,.dr-leave-active{transition:transform 0.25s ease}
.dr-enter-from,.dr-leave-to{transform:translateX(100%)}
@keyframes kp{0%,100%{opacity:1}50%{opacity:0.3}}
@keyframes sp{0%,100%{opacity:1}50%{opacity:0.4}}
</style>

<style lang="scss">
.main-layout__content:has(.hydro){padding:0!important;overflow:hidden!important}
.leaflet-container{background:#e8ecf0}
.leaflet-control-zoom{z-index:700!important}
.st-icon{text-align:center}.st-wrap{display:inline-block;position:relative;width:24px;height:24px}.st-ring{position:absolute;inset:-2px;border-radius:50%;border:2px solid;animation:m-ring 2.5s ease-out infinite}.st-dot{position:absolute;inset:6px;border-radius:50%}.st-nm{font-size:10px;font-weight:600;color:#374151;margin-top:2px;white-space:nowrap;text-shadow:0 1px 2px rgba(255,255,255,0.8)}
@keyframes m-ring{0%{transform:scale(1);opacity:0.5}100%{transform:scale(2.2);opacity:0}}
.dam-icon{font-size:16px!important;color:#1f2937!important;text-align:center;line-height:20px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.2))}
.farr span{color:rgba(0,0,0,0.2);font-size:12px}
.mpop{.leaflet-popup-content-wrapper{background:#fff!important;border:1px solid #e5e7eb!important;border-radius:10px!important;box-shadow:0 4px 20px rgba(0,0,0,0.1)!important}.leaflet-popup-content{margin:10px 14px!important}.leaflet-popup-tip{background:#fff!important}.leaflet-popup-close-button{color:#9ca3af!important}}
</style>
