<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const gates = ref([
  { name:'1#', v:62 },{ name:'2#', v:48 },{ name:'3#', v:35 },{ name:'4#', v:71 },
  { name:'5#', v:55 },{ name:'6#', v:42 },{ name:'7#', v:38 },{ name:'8#', v:60 },
  { name:'中1#', v:18 },{ name:'中2#', v:22 },
  { name:'底1#', v:0 },{ name:'底2#', v:0 },
])
const logs = [
  { time:'14:32', gate:'3#表孔', action:'32%→28%', dur:'12s', by:'AI调度' },
  { time:'14:08', gate:'1#中孔', action:'15%→20%', dur:'8s', by:'张工' },
  { time:'13:45', gate:'5#表孔', action:'28%→35%', dur:'15s', by:'LSTM' },
  { time:'13:22', gate:'2#表孔', action:'35%→30%', dur:'11s', by:'AI调度' },
  { time:'12:10', gate:'7#表孔', action:'40%→32%', dur:'14s', by:'急停' },
]

let t:ReturnType<typeof setInterval>
onMounted(()=>{t=setInterval(()=>{gates.value.forEach(g=>{g.v=+(g.v+(Math.random()-.5)*0.2).toFixed(1);if(g.v<0)g.v=0;if(g.v>100)g.v=100})},3000)})
onUnmounted(()=>clearInterval(t))
</script>

