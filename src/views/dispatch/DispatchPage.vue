<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import {
  ElButton, ElSlider, ElSelect, ElOption, ElMessage, ElMessageBox,
  ElDialog, ElFormItem, ElInput, ElSwitch,
} from 'element-plus'
import { Refresh, CircleCheck, CircleClose, Top, Bottom, Connection } from '@element-plus/icons-vue'
import CockpitPageShell from '@/components/cockpit/CockpitPageShell.vue'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import {
  AUTO_LEVEL_MAP, AUTO_LEVEL_OPTIONS, DISPATCH_RESULT_MAP,
  getConfidenceColor, FACTOR_DIRECTION_MAP, LSTM_HORIZONS, LSTM_METRICS,
  OPENING_MIN, OPENING_MAX, OPENING_STEP,
} from '@/constants/dispatch'
import type { DecisionDetail, DispatchStatus, DispatchLog, PredictionData, AutoLevel } from '@/types/dispatch'
import {
  getDispatchStatus, getDecisionDetail, getPrediction, executeDispatch, emergencyStop,
  changeAutoLevel, acceptDecision, getDispatchLogs, getRiskLevel,
} from '@/api/dispatch'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const canModifyLevel = computed(() => {
  const roles = userStore.userInfo?.roles ?? []
  return roles.includes('admin') || roles.includes('algorithm_engineer')
})

const status = ref<DispatchStatus>({ mode: 'auto', autoLevel: 2, upstreamLevel: 380.65, downstreamLevel: 278.42, flowRate: 1920, gateOpening: 45, lastDispatchAt: null, isExecuting: false })
const decision = ref<DecisionDetail | null>(null)
const prediction = ref<PredictionData | null>(null)
const logs = ref<DispatchLog[]>([])
const riskLevel = ref<'low' | 'medium' | 'high'>('low')
const riskDiff = ref(0)

const horizon = ref<'1h' | '3h' | '6h'>('3h')
const metric = ref<'waterLevel' | 'flowRate'>('waterLevel')
const selectedPlan = ref('推荐')
const targetOpening = ref(45)
const autoExecEnabled = ref(true)

const levelDialogVisible = ref(false)
const pendingLevel = ref<AutoLevel>(2)
const ignoreVisible = ref(false)
const ignoreReason = ref('')

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
let chartTimer: ReturnType<typeof setInterval> | null = null

async function refreshAll() {
  try {
    const [st, dec, pred, logRes, risk] = await Promise.all([
      getDispatchStatus(), getDecisionDetail(), getPrediction(horizon.value),
      getDispatchLogs({ pageNum: 1, pageSize: 20 }), getRiskLevel(),
    ])
    status.value = st.data
    decision.value = dec.data
    prediction.value = pred.data
    logs.value = logRes.data.list
    riskLevel.value = risk.data.level
    riskDiff.value = risk.data.diff
    targetOpening.value = st.data.gateOpening
    nextTick(drawChart)
  } catch { /* */ }
}

watch(horizon, refreshAll)

