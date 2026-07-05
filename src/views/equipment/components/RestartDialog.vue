<script setup lang="ts">
// ============================================================
// 远程重启弹窗 — 按设备类型显示不同警告
// ============================================================

import { ref, computed, watch } from 'vue'
import { ElDialog, ElForm, ElFormItem, ElInput, ElButton, ElIcon } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'

const props = defineProps<{
  visible: boolean
  deviceName: string
  deviceType: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [reason: string]
}>()

// ── 表单 ──
const reason = ref('')
const submitting = ref(false)

// ── 根据设备类型显示不同警告 ──
const warningText = computed(() => {
  switch (props.deviceType) {
    case 'sensor':
    case 'level_sensor':
    case 'flow_sensor':
      return '数据中断约 30 秒'
    case 'plc':
      return 'PLC 重启将导致所有控制中断！请先切换手动模式'
    case 'gateway':
    case 'edge_gateway':
      return '边缘网关重启将中断 AI 推理！断网自治模式将接管'
    default:
      return '重启操作将导致设备短暂中断，请确认后执行'
  }
})

const isHighRisk = computed(() => {
  return (
    props.deviceType === 'plc' ||
    props.deviceType === 'gateway' ||
    props.deviceType === 'edge_gateway'
  )
})

// ── 弹窗开关 ──
const dialogVisible = computed({
  get: () => props.visible,
  set: (val: boolean) => emit('update:visible', val),
})

// ── 确认 ──
function handleConfirm() {
  if (!reason.value.trim()) {
    return
  }
  emit('confirm', reason.value.trim())
}

// ── 关闭时重置 ──
watch(
  () => props.visible,
  (val) => {
    if (!val) {
      reason.value = ''
      submitting.value = false
    }
  },
)
</script>

<template>
  <ElDialog
    v-model="dialogVisible"
    title="远程重启设备"
    width="520px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="restart-dialog">
      <!-- 警告横幅 -->
      <div class="restart-dialog__warn" :class="{ 'restart-dialog__warn--high': isHighRisk }">
        <ElIcon v-if="isHighRisk" :size="20">
          <WarningFilled />
        </ElIcon>
        <span>{{ warningText }}</span>
      </div>

      <!-- 设备名称 -->
      <p class="restart-dialog__device">
        设备名称：<strong>{{ deviceName }}</strong>
      </p>

      <!-- 重启原因表单 -->
      <ElForm label-width="80px" class="restart-dialog__form">
        <ElFormItem label="重启原因" required>
          <ElInput
            v-model="reason"
            type="textarea"
            :rows="3"
            placeholder="请填写重启原因（必填）"
            maxlength="200"
            show-word-limit
          />
        </ElFormItem>
      </ElForm>
    </div>

    <template #footer>
      <ElButton @click="dialogVisible = false"> 取消 </ElButton>
      <ElButton
        type="danger"
        :loading="submitting"
        :disabled="!reason.trim()"
        @click="handleConfirm"
      >
        确认重启
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.restart-dialog {
  &__warn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    border-radius: var(--border-radius-base);
    color: #ef4444;
    font-size: var(--font-size-sm);
    line-height: 1.5;

    &--high {
      background: rgba(245, 158, 11, 0.1);
      border-color: rgba(245, 158, 11, 0.3);
      color: #d97706;
    }
  }

  &__device {
    margin-top: var(--spacing-md);
    font-size: var(--font-size-base);
    color: var(--color-text);

    strong {
      color: var(--color-primary);
    }
  }

  &__form {
    margin-top: var(--spacing-md);
  }
}
</style>
