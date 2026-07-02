<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElCard, ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
import { APP_TITLE } from '@/constants'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const username = ref('')
const password = ref('')
const loading = ref(false)

async function handleLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  loading.value = true
  try {
    await userStore.login({ username: username.value, password: password.value })
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-page__card">
      <h2 class="login-page__title">{{ APP_TITLE }}</h2>
      <el-form @submit.prevent="handleLogin">
        <el-form-item>
          <el-input v-model="username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="login-page__submit" :loading="loading" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a1628 0%, #0d2137 100%);

  &__card {
    width: 400px;
    background: rgba(17, 42, 69, 0.9);
    border: 1px solid var(--color-border);
  }

  &__title {
    text-align: center;
    margin-bottom: var(--spacing-xl);
    font-size: var(--font-size-xl);
    color: var(--color-accent);
  }

  &__submit {
    width: 100%;
  }
}
</style>