function drawChart() {
  const canvas = chartCanvas.value
  if (!canvas || !prediction.value) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.offsetWidth
  const h = canvas.offsetHeight
  canvas.width = w * 2
  canvas.height = h * 2
  ctx.scale(2, 2)
  ctx.clearRect(0, 0, w, h)

  const pad = { t: 24, r: 20, b: 36, l: 50 }
  const pw = w - pad.l - pad.r
  const ph = h - pad.t - pad.b
  const data = metric.value === 'waterLevel' ? prediction.value.waterLevels : prediction.value.flowRates
  if (!data.length) return

  const vals = data.map((d) => d.value)
  const minV = Math.min(...vals) - (metric.value === 'waterLevel' ? 0.5 : 100)
  const maxV = Math.max(...vals) + (metric.value === 'waterLevel' ? 0.5 : 100)
  const range = maxV - minV

  // 网格
  ctx.strokeStyle = 'rgba(24,144,255,0.12)'
  for (let i = 0; i <= 5; i++) {
    const y = pad.t + (ph / 5) * i
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke()
  }

  // 安全区间
  if (metric.value === 'waterLevel') {
    const safeTop = pad.t + ph - ((381 - minV) / range) * ph
    const safeBot = pad.t + ph - ((379 - minV) / range) * ph
    ctx.fillStyle = 'rgba(46,213,115,0.08)'
    ctx.fillRect(pad.l, safeTop, pw, safeBot - safeTop)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(255,71,87,0.5)'
    const warnY = pad.t + ph - ((381.5 - minV) / range) * ph
    ctx.beginPath(); ctx.moveTo(pad.l, warnY); ctx.lineTo(w - pad.r, warnY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#ff4757'; ctx.font = '13px monospace'
    ctx.fillText('预警水位 381.5m', w - pad.r - 90, warnY - 4)
  }

  // 预测曲线
  const pts = data.map((d, i) => ({
    x: pad.l + (pw / (data.length - 1)) * i,
    y: pad.t + ph - ((d.value - minV) / range) * ph,
  }))

  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b)
  grad.addColorStop(0, 'rgba(24,144,255,0.25)')
  grad.addColorStop(1, 'rgba(24,144,255,0.02)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(pts[0].x, h - pad.b)
  pts.forEach((p) => ctx.lineTo(p.x, p.y))
  ctx.lineTo(pts[pts.length - 1].x, h - pad.b)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#1890ff'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(24,144,255,0.3)'
  ctx.shadowBlur = 8
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.shadowBlur = 0

  // 当前时刻
  const nowX = pad.l + pw * 0.35
  ctx.strokeStyle = 'rgba(255,165,2,0.7)'
  ctx.setLineDash([3, 5])
  ctx.beginPath(); ctx.moveTo(nowX, pad.t); ctx.lineTo(nowX, h - pad.b); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#ffa502'; ctx.font = '13px monospace'
  ctx.fillText('当前', nowX + 4, pad.t + 12)

  // Y轴标签
  ctx.fillStyle = '#64748b'; ctx.font = '13px monospace'
  ctx.fillText(maxV.toFixed(1), 4, pad.t + 4)
  ctx.fillText(minV.toFixed(1), 4, h - pad.b)
}

async function handleAccept() {
  try { await acceptDecision(); ElMessage.success('已采纳AI建议'); refreshAll() } catch { ElMessage.error('操作失败') }
}
async function handleExecute() {
  try {
    await ElMessageBox.confirm(`确认将开度从 ${status.value.gateOpening}% 调整为 ${targetOpening.value}%？`, '确认执行', { type: 'warning' })
    await executeDispatch({ targetOpening: targetOpening.value })
    ElMessage.success('指令已下发'); refreshAll()
  } catch { /* */ }
}
async function handleEmergencyStop() {
  try {
    await ElMessageBox.confirm('确认立即停止所有闸门执行？', '紧急停止', { type: 'error' })
    await emergencyStop(); ElMessage.success('急停已执行'); refreshAll()
  } catch { /* */ }
}
async function submitLevel() {
  await changeAutoLevel({ level: pendingLevel.value })
  ElMessage.success('权限等级已更新'); levelDialogVisible.value = false; refreshAll()
}

const riskCards = computed(() => [
  { key: 'low', label: '低风险场景', desc: '水位在安全区间 ±0.5m 内', action: '可自动执行', color: '#2ed573', active: riskLevel.value === 'low' },
  { key: 'medium', label: '中风险场景', desc: '水位偏离安全区间 ±0.5m~±1m', action: '需人工确认', color: '#ffa502', active: riskLevel.value === 'medium' },
  { key: 'high', label: '高风险场景', desc: '水位超出预警阈值/洪水预警', action: '禁止自动执行', color: '#ff4757', active: riskLevel.value === 'high' },
])

onMounted(() => {
  refreshAll()
  pollTimer = setInterval(refreshAll, 3000)
  chartTimer = setInterval(drawChart, 2000)
})
onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (chartTimer) clearInterval(chartTimer)
})
</script>

