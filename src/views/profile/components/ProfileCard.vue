<script setup lang="ts">
// ============================================================
// 个人信息卡片 — 展示用户基本资料，触发编辑弹窗
// ============================================================
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElCard, ElAvatar, ElTag, ElButton, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/stores/user'
import { useProfileStore } from '@/stores/profile'
import EditProfileDialog from './EditProfileDialog.vue'

const router = useRouter()
const userStore = useUserStore()
const profileStore = useProfileStore()
const editVisible = ref(false)
const loading = ref(false)

const avatarChar = computed(() => {
  const name =
    profileStore.userInfo?.realname ||
    userStore.userInfo?.nickname ||
    userStore.userInfo?.username ||
    '用户'
  return name.charAt(0)
})

const username = computed(() => userStore.userInfo?.username ?? '未知')
const realname = computed(
  () => profileStore.userInfo?.realname || userStore.userInfo?.nickname || '-',
)

const roleLabel = computed(() => {
  const map: Record<string, string> = {
    operator: '值班运维',
    dispatcher: '调度工程师',
    manager: '站长/管理',
    admin: '系统管理员',
    algorithm_engineer: '算法工程师',
  }
  const roles = userStore.userInfo?.roles ?? []
  return roles.map((r) => map[r] ?? r).join('、') || '未分配'
})

const email = computed(() => profileStore.userInfo?.email || '未填写')
const phone = computed(() => profileStore.userInfo?.phone || '未填写')
const registerTime = computed(() => profileStore.userInfo?.created_at || '-')
const currentAvatarUrl = computed(
  () => profileStore.userInfo?.avatar || userStore.userInfo?.avatar || '',
)

function initProfile() {
  loading.value = true
  if (!profileStore.userInfo) {
    profileStore.setUserInfo({
      id: userStore.userInfo?.id ?? 1,
      account: userStore.userInfo?.username ?? 'admin',
      realname: userStore.userInfo?.nickname ?? '管理员',
      avatar: '',
      role_name: (userStore.userInfo?.roles ?? ['admin'])[0],
      phone: '未填写',
      email: '未填写',
      created_at: new Date().toISOString().slice(0, 10),
    })
  }
  loading.value = false
}

function openEditDialog() {
  editVisible.value = true
}
function onProfileSaved() {
  initProfile()
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确认退出登录？', '提示', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
    userStore.logout()
    router.push('/login')
  } catch {
    // 用户取消，不做任何操作
  }
}

onMounted(() => {
  initProfile()
})
</script>

<template>
  <ElCard v-loading="loading" class="profile-card" shadow="never">
    <template #header>
      <div class="profile-card__header">
        <span>个人信息</span>
        <div class="profile-card__actions">
          <ElButton
type="primary" @click="openEditDialog"> 编辑 </ElButton>
          <ElButton
type="danger" @click="handleLogout"> 退出登录 </ElButton>
        </div>
      </div>
    </template>

    <div class="profile-info">
      <!-- 头像 -->
      <div class="profile-info__avatar">
        <ElAvatar
          :size="96"
          :src="currentAvatarUrl"
          style="
            background: linear-gradient(135deg, #1890ff, #00d4ff);
            color: #fff;
            font-size: 38px;
            font-weight: 600;
          "
        >
          {{ avatarChar }}
        </ElAvatar>
      </div>

      <!-- 信息字段 -->
      <div class="profile-info__fields">
        <div class="profile-info__row">
          <span class="profile-info__label">用户名</span>
          <span class="profile-info__value">{{ username }}</span>
        </div>
        <div class="profile-info__row">
          <span class="profile-info__label">姓名</span>
          <span class="profile-info__value">{{ realname }}</span>
        </div>
        <div class="profile-info__row">
          <span class="profile-info__label">角色</span>
          <span class="profile-info__value">
            <ElTag>{{ roleLabel }}</ElTag>
          </span>
        </div>
        <div class="profile-info__row">
          <span class="profile-info__label">邮箱</span>
          <span class="profile-info__value">{{ email || '未填写' }}</span>
        </div>
        <div class="profile-info__row">
          <span class="profile-info__label">手机号</span>
          <span class="profile-info__value">{{ phone || '未填写' }}</span>
        </div>
        <div class="profile-info__row">
          <span class="profile-info__label">注册时间</span>
          <span class="profile-info__value">{{ registerTime }}</span>
        </div>
      </div>
    </div>

    <!-- 编辑资料弹窗 -->
    <EditProfileDialog
      :visible="editVisible"
      @update:visible="editVisible = $event"
      @saved="onProfileSaved"
    />
  </ElCard>
</template>

<style scoped lang="scss">
.profile-card {
  :deep(.el-card__header) {
    padding: 18px 24px;
    font-weight: 600;
    font-size: 20px;
    border-bottom: 1px solid var(--color-border);
  }

  :deep(.el-card__body) {
    padding: 22px 24px;
  }

  :deep(.el-button) {
    font-size: 15px;
    padding: 10px 18px;
  }
}

.profile-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profile-card__actions {
  display: flex;
  gap: 8px;
}

.profile-info {
  display: flex;
  gap: var(--spacing-xl);
  align-items: flex-start;

  &__avatar {
    flex-shrink: 0;
  }

  &__fields {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  &__row {
    display: flex;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--color-border);
  }

  &__label {
    width: 100px;
    flex-shrink: 0;
    color: var(--color-text-secondary);
    font-size: 16px;
  }

  &__value {
    font-size: 17px;
    color: var(--color-text);
    font-weight: 500;
  }
}
</style>
