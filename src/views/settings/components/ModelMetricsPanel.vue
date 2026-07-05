<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElSelect, ElOption, ElTable, ElTableColumn, ElTag, ElDialog, ElDescriptions, ElDescriptionsItem } from 'element-plus'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart, RadarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, RadarComponent, MarkPointComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ModelMetricLatest, ModelMetricDetailRow, ModelMetricCompare, ModelHealthOverviewItem } from '@/types/gateai'
import {
  fetchReservoirOptions, fetchModelMetricsLatest, fetchModelMetricsHistory, fetchModelMetricsDetail,
  fetchModelCompare, fetchModelHealthOverview, fetchModelVersionOptions,
} from '@/api/gateaiSettings'

const props = withDefaults(defineProps<{
  fixedMode?: 'dashboard' | 'compare' | 'both'
}>(), { fixedMode: 'both' })

use([LineChart, RadarChart, GridComponent, TooltipComponent, LegendComponent, RadarComponent, MarkPointComponent, CanvasRenderer])

const REFRESH_MS = 5 * 60 * 1000
const GRADE_COLOR: Record<string, string> = { S: '#16a34a', A: '#22c55e', B: '#f59e0b', C: '#f97316', D: '#dc2626' }

const reservoirs = ref<{ id: number; name: string }[]>([])
const healthOverview = ref<ModelHealthOverviewItem[]>([])
const reservoirId = ref(1)
const viewMode = ref<'dashboard' | 'compare'>(props.fixedMode === 'compare' ? 'compare' : 'dashboard')
const latest = ref<ModelMetricLatest | null>(null)
const detail = ref<ModelMetricDetailRow[]>([])
const compare = ref<ModelMetricCompare | null>(null)
const versionOptions = ref<{ version: string; source: string }[]>([])
const currentVersion = ref('')
const previousVersion = ref('')
const detailHours = ref(24)
const loading = ref(false)
const history = ref<Awaited<ReturnType<typeof fetchModelMetricsHistory>>>([])
const drillVisible = ref(false)
const drillDim = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

const chartOption = computed(() => {
  const hist = history.value
  const markPoints = hist
    .filter((h) => h.grade_event)
    .map((h) => ({
      name: h.grade_event!.label,
      coord: [h.time.slice(5), h.overall_score],
      value: `${h.grade_event!.from}→${h.grade_event!.to}`,
    }))
  return {
    backgroundColor: 'transparent',
    legend: { top: 0, textStyle: { fontSize: 12 } },
    grid: { top: 36, left: 48, right: 24, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: hist.map((h) => h.time.slice(5)) },
    yAxis: { type: 'value', min: 0.4, max: 1, axisLabel: { formatter: (v: number) => v.toFixed(2) } },
    series: [
      { name: '预测准确性', type: 'line', data: hist.map((h) => h.prediction_score), smooth: true },
      { name: '决策可靠性', type: 'line', data: hist.map((h) => h.decision_score), smooth: true },
      { name: '物理合规性', type: 'line', data: hist.map((h) => h.compliance_score), smooth: true },
      {
        name: '综合评分', type: 'line', data: hist.map((h) => h.overall_score), smooth: true,
        lineStyle: { type: 'dashed' },
        markPoint: markPoints.length ? { data: markPoints, symbolSize: 48 } : undefined,
      },
    ],
  }
})

const compareRows = computed(() => {
  if (!compare.value) return []
  const dims = Object.keys(compare.value.current.scores)
  return dims.map((dim) => {
    const cur = compare.value!.current.scores[dim]
    const prev = compare.value!.previous.scores[dim]
    const delta = +(cur - prev).toFixed(2)
    return { dim, current: cur, previous: prev, delta }
  })
})

const radarOption = computed(() => {
  if (!compare.value) return {}
  const dims = Object.keys(compare.value.current.scores)
  return {
    backgroundColor: 'transparent',
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    tooltip: {},
    radar: { indicator: dims.map((name) => ({ name, max: 1 })), radius: '62%' },
    series: [{
      type: 'radar',
      data: [
        { name: compare.value.current.version, value: dims.map((d) => compare.value!.current.scores[d]) },
        { name: compare.value.previous.version, value: dims.map((d) => compare.value!.previous.scores[d]) },
      ],
    }],
  }
})

const drillContent = computed(() => {
  if (!latest.value || !drillDim.value) return null
  const m = latest.value
  const map: Record<string, { title: string; rows: { label: string; value: string }[] }> = {
    overall: { title: '综合评分', rows: [
      { label: '综合分', value: `${(m.overall_score * 100).toFixed(0)} · ${m.health_grade}级` },
      { label: '预测维度', value: `${(m.prediction_score * 100).toFixed(0)}` },
      { label: '决策维度', value: `${(m.decision_score * 100).toFixed(0)}` },
      { label: '合规维度', value: `${(m.compliance_score * 100).toFixed(0)}` },
    ]},
    mae: { title: 'LSTM 水位 MAE', rows: [
      { label: '24h MAE', value: `${m.water_level_mae_24h.toFixed(3)} m` },
      { label: '预测维度分', value: `${(m.prediction_score * 100).toFixed(0)}` },
    ]},
    safety: { title: '安全规则覆盖率', rows: [
      { label: '覆盖率', value: `${(m.safety_override_rate * 100).toFixed(1)}%` },
      { label: '决策维度分', value: `${(m.decision_score * 100).toFixed(0)}` },
    ]},
    l3: { title: '决策自主率 L3', rows: [
      { label: 'L3 占比', value: `${(m.l3_auto_rate * 100).toFixed(0)}%` },
      { label: '决策维度分', value: `${(m.decision_score * 100).toFixed(0)}` },
    ]},
  }
  return map[drillDim.value] ?? null
})

