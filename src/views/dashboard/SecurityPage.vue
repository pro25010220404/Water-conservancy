<script setup lang="ts">
import { ref } from 'vue'

const cameras = ref([
  { id:'c1',name:'坝顶 1#',area:'坝顶',status:'online' as const,motion:'2分钟前' },
  { id:'c2',name:'坝顶 2#',area:'坝顶',status:'online' as const,motion:'刚刚' },
  { id:'c3',name:'厂房入口',area:'厂房',status:'online' as const,motion:'5分钟前' },
  { id:'c4',name:'中控室',area:'厂房',status:'online' as const,motion:'—' },
  { id:'c5',name:'下游河道',area:'下游',status:'offline' as const,motion:'—' },
  { id:'c6',name:'开关站',area:'下游',status:'online' as const,motion:'1小时前' },
])

const doors = ref([
  { id:'d1',name:'主厂房大门',status:'locked' as const,last:'14:25 张工' },
  { id:'d2',name:'中控室',status:'locked' as const,last:'14:10 李工' },
  { id:'d3',name:'GIS 室',status:'locked' as const,last:'—' },
  { id:'d4',name:'坝顶通道',status:'unlocked' as const,last:'13:50 巡检员' },
])

const patrols = ref([
  { time:'09:30',route:'坝顶 → 厂房 → 下游',person:'王巡检',result:'正常',dur:'45分钟' },
  { time:'14:00',route:'GIS室 → 开关站 → 中控',person:'赵巡检',result:'正常',dur:'38分钟' },
  { time:'18:30',route:'坝顶 → 下游河道 → 厂房',person:'王巡检',result:'待执行',dur:'—' },
])

const alarms = ref([
  { time:'12:05',loc:'下游河道',type:'周界入侵',level:'warning',status:'已处理' },
  { time:'08:22',loc:'开关站',type:'门禁异常',level:'critical',status:'已处理' },
])

const sc:Record<string,{color:string;label:string}> = {
  online:{color:'#22c55e',label:'在线'},offline:{color:'#94a3b8',label:'离线'},
  locked:{color:'#22c55e',label:'已锁'},unlocked:{color:'#f59e0b',label:'未锁'},
}
const alc:Record<string,string> = {warning:'#f59e0b',critical:'#ef4444'}
</script>

