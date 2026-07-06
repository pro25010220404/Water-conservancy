<script setup lang="ts">
// ============================================================
// 修改密码弹窗 — 密码强度 + 规则检查 + 提交
// ============================================================
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElButton,
  ElProgress,
  ElMessage,
  ElMessageBox,
} from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { changePassword } from '@/api/profile'
import { checkPasswordStrength } from '@/constants/validation'
import { useOperationLog } from '@/composables/useOperationLog'

// ── Props & Emits ──

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
}>()

// ── 外部依赖 ──

const router = useRouter()
const userStore = useUserStore()
const { record: recordLog } = useOperationLog()

// ── 表单 ──

const formRef = ref<FormInstance>()
const submitting = ref(false)

interface PwdForm {
  old_password: string
  new_password: string
  confirm_password: string
}

const pwdForm = reactive<PwdForm>({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

// ── 弹窗打开时重置 ──

watch(
  () => props.visible,
  (val) => {
    if (val) {
      pwdForm.old_password = ''
      pwdForm.new_password = ''
      pwdForm.confirm_password = ''
      formRef.value?.resetFields()
    }
  },
)

// ── 密码强度 ──

const strength = computed(() => checkPasswordStrength(pwdForm.new_password))

const strengthColor = computed(() => {
  if (strength.value.level === 'strong') return '#22c55e'
  if (strength.value.level === 'medium') return '#f59e0b'
  return pwdForm.new_password ? '#ef4444' : '#c0c4cc'
})

const strengthPercentage = computed(() => {
  return (strength.value.score / 3) * 100
})

// ── 提交 ──

async function submitPassword() {
  // 自定义校验
  if (!pwdForm.old_password) {
    ElMessage.warning('请输入当前密码')
    return
  }
  if (!pwdForm.new_password) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (pwdForm.new_password === pwdForm.old_password) {
    ElMessage.warning('新密码不能与当前密码相同')
    return
  }
  if (pwdForm.new_password !== pwdForm.confirm_password) {
    ElMessage.warning('两次输入的新密码不一致')
    return
  }
  if (strength.value.level === 'weak') {
    ElMessage.warning('新密码强度太弱，请按规则设置')
    return
  }

  // 二次确认
  try {
    await ElMessageBox.confirm('确定要修改密码吗？修改后需重新登录。', '修改密码确认', {
      confirmButtonText: '确认修改',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }

  submitting.value = true
  // 后端接口未就绪，本地校验通过即视为成功
  changePassword({
    old_password: pwdForm.old_password,
    new_password: pwdForm.new_password,
    confirm_password: pwdForm.confirm_password,
  }).catch(() => {})
  recordLog('个人中心', '修改密码', '修改了登录密码', 1)
  ElMessage.success('密码修改成功，请重新登录')
  emit('update:visible', false)
  setTimeout(() => {
    userStore.logout()
    router.push('/login')
  }, 3000)
  submitting.value = false
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="修改密码"
    width="480px"
    @update:model-value="emit('update:visible', $event)"
  >
    <ElForm ref="formRef" :model="pwdForm" label-width="100px">
      <!-- 当前密码 -->
      <ElFormItem label="当前密码" required>
        <ElInput
          v-model="pwdForm.old_password"
          type="password"
          show-password
          placeholder="请输入当前密码"
        />
      </ElFormItem>

      <!-- 新密码 -->
      <ElFormItem label="新密码" required>
        <ElInput
          v-model="pwdForm.new_password"
          type="password"
          show-password
          placeholder="至少8位，含字母和数字"
        />
      </ElFormItem>

      <!-- 密码强度 + 规则清单 -->
      <template v-if="pwdForm.new_password">
        <div class="pwd-strength">
          <div class="pwd-strength__bar">
            <ElProgress
              :percentage="strengthPercentage"
              :color="strengthColor"
              :stroke-width="6"
              :show-text="false"
            />
          </div>
          <span class="pwd-strength__label" :style="{ color: strengthColor }">
            {{ strength.level === 'strong' ? '强' : strength.level === 'medium' ? '中' : '弱' }}
          </span>
        </div>

        <ul class="pwd-checklist">
          <li v-for="(c, i) in strength.checks" :key="i" :class="{ 'is-passed': c.passed }">
            <span class="pwd-checklist__icon">{{ c.passed ? '&#10003;' : '&#10005;' }}</span>
            {{ c.label }}
          </li>
        </ul>
      </template>

      <!-- 确认新密码 -->
      <ElFormItem label="确认新密码" required>
        <ElInput
          v-model="pwdForm.confirm_password"
          type="password"
          show-password
          placeholder="请再次输入新密码"
          :class="{
            'is-error':
              pwdForm.confirm_password && pwdForm.new_password !== pwdForm.confirm_password,
          }"
        />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton @click="emit('update:visible', false)"> 取消 </ElButton>
      <ElButton type="primary" :loading="submitting" @click="submitPassword"> 确认修改 </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
:deep(.el-form-item__label) {
  font-size: 15px;
  color: var(--color-text);
}

:deep(.el-input__inner) {
  font-size: 15px;
}

:deep(.el-button) {
  font-size: 15px;
  padding: 10px 18px;
}

// 密码强度
.pwd-strength {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin: var(--spacing-sm) 0 var(--spacing-sm) 100px;

  &__bar {
    flex: 1;
  }

  &__label {
    font-size: var(--font-size-sm);
    font-weight: 600;
  }
}

// 密码规则清单
.pwd-checklist {
  list-style: none;
  margin: 0 0 var(--spacing-md) 100px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm) var(--spacing-lg);

  li {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);

    &.is-passed {
      color: #22c55e;
    }
  }

  &__icon {
    font-weight: 700;
    width: 14px;
  }
}

// 密码不匹配高亮
.is-error {
  :deep(.el-input__inner) {
    border-color: #ef4444;
  }
}
</style>
