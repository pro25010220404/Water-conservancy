<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const usbStream = ref<MediaStream|null>(null)
const usbConnected = ref(false)
const usbDevices = ref<MediaDeviceInfo[]>([])
const vidEl = ref<HTMLVideoElement|null>(null)

onMounted(async()=>{try{const d=await navigator.mediaDevices.enumerateDevices();usbDevices.value=d.filter(x=>x.kind==='videoinput');if(usbDevices.value.length>0)await startUSBCamera()}catch{}})
async function startUSBCamera(){try{const s=await navigator.mediaDevices.getUserMedia({video:{width:640,height:480}});usbStream.value=s;usbConnected.value=true;if(vidEl.value){vidEl.value.srcObject=s;vidEl.value.play().catch(()=>{})}}catch(e:any){usbConnected.value=false}}
onUnmounted(()=>{usbStream.value?.getTracks().forEach(t=>t.stop())})

const cameras=[{id:'c1',name:'坝顶 1#',area:'坝顶',status:'online' as const,motion:'2分钟前'},{id:'c2',name:'坝顶 2#',area:'坝顶',status:'online' as const,motion:'刚刚'},{id:'c3',name:'厂房入口',area:'厂房',status:'online' as const,motion:'5分钟前'},{id:'c4',name:'中控室',area:'厂房',status:'online' as const,motion:'—'},{id:'c5',name:'下游河道',area:'下游',status:'offline' as const,motion:'—'},{id:'c6',name:'开关站',area:'下游',status:'online' as const,motion:'1小时前'}]
const doors=[{id:'d1',name:'主厂房大门',status:'locked' as const,last:'14:25 张工'},{id:'d2',name:'中控室',status:'locked' as const,last:'14:10 李工'},{id:'d3',name:'GIS 室',status:'locked' as const,last:'—'},{id:'d4',name:'坝顶通道',status:'unlocked' as const,last:'13:50 巡检员'}]
const patrols=[{time:'09:30',route:'坝顶 → 厂房 → 下游',person:'王巡检',result:'正常',dur:'45分钟'},{time:'14:00',route:'GIS室 → 开关站 → 中控',person:'赵巡检',result:'正常',dur:'38分钟'},{time:'18:30',route:'坝顶 → 下游河道 → 厂房',person:'王巡检',result:'待执行',dur:'—'}]
const alarms=[{time:'12:05',loc:'下游河道',type:'周界入侵',level:'warning',status:'已处理'},{time:'08:22',loc:'开关站',type:'门禁异常',level:'critical',status:'已处理'}]

const sc:Record<string,{color:string;label:string}>={online:{color:'#22c55e',label:'在线'},offline:{color:'#94a3b8',label:'离线'},locked:{color:'#22c55e',label:'已锁'},unlocked:{color:'#f59e0b',label:'未锁'}}
const alc:Record<string,string>={warning:'#f59e0b',critical:'#ef4444'}
</script>