<template>
  <div class="sp">
    <div class="kpis">
      <div class="kpi"><span class="kpi__d" style="background:#3b82f6"/><span class="kpi__l">摄像头</span><span class="kpi__v">{{ cameras.length }}<small> 路</small></span></div>
      <div class="kpi"><span class="kpi__d" style="background:#22c55e"/><span class="kpi__l">在线</span><span class="kpi__v">{{ cameras.filter(c=>c.status==='online').length }}<small> 路</small></span></div>
      <div class="kpi"><span class="kpi__d" style="background:#22c55e"/><span class="kpi__l">门禁正常</span><span class="kpi__v">{{ doors.filter(d=>d.status==='locked').length }}<small> /{{doors.length}}</small></span></div>
      <div class="kpi"><span class="kpi__d" style="background:#d1d5db"/><span class="kpi__l">周界告警</span><span class="kpi__v">{{ alarms.filter(a=>a.level==='critical').length }}<small> 条</small></span></div>
    </div>

    <div class="main">
      <div class="cams">
        <div class="cams__t">视频监控</div>
        <div class="cams__g">
          <div v-for="c in cameras" :key="c.id" class="cam" :class="{off:c.status==='offline'}">
            <div class="cam__f">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              <div class="cam__ol">
                <span class="cam__ar">{{ c.area }}</span>
                <span class="cam__st" :class="c.status">{{ sc[c.status].label }}</span>
              </div>
            </div>
            <div class="cam__bt"><span>{{ c.name }}</span><span>{{ c.motion }}</span></div>
          </div>
        </div>
      </div>

      <div class="right">
        <div class="pn">
          <div class="pn__t">门禁状态</div>
          <div v-for="d in doors" :key="d.id" class="dr"><span class="dr__d" :style="{background:sc[d.status].color}"/><span class="dr__n">{{ d.name }}</span><span class="dr__s" :style="{color:sc[d.status].color}">{{ sc[d.status].label }}</span><span class="dr__l">{{ d.last }}</span></div>
        </div>
        <div class="pn">
          <div class="pn__t">巡检记录</div>
          <div v-for="p in patrols" :key="p.time" class="pr" :class="{pen:p.result==='待执行'}">
            <span class="pr__t">{{ p.time }}</span><span class="pr__r">{{ p.route }}</span><span>{{ p.person }}</span><span :style="{color:p.result==='正常'?'#22c55e':p.result==='待执行'?'#f59e0b':'#6b7280'}">{{ p.result }}</span>
          </div>
        </div>
        <div class="pn">
          <div class="pn__t">最近告警</div>
          <div v-for="a in alarms" :key="a.time" class="al"><span class="al__d" :style="{background:alc[a.level]}"/><div><div class="al__h"><b>{{ a.loc }}</b> · {{ a.type }}</div><div class="al__f">{{ a.time }} · {{ a.status }}</div></div></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sp { height:calc(100vh - 56px); display:flex; flex-direction:column; background:#f5f6f8; overflow:hidden; }
.kpis { display:flex; align-items:center; gap:24px; padding:16px 28px; background:#fff; border-bottom:1px solid #eef0f2; flex-shrink:0; }
.kpi { display:flex; align-items:center; gap:8px; }
.kpi__d { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.kpi__l { font-size:14px; color:#8b9198; }
.kpi__v { font-size:20px; font-weight:700; color:#1e293b; font-family:'SF Mono','Cascadia Code',monospace; small{font-size:12px;font-weight:400;color:#94a3b8;margin-left:2px;} }

.main { flex:1; display:flex; gap:16px; padding:16px 24px; min-height:0; overflow:hidden; }
.cams { flex:1; display:flex; flex-direction:column; min-width:0; }
.cams__t { font-size:15px; font-weight:600; color:#374151; margin-bottom:10px; line-height:38px; }
.cams__g { flex:1; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(2,1fr); gap:10px; min-height:0; }
.cam { background:#1a1a2e; border:1px solid #2a2a3e; border-radius:6px; overflow:hidden; display:flex; flex-direction:column; }
.cam.off { opacity:.5; }
.cam__f { flex:1; position:relative; display:flex; align-items:center; justify-content:center; min-height:0; color:rgba(255,255,255,.06); }
.cam__ol { position:absolute; top:0; left:0; right:0; display:flex; justify-content:space-between; padding:6px 8px; }
.cam__ar { font-size:11px; color:rgba(255,255,255,.5); background:rgba(0,0,0,.6); padding:2px 8px; border-radius:3px; }
.cam__st { font-size:11px; font-weight:600; padding:2px 8px; border-radius:3px; background:rgba(0,0,0,.6); }
.online .cam__st { color:#22c55e; } .off .cam__st { color:#94a3b8; }
.cam__bt { display:flex; justify-content:space-between; padding:10px 12px; font-size:14px; background:#fff; font-weight:500; color:#374151; }
.cam__bt span:last-child { color:#94a3b8; font-size:13px; font-weight:400; }

.right { width:380px; flex-shrink:0; display:flex; flex-direction:column; gap:16px; overflow-y:auto; }
.pn { background:#fff; border:1px solid #eef0f2; border-radius:8px; padding:14px 18px; }
.pn:first-child { padding-top:10px; }
.pn__t { font-size:15px; font-weight:600; color:#374151; margin-bottom:10px; line-height:28px; }

.dr { display:flex; align-items:center; gap:10px; padding:8px 0; font-size:14px; &+&{border-top:1px solid #f8f9fb} }
.dr__d { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.dr__n { flex:1; color:#374151; }
.dr__s { font-weight:600; }
.dr__l { color:#94a3b8; }

.pr { display:flex; gap:10px; padding:7px 0; font-size:14px; color:#475569; align-items:center; &+&{border-top:1px solid #f8f9fb} }
.pr.pen { opacity:.5; }
.pr__t { color:#94a3b8; font-family:'SF Mono',monospace; font-size:12px; min-width:38px; }
.pr__r { flex:1; color:#374151; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

.al { display:flex; gap:10px; padding:7px 0; &+&{border-top:1px solid #f8f9fb} }
.al__d { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
.al__h { font-size:14px; color:#374151; b{font-weight:600} }
.al__f { font-size:13px; color:#94a3b8; margin-top:2px; }
</style>

<style lang="scss">
.main-layout__content:has(.sp) { padding:0 !important; overflow:hidden !important; }
</style>
