<script setup lang="ts">
// ============================================================
// 闸门检测 — 向家坝泄洪闸门状态与操作记录
// ============================================================
import { ref, onMounted, onUnmounted, computed } from 'vue'

// ═══ 模拟数据 ═══
interface Gate {
  id: string; name: string; type: 'spillway' | 'outlet' | 'bottom'
  opening: number; target: number; status: 'idle' | 'moving' | 'alarm' | 'maintenance'
  lastAction: string; lastDuration: number
}
interface OpLog { time: string; gate: string; from: number; to: number; duration: number; mode: string; result: string }

function r(n: number, d = 1) { return +(Math.random() * n + d).toFixed(1) }
function ago(m: number) { const t = new Date(Date.now() - m * 60000); return t.toLocaleTimeString('zh-CN') }

const gates = ref<Gate[]>([
  { id:'g1',name:'1# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g2',name:'2# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g3',name:'3# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g4',name:'4# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g5',name:'5# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g6',name:'6# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g7',name:'7# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'g8',name:'8# 表孔',type:'spillway',opening:r(40,20),target:r(40,20),status:'idle',lastAction:ago(r(120,5)),lastDuration:r(30,5)},
  { id:'o1',name:'1# 中孔',type:'outlet',opening:r(30,10),target:r(30,10),status:'idle',lastAction:ago(r(200,10)),lastDuration:r(20,3)},
  { id:'o2',name:'2# 中孔',type:'outlet',opening:r(30,10),target:r(30,10),status:'idle',lastAction:ago(r(200,10)),lastDuration:r(20,3)},
  { id:'o3',name:'3# 中孔',type:'outlet',opening:r(30,10),target:r(30,10),status:'idle',lastAction:ago(r(200,10)),lastDuration:r(20,3)},
  { id:'o4',name:'4# 中孔',type:'outlet',opening:r(30,10),target:r(30,10),status:'idle',lastAction:ago(r(200,10)),lastDuration:r(20,3)},
  { id:'b1',name:'1# 底孔',type:'bottom',opening:0,target:0,status:'idle',lastAction:ago(r(500,30)),lastDuration:r(15,2)},
  { id:'b2',name:'2# 底孔',type:'bottom',opening:0,target:0,status:'idle',lastAction:ago(r(500,30)),lastDuration:r(15,2)},
])

const logs = ref<OpLog[]>([
  { time: ago(8), gate:'3# 表孔', from:32.5, to:28.0, duration:12, mode:'AI调度', result:'成功' },
  { time: ago(23), gate:'1# 中孔', from:15.0, to:20.0, duration:8, mode:'人工操作', result:'成功' },
  { time: ago(45), gate:'5# 表孔', from:28.0, to:35.0, duration:15, mode:'LSTM调度', result:'成功' },
  { time: ago(68), gate:'2# 表孔', from:35.0, to:30.0, duration:11, mode:'AI调度', result:'成功' },
  { time: ago(120), gate:'1# 底孔', from:5.0, to:0.0, duration:6, mode:'人工操作', result:'成功' },
  { time: ago(180), gate:'7# 表孔', from:40.0, to:32.0, duration:14, mode:'急停恢复', result:'成功' },
  { time: ago(260), gate:'4# 中孔', from:10.0, to:15.0, duration:7, mode:'AI调度', result:'成功' },
  { time: ago(400), gate:'6# 表孔', from:25.0, to:35.0, duration:18, mode:'LSTM调度', result:'成功' },
])

// 定时更新开度，模拟实时变化
let timer: ReturnType<typeof setInterval>
onMounted(() => { timer = setInterval(() => { gates.value.forEach(g => { if (g.status === 'idle') g.opening = +(g.opening + (Math.random()-0.5)*0.3).toFixed(1) }) }, 2000) })
onUnmounted(() => clearInterval(timer))

// ═══ 统计 ═══
const stats = computed(() => ({
  total: gates.value.length,
  avgOpening: +(gates.value.reduce((s,g)=>s+g.opening,0)/gates.value.length).toFixed(1),
  alarm: gates.value.filter(g=>g.status==='alarm').length,
  moving: gates.value.filter(g=>g.status==='moving').length,
}))

// ═══ 状态色 ═══
const statusColor: Record<string,string> = { idle:'#22c55e', moving:'#1890ff', alarm:'#ef4444', maintenance:'#f59e0b' }
const statusLabel: Record<string,string> = { idle:'正常', moving:'动作中', alarm:'告警', maintenance:'检修' }
const typeLabel: Record<string,string> = { spillway:'表孔泄洪闸', outlet:'中孔', bottom:'底孔' }
</script>

<template>
  <div class="gate">
    <!-- KPI -->
    <div class="gate__kpis">
      <div class="kpi"><span class="kpi__l">闸门总数</span><span class="kpi__v">{{ stats.total }}<small>扇</small></span></div>
      <div class="kpi"><span class="kpi__l">平均开度</span><span class="kpi__v">{{ stats.avgOpening }}<small>%</small></span></div>
      <div class="kpi"><span class="kpi__l">动作中</span><span class="kpi__v" style="color:#1890ff">{{ stats.moving }}<small>扇</small></span></div>
      <div class="kpi"><span class="kpi__l">告警</span><span class="kpi__v" :style="{color:stats.alarm?'#ef4444':'#22c55e'}">{{ stats.alarm }}<small>扇</small></span></div>
    </div>

    <!-- 闸门网格 -->
    <div class="gate__grid">
      <template v-for="t in (['spillway','outlet','bottom'] as const)" :key="t">
        <div class="gate__section">
          <div class="gate__section-title">{{ typeLabel[t] }} <span>({{ gates.filter(g=>g.type===t).length }} 扇)</span></div>
          <div class="gate__cards">
            <div v-for="g in gates.filter(x=>x.type===t)" :key="g.id" class="gcard" :class="g.status">
              <div class="gcard__head">
                <span class="gcard__dot" :style="{background:statusColor[g.status]}" />
                <span class="gcard__name">{{ g.name }}</span>
                <span class="gcard__status" :style="{color:statusColor[g.status]}">{{ statusLabel[g.status] }}</span>
              </div>
              <div class="gcard__bar-wrap">
                <div class="gcard__bar" :style="{width:g.opening+'%'}">
                  <span class="gcard__bar-val" v-if="g.opening>8">{{ g.opening }}%</span>
                </div>
              </div>
              <div class="gcard__foot">
                <span>上次动作 {{ g.lastAction }}</span>
                <span v-if="g.target!==g.opening">目标 {{ g.target }}%</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 操作记录 -->
    <div class="gate__log">
      <div class="gate__section-title">最近操作记录</div>
      <table class="gate__table">
        <thead><tr><th>时间</th><th>闸门</th><th>动作</th><th>耗时</th><th>模式</th><th>结果</th></tr></thead>
        <tbody>
          <tr v-for="l in logs" :key="l.time+l.gate">
            <td>{{ l.time }}</td>
            <td>{{ l.gate }}</td>
            <td>{{ l.from }}% → {{ l.to }}%</td>
            <td>{{ l.duration }}s</td>
            <td>{{ l.mode }}</td>
            <td><span :style="{color:l.result==='成功'?'#22c55e':'#ef4444'}">{{ l.result }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gate { padding: 20px 24px; height: calc(100vh - 56px); overflow-y: auto; background: var(--color-bg-dark); }

.gate__kpis { display: flex; gap: 16px; margin-bottom: 20px; }
.kpi { flex:1; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px 20px; display:flex; flex-direction:column; gap:4px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.kpi__l { font-size:11px; font-weight:500; color:#9ca3af; text-transform:uppercase; letter-spacing:0.5px; }
.kpi__v { font-size:24px; font-weight:700; color:#1f2937; small{font-size:12px;font-weight:400;color:#9ca3af;margin-left:4px;} }

.gate__section { margin-bottom: 16px; }
.gate__section-title { font-size:13px; font-weight:700; color:#374151; margin-bottom:10px; letter-spacing:0.3px; text-transform:uppercase;
  span { font-weight:400; color:#9ca3af; font-size:11px; text-transform:none; }
}

.gate__cards { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }

.gcard {
  background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:14px; transition:all 0.2s;
  box-shadow:0 1px 3px rgba(0,0,0,0.04);
  &:hover { border-color:#d1d5db; box-shadow:0 2px 8px rgba(0,0,0,0.06); }
  &.alarm { border-color:#fecaca; background:#fef2f2; }
  &.moving .gcard__dot { animation:kp 1.2s infinite; }
}
.gcard__head { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.gcard__dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.gcard__name { font-size:13px; font-weight:600; color:#1f2937; flex:1; }
.gcard__status { font-size:10px; font-weight:600; }
.gcard__bar-wrap { height:24px; background:#f3f4f6; border-radius:6px; overflow:hidden; margin-bottom:8px; position:relative; }
.gcard__bar { height:100%; background:linear-gradient(90deg,#1890ff,#40a9ff); border-radius:6px; transition:width 0.6s ease; display:flex; align-items:center; justify-content:flex-end; padding-right:8px; min-width:0; }
.gcard__bar-val { font-size:10px; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.2); }
.gcard__foot { display:flex; justify-content:space-between; font-size:10px; color:#9ca3af; }

.gate__log { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px 20px; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.gate__table { width:100%; border-collapse:collapse; font-size:12px;
  th { text-align:left; padding:8px 12px; color:#9ca3af; font-weight:500; font-size:10px; text-transform:uppercase; letter-spacing:0.3px; border-bottom:1px solid #e5e7eb; }
  td { padding:8px 12px; color:#374151; border-bottom:1px solid #f3f4f6; }
  tr:hover td { background:#f9fafb; }
}

@keyframes kp { 0%,100%{opacity:1} 50%{opacity:0.3} }
</style>
