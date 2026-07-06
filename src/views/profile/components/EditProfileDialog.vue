<script setup lang="ts">
// ============================================================
// 编辑个人信息弹窗 — 含头像上传、姓名/邮箱/手机号表单
// ============================================================
import { ref, reactive, watch } from 'vue'
import { ElDialog, ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useProfileStore } from '@/stores/profile'
import { useOperationLog } from '@/composables/useOperationLog'
import AvatarUpload from './AvatarUpload.vue'

// ── Props & Emits ──

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  saved: []
}>()

// ── Stores & composables ──

const userStore = useUserStore()
const profileStore = useProfileStore()
const { record: recordLog } = useOperationLog()

// ── 表单 ──

const formRef = ref<FormInstance>()
const submitting = ref(false)

interface EditForm {
  avatar: string
  realname: string
  phone: string
}

const form = reactive<EditForm>({
  avatar: '',
  realname: '',
  phone: '',
})

const rules = {
  realname: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { min: 2, max: 20, message: '2-20个字符', trigger: 'blur' },
  ],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的11位手机号', trigger: 'blur' }],
} as const

// ── 弹窗打开时回填数据 ──

watch(
  () => props.visible,
  (val) => {
    if (val) {
      formRef.value?.resetFields()
      form.avatar = profileStore.userInfo?.avatar || userStore.userInfo?.avatar || ''
      form.realname = profileStore.userInfo?.realname || userStore.userInfo?.nickname || ''
      const phone = profileStore.userInfo?.phone || ''
      form.phone = phone === '未填写' ? '' : phone
    }
  },
)

// ── 提交 ──

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  // 后端接口未就绪，本地保存
  if (profileStore.userInfo) {
    profileStore.userInfo.realname = form.realname
    profileStore.userInfo.phone = form.phone
    profileStore.userInfo.avatar = form.avatar
  }
  if (userStore.userInfo) {
    userStore.userInfo.nickname = form.realname
    if (form.avatar) userStore.userInfo.avatar = form.avatar
  }
  recordLog('个人中心', '修改', '更新了个人资料', 1)
  ElMessage.success('资料已更新')
  emit('saved')
  emit('update:visible', false)
  submitting.value = false
}

function onAvatarUpdate(url: string) {
  form.avatar = url
}
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="编辑个人信息"
    width="480px"
    @update:model-value="emit('update:visible', $event)"
  >
    <ElForm ref="formRef" :model="form" :rules="rules" label-width="80px">
      <!-- 头像 -->
      <ElFormItem label="头像">
        <AvatarUpload :current-avatar="form.avatar" @update:avatar="onAvatarUpdate" />
      </ElFormItem>

      <!-- 姓名 -->
      <ElFormItem label="姓名" prop="realname">
        <ElInput v-model="form.realname" maxlength="20" placeholder="2-20个字符" />
      </ElFormItem>

      <!-- 手机号 -->
      <ElFormItem label="手机号" prop="phone">
        <ElInput v-model="form.phone" maxlength="11" placeholder="11位手机号（选填）" />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton @click="emit('update:visible', false)"> 取消 </ElButton>
      <ElButton type="primary" :loading="submitting" @click="submit"> 保存 </ElButton>
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
</style>
