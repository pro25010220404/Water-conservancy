<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { globalEmergencyStop } from '@/api/emergency'
import { useOperationLog } from '@/composables/useOperationLog'
import { isReplaying } from '@/composables/useReplayMode'

const { record: recordLog } = useOperationLog()

async function handleClick() {
  try {
    await ElMessageBox.confirm(
      '确认立即紧急停止？所有闸门执行将中断，开度归零，运行中的仿真将暂停。',
      '全局紧急停止',
      { type: 'error', confirmButtonText: '确认急停', cancelButtonText: '取消' },
    )
    await globalEmergencyStop()
    recordLog('全局', '急停', '触发紧急停止 · 闸门已关闭', 1)
    ElMessage.error('急停已执行 · 所有闸门已关闭')
  } catch { /* 用户取消 */ }
}
</script>

<template>
  <Teleport to="body">
    <button
      type="button"
      class="global-estop"
      :class="{ 'global-estop--disabled': isReplaying }"
      :title="isReplaying ? '回放中不可急停' : '全局紧急停止'"
      :aria-label="isReplaying ? '回放中不可急停' : '全局紧急停止'"
      :disabled="isReplaying"
      @click="handleClick"
    >
      急停
    </button>
  </Teleport>
</template>

<style scoped lang="scss">
.global-estop {
  position: fixed;
  left: 28px;
  bottom: 28px;
  z-index: 3000;
  width: 76px;
  height: 76px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(145deg, #ff4757, #e02020);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(255, 71, 87, 0.45);
  animation: global-estop-pulse 2s ease-in-out infinite;
  transition: transform 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 28px rgba(255, 71, 87, 0.75);
  }

  &:active {
    transform: scale(0.94);
  }

  &--disabled {
    background: #9ca3af;
    cursor: not-allowed;
    animation: none;
    box-shadow: 0 2px 8px rgba(156, 163, 175, 0.35);

    &:hover {
      transform: none;
      box-shadow: 0 2px 8px rgba(156, 163, 175, 0.35);
    }

    &:active {
      transform: none;
    }
  }
}

@keyframes global-estop-pulse {
  0%,
  100% {
    box-shadow: 0 4px 16px rgba(255, 71, 87, 0.35);
  }
  50% {
    box-shadow: 0 4px 32px rgba(255, 71, 87, 0.8);
  }
}
</style>
