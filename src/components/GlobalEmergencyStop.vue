<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus'
import { globalEmergencyStop } from '@/api/emergency'
import { useOperationLog } from '@/composables/useOperationLog'

const { placement = 'header' } = defineProps<{
  /** header：页眉内嵌；floating：左下角悬浮（备用） */
  placement?: 'header' | 'floating'
}>()

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
  } catch {
    /* 用户取消 */
  }
}
</script>

<template>
  <button
    type="button"
    class="global-estop"
    :class="`global-estop--${placement}`"
    title="全局紧急停止"
    aria-label="全局紧急停止"
    @click="handleClick"
  >
    急停
  </button>
</template>

<style scoped lang="scss">
.global-estop {
  border: none;
  cursor: pointer;
  color: #fff;
  font-weight: 800;
  letter-spacing: 0.08em;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &--header {
    flex-shrink: 0;
    height: 36px;
    padding: 0 20px;
    border-radius: 8px;
    background: linear-gradient(145deg, #ff4757, #e02020);
    font-size: 15px;
    box-shadow: 0 2px 12px rgba(255, 71, 87, 0.45);
    animation: global-estop-pulse-header 2s ease-in-out infinite;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 18px rgba(255, 71, 87, 0.65);
    }

    &:active {
      transform: translateY(0);
    }
  }

  &--floating {
    position: fixed;
    left: 28px;
    bottom: 28px;
    z-index: 3000;
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: linear-gradient(145deg, #ff4757, #e02020);
    font-size: 16px;
    box-shadow: 0 4px 20px rgba(255, 71, 87, 0.45);
    animation: global-estop-pulse 2s ease-in-out infinite;

    &:hover {
      transform: scale(1.08);
      box-shadow: 0 6px 28px rgba(255, 71, 87, 0.75);
    }

    &:active {
      transform: scale(0.94);
    }
  }
}

@keyframes global-estop-pulse-header {
  0%,
  100% {
    box-shadow: 0 2px 10px rgba(255, 71, 87, 0.35);
  }
  50% {
    box-shadow: 0 2px 20px rgba(255, 71, 87, 0.75);
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