<template>
  <div class="gp">
    <!-- KPI + 标题 -->
    <div class="kpis">
      <div class="kpi"><span class="kpi__dot" style="background:#3b82f6"/><span class="kpi__l">闸门总数</span><span class="kpi__v">{{ gates.length }}<small> 扇</small></span></div>
      <div class="kpi"><span class="kpi__dot" style="background:#22c55e"/><span class="kpi__l">开启中</span><span class="kpi__v">{{ gates.filter(g=>g.v>0).length }}<small> 扇</small></span></div>
      <div class="kpi"><span class="kpi__dot" style="background:#f59e0b"/><span class="kpi__l">平均开度</span><span class="kpi__v">{{ (gates.reduce((s,g)=>s+g.v,0)/gates.length).toFixed(1) }}<small> %</small></span></div>
      <div class="kpi"><span class="kpi__dot" style="background:#d1d5db"/><span class="kpi__l">告警</span><span class="kpi__v">0<small> 条</small></span></div>
    </div>

    <!-- 主区域：示意大坝剖面 + 闸门状态表 -->
    <div class="main">
      <!-- 左侧：大坝剖面示意 -->
      <div class="diagram">
        <div class="diagram__title">闸门开度示意</div>
        <div class="diagram__scene">
          <!-- 上游 -->
          <div class="diagram__pool diagram__pool--up">
            <span>上游 378.5m</span>
          </div>
          <!-- 坝体 + 闸门：表孔8扇 + 中孔底孔4扇分两排 -->
          <div class="diagram__dam">
            <div class="diagram__dam-inner">
              <div class="diagram__slots">
                <div v-for="g in gates.slice(0,8)" :key="g.name" class="dslot">
                  <div class="dslot__leaf" :style="{height:(100-g.v)+'%'}"/>
                  <div class="dslot__water" :style="{opacity:g.v/100}"/>
                  <span class="dslot__lbl">{{ g.name }}</span>
                </div>
              </div>
              <div class="diagram__divider"><span>中孔 / 底孔</span></div>
              <div class="diagram__slots diagram__slots--sub">
                <div v-for="g in gates.slice(8)" :key="g.name" class="dslot dslot--sub">
                  <div class="dslot__leaf" :style="{height:(100-g.v)+'%'}"/>
                  <div class="dslot__water" :style="{opacity:g.v/100}"/>
                  <span class="dslot__lbl">{{ g.name }}</span>
                </div>
              </div>
            </div>
          </div>
          <!-- 下游 -->
          <div class="diagram__pool diagram__pool--dn">
            <span>下游 269.2m</span>
          </div>
        </div>
        <div class="diagram__legend">
          <span><span class="leg-dot" style="background:#64748b"/> 闸门叶片</span>
          <span><span class="leg-dot" style="background:#3b82f6"/> 过流区</span>
          <span><span class="leg-dot" style="background:#22c55e"/> 正常</span>
        </div>
      </div>

      <!-- 右侧：状态表格 + 操作日志 -->
      <div class="panel">
        <div class="panel__title">闸门状态</div>
        <table class="table">
          <thead><tr><th>编号</th><th>开度</th><th>状态</th><th>进度</th></tr></thead>
          <tbody>
            <tr v-for="g in gates" :key="g.name">
              <td class="td-name">{{ g.name }}</td>
              <td class="td-val">{{ g.v }}%</td>
              <td><span class="td-st" :class="{off:g.v===0}">{{ g.v>0?'运行中':'关闭' }}</span></td>
              <td><div class="td-bar"><div :style="{width:g.v+'%'}"/></div></td>
            </tr>
          </tbody>
        </table>

        <div class="panel__title" style="margin-top:20px">操作记录</div>
        <div class="log">
          <div v-for="l in logs" :key="l.time" class="log__row">
            <span class="log__t">{{ l.time }}</span><b>{{ l.gate }}</b><span>{{ l.action }}</span><span class="log__d">{{ l.dur }}</span><span class="log__by">{{ l.by }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gp { height:calc(100vh - 56px); display:flex; flex-direction:column; background:#f0f4f8; overflow:hidden; }

// KPI 卡片行
.kpis { display:flex; align-items:center; gap:12px; padding:20px 28px; background:#fff; border-bottom:1px solid #e5e7eb; flex-shrink:0; }
.kpis__title { font-size:16px; font-weight:700; color:#1e293b; margin-right:auto; white-space:nowrap; }
.kpi { flex:0 0 auto; min-width:130px; display:flex; align-items:center; gap:10px; padding:14px 18px; background:#f8fafc; border-radius:8px; }
.kpi__dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.kpi__l { font-size:14px; color:#64748b; }
.kpi__v { font-size:26px; font-weight:700; color:#1e293b; margin-left:auto; small{font-size:14px;font-weight:400;color:#94a3b8;} }

// 主区域
.main { flex:1; display:flex; gap:16px; padding:16px 24px; min-height:0; overflow:hidden; }

// 大坝剖面示意图
.diagram { flex:1; display:flex; flex-direction:column; background:#fff; border-radius:10px; border:1px solid #e5e7eb; padding:16px; }
.diagram__title { font-size:15px; font-weight:600; color:#334155; margin-bottom:14px; }
.diagram__scene { flex:1; display:flex; flex-direction:column; gap:0; min-height:0; }
.diagram__pool { display:flex; align-items:center; justify-content:center; height:44px; border-radius:6px; margin:0 30px;
  span { font-size:13px; font-weight:500; letter-spacing:1px; }
  &--up { background:linear-gradient(180deg,rgba(59,130,246,0.15),rgba(59,130,246,0.04)); span{color:rgba(59,130,246,0.5)} }
  &--dn { background:linear-gradient(180deg,rgba(16,185,129,0.04),rgba(16,185,129,0.12)); span{color:rgba(16,185,129,0.5)} }
}
.diagram__dam { flex:1; background:linear-gradient(180deg,#e8ecf0,#d4d8dd); border-radius:10px; margin:0 12px; padding:16px 18px;
  display:flex; align-items:stretch; box-shadow:inset 0 2px 4px rgba(0,0,0,0.04); }
.diagram__dam-inner { flex:1; display:flex; flex-direction:column; gap:0; }
.diagram__slots { display:flex; gap:14px; justify-content:center; align-items:stretch; flex:1; }
.diagram__slots--sub { flex:0 0 auto; height:60px; }
.diagram__divider { display:flex; align-items:center; gap:8px; padding:4px 0; span { font-size:10px; color:#94a3b8; white-space:nowrap; }
  &::before, &::after { content:''; flex:1; height:1px; background:#e5e7eb; } }
.dslot { width:64px; background:#f8f9fb; border:1.5px solid #d5d9de; border-radius:5px; position:relative; overflow:hidden;
  display:flex; flex-direction:column; align-items:center; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
.dslot--sub { width:56px; }
.dslot::before { content:''; position:absolute; top:0; left:-1px; right:-1px; height:4px; background:#9ca3af; border-radius:5px 5px 0 0; z-index:5; }
.dslot__leaf { position:absolute; left:1px; right:1px; top:4px; background:linear-gradient(180deg,#a8b0ba,#787f88); border-radius:2px;
  transition:height 0.5s cubic-bezier(0.4,0,0.2,1); z-index:2; box-shadow:0 2px 6px rgba(0,0,0,0.1); }
.dslot__water { position:absolute; inset:0; top:4px; z-index:1; background:linear-gradient(180deg,rgba(59,130,246,0.45),rgba(59,130,246,0.1));
  transition:opacity 0.5s; }
.dslot__lbl { position:absolute; bottom:5px; z-index:3; font-size:12px; font-weight:600; color:#4b5563; }
.diagram__legend { display:flex; gap:16px; margin-top:10px; font-size:13px; color:#94a3b8; }
.leg-dot { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:4px; vertical-align:middle; }

// 右侧面板
.panel { width:360px; flex-shrink:0; background:#fff; border-radius:10px; border:1px solid #e5e7eb; padding:16px; overflow-y:auto; }
.panel__title { font-size:15px; font-weight:600; color:#334155; margin-bottom:12px; }

.table { width:100%; border-collapse:collapse; font-size:14px;
  th { text-align:left; padding:8px 10px; color:#94a3b8; font-weight:500; font-size:12px; border-bottom:1px solid #e5e7eb; }
  td { padding:10px 10px; color:#475569; }
  tbody tr:nth-child(even) td { background:#fafbfc; }
  tbody tr:hover td { background:#f0f4ff; }
}
.td-name { font-weight:600; color:#1e293b; }
.td-val { font-weight:700; font-family:'SF Mono',monospace; }
.td-st { font-size:12px; padding:3px 10px; border-radius:100px; background:#ecfdf5; color:#16a34a; font-weight:500;
  &.off { background:#f1f5f9; color:#94a3b8; } }
.td-bar { height:4px; background:#f1f5f9; border-radius:2px; overflow:hidden; width:60px;
  div { height:100%; border-radius:2px; background:#3b82f6; transition:width 0.5s; } }

.log { display:flex; flex-direction:column; }
.log__row { display:flex; gap:10px; padding:7px 0; font-size:13px; color:#64748b; border-bottom:1px solid #fafafa;
  b { color:#1e293b; font-weight:600; min-width:52px; } }
.log__t { color:#94a3b8; font-family:'SF Mono',monospace; min-width:36px; }
.log__d { color:#94a3b8; min-width:32px; }
.log__by { color:#3b82f6; }
</style>

<style lang="scss">
.main-layout__content:has(.gp) { padding:0 !important; overflow:hidden !important; }
</style>
