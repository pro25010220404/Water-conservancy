<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import AiModelHealthRing from './components/AiModelHealthRing.vue'
import { fetchPhysicsGuardSummary } from '@/api/dispatchPage'
import type { PhysicsGuardSummary } from '@/types/dispatch'

const router = useRouter()
const physicsGuard = ref<PhysicsGuardSummary | null>(null)

const data = ref({
  upstreamLevel: 378.52,
  downstreamLevel: 269.18,
  inflowRate: 6350,
  outflowRate: 5820,
  powerOutput: 4119,
  gateOpening: 34,
  capacity: 48.36,
})
let t: ReturnType<typeof setInterval>
onMounted(async () => {
  physicsGuard.value = (await fetchPhysicsGuardSummary()).data
  t = setInterval(() => {
    data.value.upstreamLevel = +(data.value.upstreamLevel + (Math.random() - 0.5) * 0.1).toFixed(2)
    data.value.powerOutput = +(data.value.powerOutput + (Math.random() - 0.5) * 15).toFixed(0)
  }, 3000)
})
onUnmounted(() => clearInterval(t))
const fmt = (v: number, d = 2) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

const expanded = ref<string | null>(null)
function toggle(id: string) {
  expanded.value = expanded.value === id ? null : id
}

const sections = [
  {
    id: 'hydrology',
    title: '水情监测',
    path: '/dashboard/hydrology',
    preview: [
      { l: '上游水位', v: '378.52 m' },
      { l: '入库流量', v: '6,350 m³/s' },
    ],
    detail: [
      { l: '上游水位', v: '378.52', u: 'm' },
      { l: '下游水位', v: '269.18', u: 'm' },
      { l: '入库流量', v: '6,350', u: 'm³/s' },
      { l: '出库流量', v: '5,820', u: 'm³/s' },
      { l: '库容', v: '48.36', u: '亿m³' },
      { l: '水头', v: '109.34', u: 'm' },
    ],
  },
  {
    id: 'gate',
    title: '闸门检测',
    path: '/dashboard/gate',
    preview: [
      { l: '平均开度', v: '34.0 %' },
      { l: '运行中', v: '8 扇' },
    ],
    detail: [
      { l: '表孔 1-8#', v: '34.0', u: '%' },
      { l: '中孔 1-2#', v: '22.0', u: '%' },
      { l: '底孔 1-2#', v: '0.0', u: '%' },
      { l: '最近动作', v: '14:08', u: '' },
      { l: '动作耗时', v: '12', u: 's' },
      { l: '操作模式', v: 'AI-DQN', u: '' },
    ],
  },
  {
    id: 'power',
    title: '发电检测',
    path: '/dashboard/power',
    preview: [
      { l: '总出力', v: '4,119 MW' },
      { l: '今日发电', v: '1,248 万kWh' },
    ],
    detail: [
      { l: '1#机组', v: '685', u: 'MW' },
      { l: '2#机组', v: '692', u: 'MW' },
      { l: '4#机组', v: '678', u: 'MW' },
      { l: '5#机组', v: '688', u: 'MW' },
      { l: '7#机组', v: '695', u: 'MW' },
      { l: '8#机组', v: '681', u: 'MW' },
    ],
  },
  {
    id: 'security',
    title: '安防检测',
    path: '/dashboard/security',
    preview: [
      { l: '摄像头', v: '5/6 在线' },
      { l: '今日告警', v: '2 条' },
    ],
    detail: [
      { l: '摄像头在线', v: '5/6', u: '路' },
      { l: '门禁已锁', v: '3/4', u: '扇' },
      { l: '今日告警', v: '2', u: '条' },
      { l: '巡检完成', v: '2/3', u: '条' },
      { l: '周界安全', v: '5/6', u: '区' },
      { l: '最近事件', v: '12:05', u: '' },
    ],
  },
]

const alarms = [
  { time: '14:32', level: 'warning' as const, msg: '1#边缘网关 CPU 使用率 88%', status: '未处理' },
  { time: '12:05', level: 'warning' as const, msg: '下游河道周界入侵告警', status: '已确认' },
  { time: '08:22', level: 'critical' as const, msg: '开关站门禁异常开启', status: '已处理' },
]
</script>

<template>
  <div class="dp">
    <div class="hd">
      <div>
        <h1>综合概览</h1>
        <p>
          向家坝水电站 ·
          {{
            new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })
          }}
        </p>
      </div>
      <span class="hd__status"><i /> 系统运行中</span>
    </div>

    <div class="hero">
      <div class="kpi">
        <span>上游水位</span><b>{{ fmt(data.upstreamLevel) }}<small>m</small></b>
      </div>
      <div class="kpi">
        <span>入库流量</span><b>{{ fmt(data.inflowRate, 0) }}<small>m³/s</small></b>
      </div>
      <div class="kpi">
        <span>发电功率</span><b style="color: #3b82f6">{{ fmt(data.powerOutput, 0) }}<small>MW</small></b>
      </div>
      <div class="kpi">
        <span>闸门开度</span><b>{{ fmt(data.gateOpening, 1) }}<small>%</small></b>
      </div>
      <div class="kpi">
        <span>库容</span><b>{{ fmt(data.capacity) }}<small>亿m³</small></b>
      </div>
    </div>

    <div class="main">
      <div class="col col--wide">
        <div class="list">
          <div
            v-for="s in sections"
            :key="s.id"
            class="sec"
            :class="{ on: expanded === s.id }"
            @click="toggle(s.id)"
          >
            <div class="sec__top">
              <span class="sec__t">{{ s.title }}</span>
              <span
