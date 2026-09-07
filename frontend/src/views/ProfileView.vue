<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import api from '@/api';
import { useAuthStore } from '@/stores';
import { useI18n } from '@/i18n';
import PasswordInput from '@/components/PasswordInput.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();
const name = ref(auth.user?.name || '');
const currentPassword = ref('');
const password = ref('');
const confirmPassword = ref('');
const message = ref('');
const error = ref('');
const saving = ref(false);

const passwordsMatch = computed(() => {
  if (!password.value && !confirmPassword.value) return null;
  return password.value === confirmPassword.value;
});

onMounted(async () => {
  try {
    await auth.fetchMe();
  } catch { /* ignore */ }
  if (auth.user) name.value = auth.user.name;
});

function mapError(msg) {
  if (!msg) return t('profileError');
  if (msg.includes('Current password is required')) return t('currentPasswordRequired');
  if (msg.includes('Current password is incorrect')) return t('currentPasswordWrong');
  return msg;
}

async function submit() {
  message.value = '';
  error.value = '';
  if (password.value && password.value !== confirmPassword.value) {
    error.value = t('passwordsMismatch');
    return;
  }
  if (password.value && !currentPassword.value && auth.user?.has_password) {
    error.value = t('currentPasswordRequired');
    return;
  }
  saving.value = true;
  try {
    const payload = { name: name.value.trim() };
    if (password.value) {
      payload.password = password.value;
      if (currentPassword.value) payload.currentPassword = currentPassword.value;
    }
    const { data } = await api.put('/auth/profile', payload);
    auth.user = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    message.value = t('profileSaved');
    currentPassword.value = '';
    password.value = '';
    confirmPassword.value = '';
    setTimeout(() => router.push('/my-account'), 1200);
  } catch (e) {
    error.value = mapError(e.response?.data?.error);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="container py-4 k5-profile-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before profile" />
    <h1 class="k5-account-title">{{ t('updateProfile') }}</h1>
    <p class="mb-4">
      <RouterLink to="/my-account" class="text-decoration-none">
        <i class="bi bi-arrow-left me-1"></i>{{ t('myAccount') }}
      </RouterLink>
    </p>

    <div class="k5-profile-form">
      <div v-if="message" class="alert alert-success py-2">{{ message }}</div>
      <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>
      <form @submit.prevent="submit">
        <div class="k5-profile-field">
          <label class="k5-profile-label">{{ t('firstName') }}</label>
          <input v-model="name" type="text" class="form-control k5-profile-input" required />
        </div>
        <div class="k5-profile-field">
          <label class="k5-profile-label">{{ t('email') }}</label>
          <input :value="auth.user?.email" type="email" class="form-control k5-profile-input" disabled />
        </div>
        <div class="k5-profile-field">
          <label class="k5-profile-label">{{ t('currentPassword') }}</label>
          <small class="k5-profile-hint d-block">{{ t('currentPasswordHint') }}</small>
          <PasswordInput v-model="currentPassword" autocomplete="current-password" />
        </div>
        <div class="k5-profile-field">
          <label class="k5-profile-label">{{ t('newPassword') }}</label>
          <PasswordInput v-model="password" minlength="6" autocomplete="new-password" />
        </div>
        <div class="k5-profile-field">
          <label class="k5-profile-label">{{ t('confirmPassword') }}</label>
          <PasswordInput v-model="confirmPassword" minlength="6" autocomplete="new-password" />
          <small v-if="passwordsMatch === false" class="text-danger">{{ t('passwordsMismatch') }}</small>
          <small v-else-if="passwordsMatch === true" class="text-success">{{ t('passwordsMatch') }}</small>
        </div>
        <button type="submit" class="btn btn-success k5-profile-save" :disabled="saving">
          <i class="bi bi-check-lg me-1"></i>{{ saving ? '...' : t('save') }}
        </button>
      </form>
    </div>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after profile" />
  </div>
</template>

<style scoped>
.k5-account-title {
  color: #3d5c3d;
  font-weight: 800;
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
.k5-profile-form {
  max-width: 640px;
}
.k5-profile-field {
  margin-bottom: 1.25rem;
}
.k5-profile-label {
  font-weight: 700;
  display: block;
  margin-bottom: 0.25rem;
}
.k5-profile-hint {
  color: var(--edu-text-muted);
  font-size: 0.8rem;
  margin-bottom: 0.35rem;
}
.k5-profile-input {
  border-style: dashed;
}
.k5-profile-save {
  font-weight: 700;
  padding: 0.5rem 1.5rem;
}
</style>
