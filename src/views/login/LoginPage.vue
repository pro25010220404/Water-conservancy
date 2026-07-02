<script setup lang="ts">
// ============================================================
// 登录页
// ============================================================
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { APP_TITLE } from '@/constants'
import { useUserStore } from '@/stores/user'
import { useLoginScene } from '@/composables/useLoginScene'
import logoUrl from '@/assets/images/logo.png'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const username = ref('')
const password = ref('')
const loading = ref(false)

const sceneContainer = ref<HTMLElement | null>(null)
const { webglSupported } = useLoginScene(sceneContainer)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h >= 5 && h < 8) return '早上好'
  if (h >= 8 && h < 12) return '上午好'
  if (h >= 12 && h < 14) return '中午好'
  if (h >= 14 && h < 17) return '下午好'
  if (h >= 17 && h < 20) return '傍晚好'
  return '晚上好'
})

async function handleLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await userStore.login({ username: username.value, password: password.value })
    ElMessage.success('登录成功')
    router.push((route.query.redirect as string) || '/dashboard')
  } catch {
    ElMessage.error('用户名或密码错误')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Three.js 背景 -->
    <div ref="sceneContainer" class="login-bg" :class="{ 'login-bg--fallback': !webglSupported }" />

    <!-- 左侧品牌 -->
    <div class="login-brand">
      <p class="login-brand__overline">HYDROPOWER INTELLIGENT SYSTEM</p>
      <h1 class="login-brand__title">{{ APP_TITLE }}</h1>
      <p class="login-brand__desc">
        基于深度强化学习与数字孪生的<br />水电站闸门智能调度平台
      </p>
    </div>

    <!-- 登录表单 -->
    <div class="login-form">
      <div class="login-form__card">
        <!-- Logo -->
        <div class="login-form__logo">
          <img :src="logoUrl" alt="logo" class="login-form__logo-img" />
          <span class="login-form__logo-text">{{ APP_TITLE }}</span>
        </div>

        <p class="login-form__greeting">{{ greeting }}，欢迎回来</p>

        <el-form @submit.prevent="handleLogin">
          <el-form-item>
            <el-input
              v-model="username"
              placeholder="用户名"
              size="large"
              :prefix-icon="User"
              class="dark-input"
            />
          </el-form-item>

          <el-form-item>
            <el-input
              v-model="password"
              type="password"
              placeholder="密码"
              size="large"
              :prefix-icon="Lock"
              show-password
              class="dark-input"
              @keyup.enter="handleLogin"
            />
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              class="login-form__btn"
              :loading="loading"
              @click="handleLogin"
            >
              登 录
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
}

.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;

  &--fallback {
    background: linear-gradient(170deg, #0f1a2e 0%, #162540 30%, #1a2f4a 100%);
  }
}

// ── 左侧品牌区 ──
.login-brand {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 80px 64px;
  pointer-events: none;
  user-select: none;

  &__overline {
    font-family: 'SF Mono', 'Cascadia Code', monospace;
    font-size: 11px;
    letter-spacing: 4px;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    margin: 0 0 24px;
  }

  &__title {
    font-size: 42px;
    font-weight: 300;
    color: #fff;
    margin: 0 0 20px;
    letter-spacing: 2px;
    line-height: 1.2;
  }

  &__desc {
    font-size: 15px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.8;
    margin: 0;
  }
}

// ── 右侧表单 ──
.login-form {
  position: relative;
  z-index: 1;
  width: 480px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  margin-right: 56px;

  &__card {
    width: 100%;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 18px;
    padding: 44px 44px 52px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 36px;
  }

  &__logo-img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }

  &__logo-text {
    font-size: 22px;
    font-weight: 500;
    color: #fff;
    letter-spacing: 1px;
  }

  &__greeting {
    font-size: 18px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 0 32px;
  }

  &__btn {
    width: 100%;
    height: 48px;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 3px;
    border-radius: 10px;
    margin-top: 4px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #fff;
    transition: all 0.25s;

    &:hover {
      background: rgba(255, 255, 255, 0.18);
      border-color: rgba(255, 255, 255, 0.3);
    }
  }
}

// ── 暗色输入框 ──
:deep(.dark-input) {
  .el-input__wrapper {
    background: rgba(255, 255, 255, 0.04);
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0;
    box-shadow: none;
    padding: 4px 0;
    transition: border-color 0.25s;

    .el-input__inner {
      color: #fff;
      font-size: 16px;

      &::placeholder {
        color: rgba(255, 255, 255, 0.2);
      }
    }

    &:hover {
      border-bottom-color: rgba(255, 255, 255, 0.25);
    }

    &.is-focus {
      border-bottom-color: rgba(255, 255, 255, 0.55);
      box-shadow: none;
    }
  }

  .el-input__prefix {
    color: rgba(255, 255, 255, 0.25);
    font-size: 18px;
  }

  .el-input__suffix {
    color: rgba(255, 255, 255, 0.25);
  }
}

// ── 响应式 ──
@media (max-width: 1023px) {
  .login-brand { display: none; }
  .login-form { width: 100%; margin: 0 auto; padding: 24px; }
  .login-form__card { max-width: 400px; margin: 0 auto; padding: 40px 32px; }
}
@media (max-width: 767px) {
  .login-bg { background: linear-gradient(170deg, #08121e 0%, #0f1e30 30%, #162c42 100%); }
  .login-form__card { padding: 32px 24px; }
}
</style>
