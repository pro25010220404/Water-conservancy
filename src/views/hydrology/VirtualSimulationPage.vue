<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { ElButton, ElSlider, ElInputNumber, ElTag, ElMessage } from 'element-plus'
import GlassPanel3D from '@/components/cockpit/GlassPanel3D.vue'
import DamSectionDiagram from '@/views/dispatch/components/DamSectionDiagram.vue'
import { useVirtualSimulationStore } from '@/stores/virtualSimulation'
import { useDispatchStore } from '@/stores/dispatch'
import { storeToRefs } from 'pinia'

const simStore = useVirtualSimulationStore()
const dispatchStore = useDispatchStore()

const { active, locked, upstreamLevel, rainfall, derived } = storeToRefs(simStore)
const { gates, selectedGateId, status } = storeToRefs(dispatchStore)

const aggregateOpening = computed(() => derived.value.aggregateOpening)

async function refreshPreview() {
  await dispatchStore.refreshGates()
}

function onParamChange() {
  if (!locked.value) {
    simStore.applySimulation()
    refreshPreview()
  }
}

function handleApply() {
  simStore.applySimulation()
  refreshPreview()
  ElMessage.success('仿真参数已应用，全系统数据已联动')
}

function handleReset() {
  simStore.resetSimulation()
  refreshPreview()
  ElMessage.info('已重置为实时监测基准值')
}

function toggleLock() {
  simStore.toggleLock()
  ElMessage.info(locked.value ? '参数已锁定' : '参数已解锁')
}

watch([upstreamLevel, rainfall], () => {
  if (active.value && !locked.value) refreshPreview()
})

onMounted(async () => {
  await dispatchStore.refreshCore()
  if (!selectedGateId.value && gates.value.length) {
    selectedGateId.value = gates.value[0].id
  }
})
</script>

<template>
  <div class="vsim-page">
    <div class="vsim-guide">
      <strong>操作引导</strong>
      <span>拖动左侧滑块调节上游水位与降雨量，坝体剖面与流量指标将实时联动；应用后切换至节点控制、监控大屏、数字孪生页面数据同步更新。</span>
      <ElTag v-if="active" type="success" size="large">仿真生效中</ElTag>
      <ElTag v-else type="info" size="large">待应用</ElTag>
    </div>

    <div class="vsim-layout">
      <!-- 左：参数控制 -->
      <GlassPanel3D title="虚拟仿真参数调节" fill class="vsim-panel vsim-panel--ctrl">
        <p class="vsim-hint">手动调参模式（非 AI 训练），调节后立即预览联动效果。</p>

        <div class="vsim-param">
          <div class="vsim-param__head">
            <span class="vsim-param__label">上游水位</span>
            <strong class="vsim-param__value">{{ upstreamLevel.toFixed(1) }} <small>m</small></strong>
          </div>
          <ElSlider
            v-model="upstreamLevel"
            :min="110"
            :max="200"
            :step="0.1"
            :disabled="locked"
            show-input
            @change="onParamChange"
          />
        </div>

        <div class="vsim-param">
          <div class="vsim-param__head">
            <span class="vsim-param__label">降雨量</span>
            <strong class="vsim-param__value">{{ rainfall.toFixed(1) }} <small>mm/h</small></strong>
          </div>
          <ElSlider
            v-model="rainfall"
            :min="0"
            :max="120"
            :step="0.5"
            :disabled="locked"
            show-input
            @change="onParamChange"
          />
        </div>

        <div class="vsim-actions">
          <ElButton size="large" @click="handleReset">重置参数</ElButton>
          <ElButton size="large" :type="locked ? 'warning' : 'default'" @click="toggleLock">
            {{ locked ? '解锁调节' : '锁定模拟' }}
          </ElButton>
          <ElButton size="large" type="primary" @click="handleApply">一键应用仿真</ElButton>
        </div>
      </GlassPanel3D>

      <!-- 右：预览 -->
      <GlassPanel3D title="实时仿真预览" fill class="vsim-panel vsim-panel--preview">
        <div class="vsim-metrics">
          <div class="vsim-metric">
            <span>聚合总开度</span>
            <strong>{{ aggregateOpening }}%</strong>
          </div>
          <div class="vsim-metric">
            <span>入库流量</span>
            <strong>{{ derived.inflowRate }} <small>m³/s</small></strong>
          </div>
          <div class="vsim-metric">
            <span>出库流量</span>
            <strong>{{ derived.outflowRate }} <small>m³/s</small></strong>
          </div>
          <div class="vsim-metric">
            <span>水位趋势</span>
            <strong>{{ derived.waterTrend === 'up' ? '趋升' : derived.waterTrend === 'down' ? '趋降' : '平衡' }}</strong>
          </div>
        </div>

        <DamSectionDiagram
          :gates="gates"
          :selected-gate-id="selectedGateId"
          :upstream-level="derived.upstreamLevel"
          :downstream-level="derived.downstreamLevel"
          :inflow-rate="derived.inflowRate"
          :outflow-rate="derived.outflowRate"
          @select="(id) => (selectedGateId = id)"
        />
      </GlassPanel3D>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/assets/styles/cockpit.scss' as *;

.vsim-page {
  @include cockpit-page-base;
  @include cockpit-typography;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px 28px;
  min-height: calc(100vh - 110px);
}

.vsim-guide {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding: 14px 20px;
  background: rgba(24, 144, 255, 0.08);
  border: 1px solid rgba(24, 144, 255, 0.18);
  border-radius: 12px;
  font-size: $cockpit-font-sm;
  color: $cockpit-text;

  strong { font-size: $cockpit-font-md; color: #1890ff; }
}

.vsim-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  min-height: 520px;

  @media (max-width: 1100px) { grid-template-columns: 1fr; }
}

.vsim-panel--ctrl :deep(.glass-panel__body) {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 24px;
}

.vsim-panel--preview :deep(.glass-panel__body) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 20px 20px;
  min-height: 0;
}

.vsim-hint {
  margin: 0;
  font-size: $cockpit-font-sm;
  color: $cockpit-text-dim;
  line-height: 1.6;
}

.vsim-param__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 12px;
}

.vsim-param__label {
  font-size: $cockpit-font-md;
  font-weight: 600;
  color: $cockpit-text;
}

.vsim-param__value {
  font-size: 32px;
  font-weight: 700;
  font-family: monospace;
  color: #1890ff;

  small { font-size: 14px; color: $cockpit-text-dim; }
}

.vsim-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: auto;

  .el-button { width: 100%; height: 44px; font-size: 16px; }
}

.vsim-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 900px) { grid-template-columns: repeat(2, 1fr); }
}

.vsim-metric {
  padding: 16px 18px;
  background: #f8fafc;
  border: 1px solid #eef2f6;
  border-radius: 12px;

  span {
    display: block;
    font-size: 13px;
    color: $cockpit-text-dim;
    margin-bottom: 6px;
  }

  strong {
    font-size: 24px;
    font-weight: 700;
    font-family: monospace;
    color: $cockpit-text;

    small { font-size: 12px; font-weight: 500; color: $cockpit-text-dim; }
  }
}
</style>