v-if="expanded !== s.id" class="sec__pre"
>
                <span
v-for="p in s.preview" :key="p.l"
                >{{ p.l }} <b>{{ p.v }}</b></span>
              </span>
              <span class="sec__arr">{{ expanded === s.id ? '收起' : '展开' }}</span>
            </div>
            <div
v-if="expanded === s.id" class="sec__body"
>
              <div class="sec__grid">
                <div v-for="d in s.detail"
:key="d.l" class="st">
                  <span class="st__l">{{ d.l }}</span>
                  <span class="st__v">{{ d.v }}<small>{{ d.u }}</small></span>
                </div>
              </div>
              <button class="sec__btn"
@click.stop="router.push(s.path)">
                进入 {{ s.title }} 完整页面 →
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="col col--side">
        <AiModelHealthRing />
        <div v-if="physicsGuard"
class="panel physics-card">
          <h2>物理防护配置</h2>
          <p>v{{ physicsGuard.config_version }} · 紧急 {{ physicsGuard.upstream_emergency }}m</p>
          <button
            class="sec__btn"
            @click="router.push({ path: '/settings', query: { tab: 'physics-guard' } })"
          >
            管理配置 →
          </button>
        </div>
        <div class="panel">
          <h2>实时告警</h2>
          <div v-for="a in alarms"
:key="a.time" class="al">
            <span
class="al__d" :class="a.level" />
            <div>
              <div class="al__m">
                {{ a.msg }}
              </div>
              <div class="al__f">{{ a.time }} · {{ a.status }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dp {
  height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
}

.hd {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 32px 40px 28px;
  background: #fff;
  border-bottom: 1px solid #eef0f2;
  flex-shrink: 0;
}

.hd h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.5px;
}

.hd p {
  margin: 4px 0 0;
  font-size: 14px;
  color: #64748b;
}

.hd__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: #16a34a;
}

.hd__status i {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  animation: pulse 2s infinite;
}

.hero {
  display: flex;
  padding: 0 40px;
  background: #fff;
  border-bottom: 1px solid #eef0f2;
  flex-shrink: 0;
}

.kpi {
  flex: 1;
  padding: 22px 0;
  text-align: center;
  border-right: 1px solid #f1f5f9;
}

.kpi:last-child {
  border-right: none;
}

.kpi span {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
}

.kpi b {
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  color: #0f172a;
  font-family: 'SF Mono', 'Cascadia Code', monospace;

  small {
    margin-left: 4px;
    font-size: 14px;
    font-weight: 400;
    color: #64748b;
  }
}

.main {
  flex: 1;
  display: flex;
  gap: 20px;
  padding: 20px 40px;
  min-height: 0;
  overflow: hidden;
}

.col--wide {
  flex: 1.5;
  overflow-y: auto;
}

.col--side {
  flex: 1;
  overflow-y: auto;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sec {
  overflow: hidden;
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: #dde4f0;
  }

  &.on {
    border-color: #d0d8e8;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
  }
}

.sec__top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 24px;
}

.sec__t {
  min-width: 88px;
  font-size: 17px;
  font-weight: 600;
  color: #1e293b;
}

.sec__pre {
  display: flex;
  flex: 1;
  gap: 24px;

  span {
    font-size: 14px;
    color: #64748b;
  }

  b {
    margin-left: 6px;
    font-weight: 600;
    color: #334155;
  }
}

.sec__arr {
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  white-space: nowrap;
}

.sec.on .sec__arr {
  color: #3b82f6;
}

.sec__body {
  padding: 0 24px 22px 112px;
}

.sec__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.st {
  padding: 14px 8px;
  text-align: center;
  background: #f8fafc;
  border-radius: 6px;
}

.st__l {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #64748b;
}

.st__v {
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
  font-family: 'SF Mono', monospace;

  small {
    margin-left: 2px;
    font-size: 13px;
    font-weight: 400;
    color: #64748b;
  }
}

.sec__btn {
  padding: 10px 18px;
  font-size: 14px;
  font-weight: 500;
  color: #64748b;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }
}

.panel {
  padding: 22px 24px;
  background: #fff;
  border: 1px solid #eef0f4;
  border-radius: 8px;
  & + .panel {
    margin-top: 12px;
  }
}
.physics-card {
  p {
    margin: 0 0 10px;
    font-size: 13px;
    color: #64748b;
  }
  .sec__btn {
    margin-top: 4px;
  }
}

.panel h2 {
  margin: 0 0 16px;
  font-size: 17px;
  font-weight: 600;
  color: #1e293b;
}

.al {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  line-height: 1.45;

  & + & {
    border-top: 1px solid #f1f5f9;
  }
}

.al__d {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #f59e0b;

  &.critical {
    background: #ef4444;
  }

  &.warning {
    background: #f59e0b;
  }
}

.al__m {
  font-size: 15px;
  font-weight: 500;
  color: #1e293b;
}

.al__f {
  margin-top: 4px;
  font-size: 14px;
  color: #64748b;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}
</style>

<style lang="scss">
.main-layout__content:has(.dp) {
  padding: 0 !important;
  overflow: hidden !important;
}
</style>