<template>
  <CockpitPageShell>
  <div class="cockpit-page dispatch-page">
    <div class="dispatch-body">
      <!-- 左侧 AI 决策 -->
      <div class="dispatch-left">
        <GlassPanel3D title="AI 决策详情">
          <template v-if="decision">
            <div class="decision-hero">
              <div>
                <span class="lbl">推荐开度</span>
                <span class="val">
                  <Top v-if="decision.openingDirection==='up'" /><Bottom v-else-if="decision.openingDirection==='down'" /><Connection v-else />
                  {{ decision.recommendedOpening }}%
                </span>
                <span class="expect">预期上游 {{ decision.expectedLevel }}m · 流量 {{ decision.expectedFlowRate }}m³/s</span>
              </div>
            </div>

            <!-- 影响因素 -->
            <div class="section">
              <h4>影响因素</h4>
              <div class="factor-bars">
                <div v-for="f in decision.factors" :key="f.name" class="factor-row">
                  <span class="fname">{{ f.name }}</span>
                  <div class="fbar"><div class="fbar__fill" :style="{ width: (f.weight * 100) + '%' }" /></div>
                  <span class="fval">{{ f.value }}</span>
                  <span class="fdir" :style="{ color: FACTOR_DIRECTION_MAP[f.direction]?.color }">{{ FACTOR_DIRECTION_MAP[f.direction]?.icon }}</span>
                  <span class="fwt">{{ (f.weight * 100).toFixed(0) }}%</span>
                </div>
              </div>
            </div>

            <!-- 方案对比 -->
            <div class="section">
              <h4>方案对比</h4>
              <div class="plan-cards">
                <div
                  v-for="p in decision.plans" :key="p.id"
                  class="plan-card"
                  :class="{ 'plan-card--rec': p.recommended, 'plan-card--sel': selectedPlan === p.id }"
                  @click="selectedPlan = p.id"
                >
                  <div class="plan-card__head"><strong>{{ p.id }}</strong><span v-if="p.recommended" class="rec-tag">AI最优</span></div>
                  <div class="plan-card__grid">
                    <div><small>开度</small><b>{{ p.opening }}%</b></div>
                    <div><small>水位</small><b>{{ p.expectedLevel }}m</b></div>
                    <div><small>发电量</small><b>{{ p.power }}kW</b></div>
                    <div><small>安全</small><b :style="{ color: p.safetyScore >= 90 ? '#2ed573' : '#ffa502' }">{{ p.safetyScore }}</b></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 置信度 -->
            <div class="section conf-section">
              <h4>置信度</h4>
              <div class="conf-ring-wrap">
                <svg viewBox="0 0 120 120" class="conf-ring">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="10" />
                  <circle cx="60" cy="60" r="50" fill="none" :stroke="getConfidenceColor(decision.confidence)" stroke-width="10" :stroke-dasharray="`${decision.confidence * 3.14} 314`" stroke-linecap="round" transform="rotate(-90 60 60)" />
                </svg>
                <span class="conf-val" :style="{ color: getConfidenceColor(decision.confidence) }">{{ decision.confidence }}%</span>
              </div>
              <p class="conf-desc">计算依据：LSTM预测 + DQN决策 · 模型 {{ decision.modelVersion }}</p>
              <p v-if="decision.confidence < 80" class="conf-warn">置信度偏低，建议人工复核后再执行</p>
            </div>

            <div class="decision-btns">
              <ElButton type="primary" :icon="CircleCheck" @click="handleAccept">采纳建议</ElButton>
              <ElButton :icon="CircleClose" @click="ignoreVisible = true">忽略</ElButton>
            </div>
          </template>
        </GlassPanel3D>
      </div>

      <!-- 右侧 权限 UI -->
      <div class="dispatch-right">
        <GlassPanel3D title="三级自动执行权限">
          <div class="risk-cards">
            <div
              v-for="card in riskCards" :key="card.key"
              class="risk-card"
              :class="{ 'risk-card--active': card.active }"
              :style="{ '--risk-color': card.color }"
            >
              <div class="risk-card__indicator" />
              <div class="risk-card__body">
                <strong>{{ card.label }}</strong>
                <p>{{ card.desc }}</p>
                <span class="risk-action">{{ card.action }}</span>
              </div>
              <div v-if="card.key === 'low'" class="risk-card__ctrl">
                <ElSwitch v-model="autoExecEnabled" active-text="自动执行" />
              </div>
              <div v-else-if="card.key === 'medium'" class="risk-card__ctrl">
                <ElButton size="small" type="warning">确认</ElButton>
                <ElButton size="small">驳回</ElButton>
              </div>
              <div v-else class="risk-card__ctrl">
                <ElButton size="small" disabled>禁止自动</ElButton>
                <ElButton size="small" type="primary">人工操作</ElButton>
              </div>
            </div>
          </div>

          <div class="level-section">
            <h4>权限等级配置</h4>
            <div
              v-for="lv in AUTO_LEVEL_OPTIONS" :key="lv.value"
              class="level-item"
              :class="{ active: status.autoLevel === lv.value }"
              :style="{ '--lv-color': lv.color }"
              @click="canModifyLevel && status.autoLevel !== lv.value && (pendingLevel = lv.value as AutoLevel, levelDialogVisible = true)"
            >
              <span class="level-dot" /><strong>{{ lv.label }}</strong><small>{{ lv.description }}</small>
            </div>
            <p v-if="!canModifyLevel" class="readonly-tip">仅管理员/算法工程师可修改</p>
          </div>
        </GlassPanel3D>

        <GlassPanel3D title="手动干预" compact>
          <div class="manual-row"><span>目标开度</span><strong>{{ targetOpening }}%</strong></div>
          <ElSlider v-model="targetOpening" :min="OPENING_MIN" :max="OPENING_MAX" :step="OPENING_STEP" />
          <div class="manual-btns">
            <ElButton type="primary" :disabled="targetOpening === status.gateOpening" @click="handleExecute">执行</ElButton>
            <ElButton type="danger" class="stop-btn" @click="handleEmergencyStop">急停</ElButton>
          </div>
        </GlassPanel3D>

        <GlassPanel3D title="调度记录" compact>
          <div class="log-scroll">
            <div v-for="log in logs.slice(0, 8)" :key="log.id" class="log-line">
              <span class="log-time">{{ log.createdAt?.replace('T', ' ').substring(5, 16) }}</span>
              <span>{{ log.action }}</span>
              <span :style="{ color: DISPATCH_RESULT_MAP[log.result]?.color }">{{ DISPATCH_RESULT_MAP[log.result]?.label }}</span>
            </div>
          </div>
        </GlassPanel3D>
      </div>
    </div>

    <!-- LSTM 预测图 -->
    <GlassPanel3D title="LSTM 水位预测" class="chart-panel">
      <template #extra>
        <div class="chart-ctrl">
          <ElSelect v-model="horizon" size="small" style="width:70px"><ElOption v-for="h in LSTM_HORIZONS" :key="h.value" :label="h.label" :value="h.value" /></ElSelect>
          <ElSelect v-model="metric" size="small" style="width:80px" @change="drawChart"><ElOption v-for="m in LSTM_METRICS" :key="m.value" :label="m.label" :value="m.value" /></ElSelect>
          <ElButton :icon="Refresh" circle size="small" @click="refreshAll" />
        </div>
      </template>
      <canvas ref="chartCanvas" class="lstm-canvas" />
      <div class="chart-legend">
        <span><i class="leg leg--pred" />预测曲线</span>
        <span><i class="leg leg--safe" />安全区间</span>
        <span><i class="leg leg--warn" />预警水位线</span>
        <span class="update-time">更新：{{ prediction?.updatedAt?.replace('T', ' ').substring(0, 19) ?? '—' }}</span>
      </div>
    </GlassPanel3D>

    <ElDialog v-model="levelDialogVisible" title="变更自动执行权限" width="460px">
      <p>确认切换为：<strong :style="{ color: AUTO_LEVEL_MAP[pendingLevel]?.color }">{{ AUTO_LEVEL_MAP[pendingLevel]?.label }}</strong></p>
      <template #footer><ElButton @click="levelDialogVisible=false">取消</ElButton><ElButton type="primary" @click="submitLevel">确认</ElButton></template>
    </ElDialog>
    <ElDialog v-model="ignoreVisible" title="忽略建议" width="400px">
      <ElFormItem label="原因"><ElInput v-model="ignoreReason" type="textarea" /></ElFormItem>
      <template #footer><ElButton @click="ignoreVisible=false">取消</ElButton><ElButton type="warning" @click="ignoreVisible=false">确认忽略</ElButton></template>
    </ElDialog>
  </div>
  </CockpitPageShell>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.dispatch-page { @include cockpit-page-base; display: flex; flex-direction: column; gap: 14px; padding-bottom: 16px; font-size: $cockpit-font-base; }
