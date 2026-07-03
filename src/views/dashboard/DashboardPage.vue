<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()

const data = ref({ upstreamLevel:378.52, downstreamLevel:269.18, inflowRate:6350, outflowRate:5820, powerOutput:4119, gateOpening:34, capacity:48.36 })
let t:ReturnType<typeof setInterval>
onMounted(()=>{t=setInterval(()=>{
  data.value.upstreamLevel=+(data.value.upstreamLevel+(Math.random()-.5)*0.1).toFixed(2)
  data.value.powerOutput=+(data.value.powerOutput+(Math.random()-.5)*15).toFixed(0)
},3000)})
onUnmounted(()=>clearInterval(t))
const fmt=(v:number,d=2)=>v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d})

const expanded = ref<string|null>(null)
function toggle(id:string){expanded.value=expanded.value===id?null:id}

const sections = [
  { id:'hydrology', title:'水情监测', path:'/dashboard/hydrology',
    preview:[{l:'上游水位',v:'378.52 m'},{l:'入库流量',v:'6,350 m³/s'}],
    detail:[{l:'上游水位',v:'378.52',u:'m'},{l:'下游水位',v:'269.18',u:'m'},{l:'入库流量',v:'6,350',u:'m³/s'},{l:'出库流量',v:'5,820',u:'m³/s'},{l:'库容',v:'48.36',u:'亿m³'},{l:'水头',v:'109.34',u:'m'}] },
  { id:'gate', title:'闸门检测', path:'/dashboard/gate',
    preview:[{l:'平均开度',v:'34.0 %'},{l:'运行中',v:'8 扇'}],
    detail:[{l:'表孔 1-8#',v:'34.0',u:'%'},{l:'中孔 1-2#',v:'22.0',u:'%'},{l:'底孔 1-2#',v:'0.0',u:'%'},{l:'最近动作',v:'14:08',u:''},{l:'动作耗时',v:'12',u:'s'},{l:'操作模式',v:'AI-DQN',u:''}] },
  { id:'power', title:'发电检测', path:'/dashboard/power',
    preview:[{l:'总出力',v:'4,119 MW'},{l:'今日发电',v:'1,248 万kWh'}],
    detail:[{l:'1#机组',v:'685',u:'MW'},{l:'2#机组',v:'692',u:'MW'},{l:'4#机组',v:'678',u:'MW'},{l:'5#机组',v:'688',u:'MW'},{l:'7#机组',v:'695',u:'MW'},{l:'8#机组',v:'681',u:'MW'}] },
  { id:'security', title:'安防检测', path:'/dashboard/security',
    preview:[{l:'摄像头',v:'5/6 在线'},{l:'今日告警',v:'2 条'}],
    detail:[{l:'摄像头在线',v:'5/6',u:'路'},{l:'门禁已锁',v:'3/4',u:'扇'},{l:'今日告警',v:'2',u:'条'},{l:'巡检完成',v:'2/3',u:'条'},{l:'周界安全',v:'5/6',u:'区'},{l:'最近事件',v:'12:05',u:''}] },
]

const alarms = [
  { time:'14:32', level:'warning' as const, msg:'1#边缘网关 CPU 使用率 88%', status:'未处理' },
  { time:'12:05', level:'warning' as const, msg:'下游河道周界入侵告警', status:'已确认' },
  { time:'08:22', level:'critical' as const, msg:'开关站门禁异常开启', status:'已处理' },
]
</script>