function openDrill(dim: string) { drillDim.value = dim; drillVisible.value = true }

async function load() {
  loading.value = true
  try {
    latest.value = await fetchModelMetricsLatest(reservoirId.value)
    history.value = await fetchModelMetricsHistory(reservoirId.value)
    detail.value = await fetchModelMetricsDetail(reservoirId.value, { hours: detailHours.value })
    versionOptions.value = await fetchModelVersionOptions(reservoirId.value)
    if (!currentVersion.value) currentVersion.value = versionOptions.value[0]?.version ?? ''
    if (!previousVersion.value) previousVersion.value = versionOptions.value[1]?.version ?? versionOptions.value[0]?.version ?? ''
    compare.value = await fetchModelCompare(reservoirId.value, currentVersion.value, previousVersion.value)
    if (props.fixedMode !== 'compare') healthOverview.value = await fetchModelHealthOverview()
  } finally { loading.value = false }
}

watch(reservoirId, () => { currentVersion.value = ''; previousVersion.value = ''; load() })
watch(detailHours, load)
watch([currentVersion, previousVersion], async () => {
  if (props.fixedMode === 'dashboard') return
  compare.value = await fetchModelCompare(reservoirId.value, currentVersion.value, previousVersion.value)
})

onMounted(async () => {
  reservoirs.value = await fetchReservoirOptions()
  await load()
  refreshTimer = setInterval(load, REFRESH_MS)
})
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div v-loading="loading" class="gateai-panel">
    <div v-if="fixedMode !== 'compare' && healthOverview.length" class="health-overview">
      <span class="health-overview__title">全局健康概览</span>
      <div class="health-overview__list">
        <div v-for="h in healthOverview" :key="h.reservoir_id" class="health-chip" @click="reservoirId = h.reservoir_id">
          <span>{{ h.reservoir_name }}</span>
          <ElTag :color="GRADE_COLOR[h.health_grade]" effect="dark">{{ h.health_grade }} · {{ (h.overall_score * 100).toFixed(0) }}</ElTag>
        </div>
      </div>
    </div>

    <div class="gateai-panel__toolbar">
      <span>水库</span>
      <ElSelect v-model="reservoirId" style="width:200px">
        <ElOption v-for="r in reservoirs" :key="r.id" :label="r.name" :value="r.id" />
      </ElSelect>
      <template v-if="fixedMode === 'compare'">
        <span>当前版</span>
        <ElSelect v-model="currentVersion" style="width:200px">
          <ElOption v-for="v in versionOptions" :key="v.version" :label="`${v.version} (${v.source})`" :value="v.version" />
        </ElSelect>
        <span>对比版</span>
        <ElSelect v-model="previousVersion" style="width:200px">
          <ElOption v-for="v in versionOptions" :key="v.version" :label="`${v.version} (${v.source})`" :value="v.version" />
        </ElSelect>
      </template>
      <div v-if="fixedMode === 'both'" class="view-toggle">
        <button type="button" :class="{ active: viewMode === 'dashboard' }" @click="viewMode = 'dashboard'">健康仪表盘</button>
        <button type="button" :class="{ active: viewMode === 'compare' }" @click="viewMode = 'compare'">版本对比</button>
      </div>
      <template v-if="fixedMode === 'dashboard' || (fixedMode === 'both' && viewMode === 'dashboard')">
        <span>明细范围</span>
        <ElSelect v-model="detailHours" style="width:120px">
          <ElOption :value="8" label="近 8 小时" />
          <ElOption :value="24" label="近 24 小时" />
          <ElOption :value="48" label="近 48 小时" />
        </ElSelect>
      </template>
    </div>

    <template v-if="fixedMode === 'dashboard' || (fixedMode === 'both' && viewMode === 'dashboard')">
      <div v-if="latest" class="metric-cards">
        <div class="metric-card clickable" :style="{ borderColor: GRADE_COLOR[latest.health_grade] }" @click="openDrill('overall')">
          <span>综合评分</span>
          <strong :style="{ color: GRADE_COLOR[latest.health_grade] }">{{ (latest.overall_score * 100).toFixed(0) }} · {{ latest.health_grade }}级</strong>
        </div>
        <div class="metric-card clickable" @click="openDrill('mae')">
          <span>LSTM 水位 MAE(24h)</span><strong>{{ latest.water_level_mae_24h.toFixed(3) }} m</strong>
        </div>
        <div class="metric-card clickable" @click="openDrill('safety')">
          <span>安全规则覆盖率</span><strong>{{ (latest.safety_override_rate * 100).toFixed(1) }}%</strong>
        </div>
        <div class="metric-card clickable" @click="openDrill('l3')">
          <span>决策自主率 L3</span><strong>{{ (latest.l3_auto_rate * 100).toFixed(0) }}%</strong>
        </div>
      </div>

      <div class="metric-chart">
        <h4>近 7 天三维评分趋势</h4>
        <VChart :option="chartOption" autoresize style="height:320px;width:100%" />
      </div>

      <ElTable :data="detail" stripe border>
        <ElTableColumn prop="metric_time" label="时间" min-width="200" />
        <ElTableColumn prop="water_level_mae_24h" label="水位MAE(m)" min-width="130" />
        <ElTableColumn prop="safety_override_rate" label="安全覆盖" min-width="120" />
        <ElTableColumn prop="physics_correction_rate" label="物理修正率" min-width="130" />
        <ElTableColumn prop="gate_limit_touch_rate" label="限位触碰" min-width="120" />
        <ElTableColumn label="综合分" min-width="100" align="center">
          <template #default="{ row }">{{ (row.overall_score * 100).toFixed(0) }}</template>
        </ElTableColumn>
        <ElTableColumn label="等级" min-width="90" align="center">
          <template #default="{ row }">
            <ElTag :color="GRADE_COLOR[row.health_grade]" effect="dark">{{ row.health_grade }}</ElTag>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>

    <template v-else-if="compare && (fixedMode === 'compare' || (fixedMode === 'both' && viewMode === 'compare'))">
      <div class="compare-columns">
        <div class="compare-col">
          <h4>{{ compare.current.version }}</h4>
          <small>{{ compare.current.source }}</small>
          <ul>
            <li v-for="(val, dim) in compare.current.scores" :key="dim">
              <span>{{ dim }}</span><strong>{{ (val * 100).toFixed(0) }}</strong>
            </li>
          </ul>
        </div>
        <div class="compare-vs">vs</div>
        <div class="compare-col">
          <h4>{{ compare.previous.version }}</h4>
          <small>{{ compare.previous.source }}</small>
          <ul>
            <li v-for="(val, dim) in compare.previous.scores" :key="dim">
              <span>{{ dim }}</span><strong>{{ (val * 100).toFixed(0) }}</strong>
            </li>
          </ul>
        </div>
      </div>
      <VChart :option="radarOption" autoresize style="height:340px;width:100%" />
      <ElTable :data="compareRows" stripe border>
        <ElTableColumn prop="dim" label="维度" min-width="200" />
        <ElTableColumn label="当前版" min-width="120" align="right">
          <template #default="{ row }">{{ (row.current * 100).toFixed(0) }}</template>
        </ElTableColumn>
        <ElTableColumn label="对比版" min-width="120" align="right">
          <template #default="{ row }">{{ (row.previous * 100).toFixed(0) }}</template>
        </ElTableColumn>
        <ElTableColumn label="差值" min-width="120" align="right">
          <template #default="{ row }">
            <span :class="row.delta >= 0 ? 'delta-pos' : 'delta-neg'">{{ row.delta >= 0 ? '+' : '' }}{{ (row.delta * 100).toFixed(0) }}</span>
          </template>
        </ElTableColumn>
      </ElTable>
    </template>

    <ElDialog v-model="drillVisible" :title="drillContent?.title ?? '指标详情'" width="440px">
      <ElDescriptions v-if="drillContent" :column="1" border>
        <ElDescriptionsItem v-for="r in drillContent.rows" :key="r.label" :label="r.label">{{ r.value }}</ElDescriptionsItem>
      </ElDescriptions>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/gateai-panel.scss' as gateai;

.health-overview {
  padding: 14px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;
  &__title { font-size: 14px; font-weight: 600; color: #475569; margin-right: 14px; }
  &__list { display: inline-flex; flex-wrap: wrap; gap: 10px; }
}
.health-chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: #fff; border: 1px solid #e2e8f0;
  border-radius: 6px; cursor: pointer; font-size: 14px;
}
.view-toggle { @include gateai.gateai-view-toggle; }
.metric-cards {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
}
.metric-card {
  padding: 18px 20px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;
  span { display: block; font-size: 14px; color: #64748b; margin-bottom: 8px; }
  strong { font-size: 24px; color: #1e293b; }
  &.clickable { cursor: pointer; }
}
.metric-chart {
  width: 100%;
  h4 { margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #334155; }
}
.compare-columns {
  display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: start;
}
.compare-col {
  padding: 18px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;
  h4 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
  small { color: #64748b; font-size: 13px; }
  ul { list-style: none; margin: 14px 0 0; padding: 0; }
  li { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
}
.compare-vs { align-self: center; font-weight: 700; color: #94a3b8; font-size: 20px; }
.delta-pos { color: #16a34a; font-weight: 600; }
.delta-neg { color: #dc2626; font-weight: 600; }
</style>