.dispatch-body { display: grid; grid-template-columns: 1fr 400px; gap: 14px; padding: 0 16px; flex: 1; }
.dispatch-left, .dispatch-right { display: flex; flex-direction: column; gap: 12px; }
.decision-hero { margin-bottom: 18px; .lbl { font-size: $cockpit-font-sm; color: $cockpit-text-dim; } .val { display: flex; align-items: center; gap: 8px; font-size: $cockpit-font-3xl; @include data-value; font-size: $cockpit-font-3xl; color: $cockpit-cyan; } .expect { display: block; font-size: $cockpit-font-base; color: $cockpit-text-dim; margin-top: 6px; } }
.section { margin-bottom: 16px; h4 { font-size: $cockpit-font-sm; color: $cockpit-text-dim; letter-spacing: 1px; margin-bottom: 10px; border-left: 3px solid $cockpit-cyan; padding-left: 10px; font-weight: 600; } }
.factor-row { display: grid; grid-template-columns: 100px 1fr 80px 24px 44px; gap: 10px; align-items: center; padding: 6px 0; font-size: $cockpit-font-sm; }
.fbar { height: 8px; background: rgba(15,23,42,0.06); border-radius: 4px; overflow: hidden; &__fill { height: 100%; background: linear-gradient(90deg, $cockpit-accent, #3b82f6); border-radius: 4px; transition: width 0.6s; } }
.fwt { color: $cockpit-accent; font-family: 'SF Mono', monospace; text-align: right; font-size: $cockpit-font-sm; }
.plan-cards { display: flex; gap: 10px; }
.plan-card { flex: 1; padding: 14px; border: 1px solid rgba(15,23,42,0.08); border-radius: 10px; cursor: pointer; transition: all 0.25s; background: #fff;
  &--rec { border-color: rgba(24,144,255,0.35); background: #f0f9ff; }
  &--sel { box-shadow: 0 4px 16px rgba(24,144,255,0.15); transform: translateY(-2px); }
  &__head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: $cockpit-font-md; .rec-tag { font-size: $cockpit-font-xs; padding: 4px 10px; background: rgba(46,213,115,0.2); color: #2ed573; border-radius: 4px; } }
  &__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; small { display: block; font-size: $cockpit-font-xs; color: $cockpit-text-dim; } b { font-size: $cockpit-font-base; } }
}
.conf-ring-wrap { position: relative; width: 120px; height: 120px; margin: 0 auto; .conf-ring { width: 100%; height: 100%; } .conf-val { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: $cockpit-font-xl; font-weight: 700; } }
.conf-desc { text-align: center; font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin-top: 10px; }
.conf-warn { text-align: center; font-size: $cockpit-font-sm; color: #ffa502; margin-top: 6px; }
.decision-btns { display: flex; gap: 12px; margin-top: 14px; .el-button { flex: 1; } }
.risk-cards { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.risk-card { display: grid; grid-template-columns: 4px 1fr auto; gap: 12px; padding: 14px; border: 1px solid rgba(15,23,42,0.08); border-radius: 10px; align-items: center; transition: all 0.3s; background: #fff;
  &--active { border-color: var(--risk-color); background: #fafafa; box-shadow: 0 2px 12px rgba(15,23,42,0.08); }
  &__indicator { width: 4px; height: 100%; min-height: 48px; background: var(--risk-color); border-radius: 2px; }
  &__body { strong { display: block; font-size: $cockpit-font-base; } p { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin: 4px 0; line-height: 1.4; } .risk-action { font-size: $cockpit-font-sm; color: var(--risk-color); font-weight: 600; } }
  &__ctrl { display: flex; gap: 8px; flex-direction: column; align-items: flex-end; }
}
.level-section h4 { font-size: $cockpit-font-sm; color: $cockpit-text-dim; margin-bottom: 10px; font-weight: 600; }
.level-item { padding: 12px 14px; border: 1px solid rgba(15,23,42,0.08); border-radius: 8px; margin-bottom: 8px; cursor: pointer; background: #fff; &.active { border-color: var(--lv-color); background: #f0f9ff; } strong { display: block; font-size: $cockpit-font-base; } small { font-size: $cockpit-font-sm; color: $cockpit-text-dim; } }
.readonly-tip { font-size: $cockpit-font-sm; color: $cockpit-text-dim; text-align: center; }
.manual-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: $cockpit-font-base; strong { @include data-value; font-size: $cockpit-font-xl; } }
.manual-btns { display: flex; gap: 10px; margin-top: 14px; }
.stop-btn { animation: stop-pulse 2s infinite; }
.log-scroll { max-height: 160px; overflow-y: auto; }
.log-line { display: flex; gap: 10px; padding: 8px 0; font-size: $cockpit-font-sm; border-bottom: 1px solid rgba(15,23,42,0.06); .log-time { color: $cockpit-text-dim; font-family: 'SF Mono', monospace; flex-shrink: 0; } }
.chart-panel { margin: 0 16px; }
.chart-ctrl { display: flex; gap: 8px; }
.lstm-canvas { width: 100%; height: 240px; display: block; }
.chart-legend { display: flex; gap: 20px; margin-top: 10px; font-size: $cockpit-font-sm; color: $cockpit-text-dim; .leg { display: inline-block; width: 14px; height: 4px; margin-right: 6px; vertical-align: middle; &--pred { background: #1890ff; } &--safe { background: #22c55e; } &--warn { background: #ef4444; } } .update-time { margin-left: auto; font-family: 'SF Mono', monospace; } }
@keyframes stop-pulse { 0%,100%{box-shadow:0 0 8px rgba(255,71,87,0.3)} 50%{box-shadow:0 0 24px rgba(255,71,87,0.7)} }
:deep(.el-slider__bar) { background: linear-gradient(90deg, $cockpit-accent, #3b82f6); }
:deep(.el-dialog) { --el-bg-color: #ffffff; }
:deep(.el-select .el-input__wrapper), :deep(.el-input__wrapper) { background: #ffffff; border-color: rgba(24,144,255,0.2); }
:deep(.el-input__inner) { color: $cockpit-text; }
</style>
