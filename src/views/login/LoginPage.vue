<script setup lang="ts">
// ============================================================
// 登录页
// ============================================================
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElInput, ElButton, ElCheckbox, ElMessage } from 'element-plus'
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
const rememberMe = ref(false)
const autoLogin = ref(false)
const loading = ref(false)

const sceneContainer = ref<HTMLElement | null>(null)
const { webglSupported } = useLoginScene(sceneContainer)

const greeting = '欢迎回来'

async function handleLogin() {
  if (!username.value || !password.value) {
    ElMessage.warning('请输入用户名和密码')
    return
  }
  loading.value = true
  try {
    await userStore.login({
      username: username.value,
      password: password.value,
      remember: rememberMe.value,
    })
    ElMessage.success('登录成功')
    router.push((route.query.redirect as string) || '/dashboard/overview')
  } catch {
    // 错误提示由 request 拦截器统一处理
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div ref="sceneContainer"
class="login-bg" :class="{ 'login-bg--fallback': !webglSupported }" />

    <div class="login-form">
      <div class="login-form__card">
        <div class="login-form__header">
          <div class="login-form__logo-wrap">
            <img
:src="logoUrl" alt="logo" class="login-form__logo-img" />
          </div>

          <p class="login-form__overline">HYDROPOWER INTELLIGENT SYSTEM</p>
          <h1 class="login-form__brand-title">
            {{ APP_TITLE }}
          </h1>
          <p class="login-form__brand-desc">
            基于深度强化学习与数字孪生的<br >水电站闸门智能调度平台
          </p>
          <p class="login-form__greeting">
            {{ greeting }}
          </p>
        </div>

        <div class="login-form__body">
          <div class="login-field">
            <div class="login-field__icon">
              <el-icon><User /></el-icon>
            </div>
            <ElInput
              v-model="username"
              placeholder="请输入用户名"
              size="large"
              class="login-field__input"
            />
          </div>

          <div class="login-field">
            <div class="login-field__icon">
              <el-icon><Lock /></el-icon>
            </div>
            <ElInput
              v-model="password"
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password
              class="login-field__input"
              @keyup.enter="handleLogin"
            />
          </div>

          <div class="login-form__options">
            <ElCheckbox v-model="rememberMe"
class="login-form__checkbox"
>
记住密码
</ElCheckbox>
            <ElCheckbox v-model="autoLogin"
class="login-form__checkbox"
>
自动登录
</ElCheckbox>
          </div>

          <ElButton
            type="primary"
            size="large"
            class="login-form__btn"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </ElButton>
        </div>
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
  align-items: center;
  justify-content: center;
}

.login-bg {
  position: absolute;
  inset: 0;
  z-index: 0;

  &--fallback {
    background: var(--color-layout-gradient-login);
  }
}

.login-form {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  padding: 20px;

  &__card {
    width: 100%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px;
    overflow: hidden;
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  &__header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 32px 20px;
    text-align: center;
  }

  &__logo-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 120px;
    height: 120px;
    margin-bottom: 14px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%);
  }

  &__logo-img {
    width: 100px;
    height: 100px;
    object-fit: contain;
    filter: drop-shadow(0 6px 16px rgba(0, 0, 0, 0.2));
  }

  &__overline {
    font-family: 'SF Mono', 'Cascadia Code', monospace;
    font-size: 11px;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.35);
    text-transform: uppercase;
    margin: 0 0 8px;
  }

  &__brand-title {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 1px;
    line-height: 1.3;
  }

  &__brand-desc {
    margin: 0 0 14px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.45);
    line-height: 1.7;
  }

  &__greeting {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.75);
  }

  &__body {
    padding: 4px 32px 36px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  &__options {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 2px 2px 0;
  }

  &__checkbox {
    :deep(.el-checkbox__label) {
      color: rgba(255, 255, 255, 0.65);
      font-size: 13px;
    }

    :deep(.el-checkbox__inner) {
      width: 16px;
      height: 16px;
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.25);
    }

    :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
      background: #1890ff;
      border-color: #1890ff;
    }
  }

  &__btn {
    width: 100%;
    height: 46px;
    margin-top: 24px;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: 5px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
    box-shadow: 0 10px 28px rgba(24, 144, 255, 0.4);
    transition:
      transform 0.2s,
      box-shadow 0.2s;

    &:hover {
      background: linear-gradient(135deg, #40a9ff 0%, #1890ff 100%);
      box-shadow: 0 14px 32px rgba(24, 144, 255, 0.5);
      transform: translateY(-2px);
    }

    &:active {
      transform: translateY(0);
    }
  }
}

.login-field {
  display: flex;
  align-items: stretch;
  height: 48px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  overflow: hidden;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;

  &:focus-within {
    border-color: rgba(24, 144, 255, 0.7);
    box-shadow: 0 0 0 3px rgba(24, 144, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    flex-shrink: 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 22px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  &__input {
    flex: 1;
    min-width: 0;

    :deep(.el-input__wrapper) {
      height: 48px;
      padding: 0 14px;
      background: transparent;
      border: none;
      border-radius: 0;
      box-shadow: none !important;

      .el-input__inner {
        color: #fff;
        font-size: 15px;

        &::placeholder {
          color: rgba(255, 255, 255, 0.3);
          font-size: 13px;
        }
      }
    }

    :deep(.el-input__suffix) {
      color: rgba(255, 255, 255, 0.45);
      font-size: 18px;
    }
  }
}

@media (max-width: 767px) {
  .login-bg {
    background: linear-gradient(170deg, #08121e 0%, #0f1e30 30%, #162c42 100%);
  }

  .login-form {
    padding: 12px;
  }

  .login-form__header {
    padding: 28px 20px 20px;
  }

  .login-form__logo-wrap {
    width: 100px;
    height: 100px;
  }

  .login-form__logo-img {
    width: 82px;
    height: 82px;
  }

  .login-form__brand-title {
    font-size: 22px;
  }

  .login-form__body {
    padding: 4px 20px 28px;
  }
}
</style>
