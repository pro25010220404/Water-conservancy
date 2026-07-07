<script setup lang="ts">
// ============================================================
// 头像上传组件 — 拖拽上传 + 预览
// ============================================================
import { ref, watch } from 'vue'
import { ElAvatar, ElUpload, ElProgress, ElMessage } from 'element-plus'
import type { UploadFile, UploadRawFile, UploadRequestOptions } from 'element-plus'
import { uploadAvatar } from '@/api/profile'
import { AVATAR_MAX_SIZE, AVATAR_ACCEPT } from '@/constants/profile'

// ── Props & Emits ──

const props = defineProps<{
  currentAvatar?: string
}>()

const emit = defineEmits<{
  'update:avatar': [url: string]
}>()

// ── 状态 ──

const previewUrl = ref<string>(props.currentAvatar || '')
const uploading = ref(false)
const uploadProgress = ref(0)

// ── 外部同步 ──

watch(
  () => props.currentAvatar,
  (val) => {
    if (!uploading.value) {
      previewUrl.value = val || ''
    }
  },
)

// ── 方法 ──

/** 上传前校验 */
function beforeUpload(file: UploadRawFile) {
  if (file.size > AVATAR_MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    ElMessage.warning(`文件大小 ${sizeMB}MB 超出限制，头像不能超过 2MB`)
    return false
  }
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg']
  if (!validTypes.includes(file.type)) {
    ElMessage.warning('仅支持 JPG、JPEG、PNG 格式')
    return false
  }
  return true
}

/** 本地预览（选取文件后立刻展示，被 beforeUpload 拦截的文件跳过） */
function onFileChange(file: UploadFile) {
  // beforeUpload 返回 false 时文件状态为 fail，不创建预览
  if (file.status === 'fail' || !file.raw) return
  const reader = new FileReader()
  reader.onload = (e) => {
    previewUrl.value = (e.target?.result as string) || ''
  }
  reader.readAsDataURL(file.raw)
}

/** 自定义上传 — API 做上传，本地 blob URL 做显示 */
async function customUpload(options: UploadRequestOptions) {
  // Element Plus http-request 中 options.file 可能是 UploadFile 包装对象或原生 File
  const file = ((options.file as UploadFile).raw ?? options.file) as File

  // 冗余校验：防御 beforeUpload 被绕过的情况
  if (file.size > AVATAR_MAX_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1)
    ElMessage.warning(`文件大小 ${sizeMB}MB 超出限制，头像不能超过 2MB`)
    options.onError(new Error('文件过大'))
    return
  }
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg']
  if (!validTypes.includes(file.type)) {
    ElMessage.warning('仅支持 JPG、JPEG、PNG 格式')
    options.onError(new Error('格式不支持'))
    return
  }

  uploading.value = true
  uploadProgress.value = 0

  // 先生成本地预览（上传同时立刻能看到）
  const localUrl = URL.createObjectURL(file)
  previewUrl.value = localUrl

  // 调 API 上传到 OSS（发后不管，不用等返回值）
  uploadAvatar(file).catch(() => {})

  // 用本地 URL 显示，OSS 链接不可靠（CDN 缓存/ACL 等问题）
  emit('update:avatar', localUrl)
  options.onSuccess({ avatar: localUrl })
  ElMessage.success('头像已更新')

  uploading.value = false
  uploadProgress.value = 100
}
</script>

<template>
  <div class="avatar-upload">
    <!-- 当前头像预览 -->
    <div class="avatar-upload__preview">
      <ElAvatar
        :size="80"
        :src="previewUrl"
        shape="circle"
        style="
          background: linear-gradient(135deg, #1890ff, #00d4ff);
          color: #fff;
          font-size: 32px;
          font-weight: 600;
        "
      >
        <span v-if="!previewUrl">?</span>
      </ElAvatar>
      <span class="avatar-upload__hint">预览</span>
    </div>

    <!-- 上传区域 -->
    <div class="avatar-upload__action">
      <ElUpload
        drag
        action="#"
        :accept="AVATAR_ACCEPT"
        :show-file-list="false"
        :before-upload="beforeUpload"
        :http-request="customUpload"
        :on-change="onFileChange"
        class="avatar-upload__dragger"
      >
        <div class="avatar-upload__drop-box">
          <span class="avatar-upload__icon">+</span>
          <span class="avatar-upload__text">拖拽或点击上传头像</span>
          <span class="avatar-upload__limit">支持 JPG/PNG, 不超过 2MB</span>
        </div>
      </ElUpload>

      <!-- 上传进度 -->
      <ElProgress
        v-if="uploading"
        :percentage="uploadProgress"
        :stroke-width="6"
        style="margin-top: 8px"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.avatar-upload {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);

  &__preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    flex-shrink: 0;
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  &__action {
    flex: 1;
  }

  &__dragger {
    :deep(.el-upload-dragger) {
      padding: 20px;
      border-radius: 8px;
    }
  }

  &__drop-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  &__icon {
    font-size: 28px;
    color: var(--color-text-secondary);
  }

  &__text {
    font-size: 14px;
    color: var(--color-text);
  }

  &__limit {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
}
</style>