<template>
  <div class="sp">
    <div class="kpis">
      <div class="kpi"><span class="kpi__d" style="background:#3b82f6"/><span class="kpi__l">摄像头</span><span class="kpi__v">{{ cameras.filter(c=>c.status==='online').length }}<small> / {{ cameras.length }}</small></span></div>
      <div class="kpi"><span class="kpi__d" style="background:#22c55e"/><span class="kpi__l">门禁正常</span><span class="kpi__v">{{ doors.filter(d=>d.status==='locked').length }}<small> / {{ doors.length }}</small></span></div>
      <div class="kpi"><span class="kpi__d" style="background:#22c55e"/><span class="kpi__l">巡检完成</span><span class="kpi__v">{{ patrols.filter(p=>p.result==='正常').length }}<small> / {{ patrols.length }}</small></span></div>
      <div class="kpi"><span class="kpi__d" style="background:#d1d5db"/><span class="kpi__l">今日告警</span><span class="kpi__v">{{ alarms.length }}<small> 条</small></span></div>
    </div>

    <div class="main">
      <div class="cams">
        <div class="cams__t">视频监控
          <span class="cams__st"><span :class="{on:usbConnected}">{{ usbConnected ? '● 已连接' : '○ 无信号' }}</span>
          <button @click="startUSBCamera()" class="btn">重新连接</button></span>
        </div>
        <div class="cams__g">
          <div v-for="c in cameras" :key="c.id" class="cam" :class="{off:c.status==='offline'}">
            <div class="cam__f">
              <video v-if="c.id==='c1'" ref="vidEl" autoplay muted playsinline class="cam__v" :class="{show:usbConnected}"/>
              <svg v-if="c.id!=='c1'||!usbConnected" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              <div class="cam__ol"><span>{{ c.area }}</span><span :class="c.status">{{ sc[c.status].label }}</span></div>
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
          <div v-for="p in patrols" :key="p.time" class="pr" :class="{pen:p.result==='待执行'}"><span class="pr__t">{{ p.time }}</span><span class="pr__r">{{ p.route }}</span><span>{{ p.person }}</span><span :style="{color:p.result==='正常'?'#22c55e':p.result==='待执行'?'#f59e0b':'#6b7280'}">{{ p.result }}</span></div>
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
.sp{height:calc(100vh - 56px);display:flex;flex-direction:column;background:#f5f6f8;overflow:hidden}
.kpis{display:flex;gap:0;padding:0 28px;background:#fff;border-bottom:1px solid #eef0f2;flex-shrink:0}
.kpi{flex:1;display:flex;align-items:center;gap:8px;padding:14px 0}
.kpi__d{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.kpi__l{font-size:13px;color:#8b9198}
.kpi__v{font-size:18px;font-weight:700;color:#1e293b;font-family:'SF Mono',monospace;margin-left:auto;small{font-size:11px;font-weight:400;color:#94a3b8;margin-left:4px}}

.main{flex:1;display:flex;gap:16px;padding:16px 28px;min-height:0;overflow:hidden}
.cams{flex:1;display:flex;flex-direction:column;min-width:0}
.cams__t{font-size:15px;font-weight:600;color:#374151;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.cams__st{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:400}
.cams__st span{color:#94a3b8}.cams__st span.on{color:#22c55e;font-weight:600}
.btn{padding:3px 10px;border:1px solid #d1d5db;background:#fff;border-radius:4px;font-size:11px;cursor:pointer;color:#64748b}
.btn:hover{background:#f3f4f6}
.cams__g{flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:8px;min-height:0}
.cam{background:#1a1a2e;border:1px solid #2a2a3e;border-radius:6px;overflow:hidden;display:flex;flex-direction:column}
.cam.off{opacity:.5}
.cam__f{flex:1;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;color:rgba(255,255,255,.05);overflow:hidden}
.cam__v{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}
.cam__v.show{display:block}
.cam__ol{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;padding:5px 8px}
.cam__ol span:first-child{font-size:10px;color:rgba(255,255,255,.45);background:rgba(0,0,0,.55);padding:1px 6px;border-radius:3px}
.cam__ol span:last-child{font-size:10px;font-weight:600;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:3px}
.cam__ol .online{color:#22c55e}.cam__ol .offline{color:#94a3b8}
.cam__bt{display:flex;justify-content:space-between;padding:9px 12px;font-size:13px;background:#fff;font-weight:500;color:#374151}
.cam__bt span:last-child{color:#94a3b8;font-size:12px;font-weight:400}

.right{width:340px;flex-shrink:0;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.pn{background:#fff;border:1px solid #eef0f2;border-radius:8px;padding:14px 16px}
.pn__t{font-size:14px;font-weight:600;color:#374151;margin-bottom:10px}
.dr{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;&+&{border-top:1px solid #f8f9fb}}
.dr__d{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dr__n{flex:1;color:#374151}
.dr__s{font-weight:600;font-size:12px}
.dr__l{color:#94a3b8;font-size:12px}
.pr{display:flex;gap:8px;padding:5px 0;font-size:13px;color:#64748b;align-items:center;&+&{border-top:1px solid #f8f9fb}}
.pr.pen{opacity:.5}
.pr__t{color:#94a3b8;font-family:'SF Mono',monospace;font-size:11px;min-width:40px}
.pr__r{flex:1;color:#374151;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.al{display:flex;gap:8px;padding:6px 0;&+&{border-top:1px solid #f8f9fb}}
.al__d{width:7px;height:7px;border-radius:50%;margin-top:4px;flex-shrink:0}
.al__h{font-size:13px;color:#374151;b{font-weight:600}}
.al__f{font-size:11px;color:#94a3b8;margin-top:2px}
</style>

<style lang="scss">
.main-layout__content:has(.sp){padding:0!important;overflow:hidden!important}
</style>