<template>
  <div class="dp">
    <div class="hd">
      <div>
        <h1>综合概览</h1>
        <p>向家坝水电站 · {{ new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}) }}</p>
      </div>
      <span class="hd__status"><i/> 系统运行中</span>
    </div>

    <div class="hero">
      <div class="kpi"><span>上游水位</span><b>{{ fmt(data.upstreamLevel) }}<small>m</small></b></div>
      <div class="kpi"><span>入库流量</span><b>{{ fmt(data.inflowRate,0) }}<small>m³/s</small></b></div>
      <div class="kpi"><span>发电功率</span><b style="color:#3b82f6">{{ fmt(data.powerOutput,0) }}<small>MW</small></b></div>
      <div class="kpi"><span>闸门开度</span><b>{{ fmt(data.gateOpening,1) }}<small>%</small></b></div>
      <div class="kpi"><span>库容</span><b>{{ fmt(data.capacity) }}<small>亿m³</small></b></div>
    </div>

    <div class="main">
      <div class="col col--wide">
        <div class="list">
          <div v-for="s in sections" :key="s.id" class="sec" :class="{on:expanded===s.id}" @click="toggle(s.id)">
            <div class="sec__top">
              <span class="sec__t">{{ s.title }}</span>
              <span class="sec__pre" v-if="expanded!==s.id">
                <span v-for="p in s.preview" :key="p.l">{{ p.l }} <b>{{ p.v }}</b></span>
              </span>
              <span class="sec__arr">{{ expanded===s.id ? '收起' : '展开' }}</span>
            </div>
            <div class="sec__body" v-if="expanded===s.id">
              <div class="sec__grid">
                <div v-for="d in s.detail" :key="d.l" class="st">
                  <span class="st__l">{{ d.l }}</span>
                  <span class="st__v">{{ d.v }}<small>{{ d.u }}</small></span>
                </div>
              </div>
              <button class="sec__btn" @click.stop="router.push(s.path)">进入 {{ s.title }} 完整页面 →</button>
            </div>
          </div>
        </div>
      </div>
      <div class="col col--side">
        <div class="panel">
          <h2>实时告警</h2>
          <div v-for="a in alarms" :key="a.time" class="al">
            <span class="al__d" :class="a.level"/>
            <div>
              <div class="al__m">{{ a.msg }}</div>
              <div class="al__f">{{ a.time }} · {{ a.status }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dp{height:calc(100vh - 56px);display:flex;flex-direction:column;background:#f5f6f8}

.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:32px 40px 28px;background:#fff;border-bottom:1px solid #eef0f2;flex-shrink:0}
.hd h1{font-size:26px;font-weight:700;color:#0f172a;margin:0;letter-spacing:-0.5px}
.hd p{font-size:13px;color:#94a3b8;margin:4px 0 0}
.hd__status{display:flex;align-items:center;gap:6px;font-size:13px;color:#16a34a;font-weight:500}
.hd__status i{display:block;width:7px;height:7px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite}

.hero{display:flex;padding:0 40px;background:#fff;border-bottom:1px solid #eef0f2;flex-shrink:0}
.kpi{flex:1;padding:20px 0;text-align:center;border-right:1px solid #f1f5f9}
.kpi:last-child{border-right:none}
.kpi span{display:block;font-size:12px;color:#8b9198;margin-bottom:6px;font-weight:500}
.kpi b{font-size:32px;font-weight:700;color:#0f172a;font-family:'SF Mono','Cascadia Code',monospace;line-height:1}
.kpi b small{font-size:13px;font-weight:400;color:#94a3b8;margin-left:4px}

.main{flex:1;display:flex;gap:20px;padding:20px 40px;min-height:0;overflow:hidden}
.col--wide{flex:1.5;overflow-y:auto}
.col--side{flex:1;overflow-y:auto}

.list{display:flex;flex-direction:column;gap:8px}
.sec{background:#fff;border:1px solid #eef0f4;border-radius:8px;cursor:pointer;transition:all 0.15s;overflow:hidden}
.sec:hover{border-color:#dde4f0}
.sec.on{border-color:#d0d8e8;box-shadow:0 2px 12px rgba(0,0,0,0.03)}
.sec__top{display:flex;align-items:center;gap:16px;padding:22px 24px}
.sec__t{font-size:16px;font-weight:600;color:#1f2937;min-width:88px}
.sec__pre{display:flex;gap:24px;flex:1}
.sec__pre span{font-size:12px;color:#94a3b8}
.sec__pre b{font-weight:600;color:#64748b;margin-left:6px}
.sec__arr{font-size:12px;color:#9ca3af;font-weight:500;white-space:nowrap}
.sec.on .sec__arr{color:#3b82f6}

.sec__body{padding:0 24px 22px 112px}
.sec__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.st{text-align:center;padding:12px 8px;background:#f8fafc;border-radius:6px}
.st__l{display:block;font-size:11px;color:#94a3b8;margin-bottom:4px}
.st__v{font-size:20px;font-weight:700;color:#1e293b;font-family:'SF Mono',monospace}
.st__v small{font-size:11px;font-weight:400;color:#94a3b8;margin-left:2px}
.sec__btn{padding:8px 18px;border:1px solid #d1d5db;background:#fff;border-radius:6px;font-size:12px;cursor:pointer;color:#64748b;font-weight:500}
.sec__btn:hover{background:#f3f4f6;border-color:#9ca3af}

.panel{background:#fff;border:1px solid #eef0f4;border-radius:8px;padding:22px 24px}
.panel h2{font-size:16px;font-weight:600;color:#1f2937;margin:0 0 16px}
.al{display:flex;gap:10px;padding:10px 0;&+&{border-top:1px solid #f8f9fb}}
.al__d{width:8px;height:8px;border-radius:50%;margin-top:4px;flex-shrink:0;background:#f59e0b}
.al__d.critical{background:#ef4444}
.al__d.warning{background:#f59e0b}
.al__m{font-size:13px;color:#374151;font-weight:500}
.al__f{font-size:11px;color:#94a3b8;margin-top:3px}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style>

<style lang="scss">
.main-layout__content:has(.dp){padding:0!important;overflow:hidden!important}
</style>
