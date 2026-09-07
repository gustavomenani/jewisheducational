<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@/api';
import PasswordInput from '@/components/PasswordInput.vue';
import EditableSetting from '@/builder/EditableSetting.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';

const route = useRoute();
const router = useRouter();

const password = ref('');
const confirm = ref('');
const message = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  message.value = '';
  error.value = '';
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.';
    return;
  }
  loading.value = true;
  try {
    const { data } = await api.post('/auth/reset-password', {
      token: route.params.token,
      password: password.value,
    });
    message.value = data.message;
    setTimeout(() => router.push('/login'), 2000);
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not reset your password.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before password reset" />
    <div class="auth-card">
      <div class="auth-card-header">
        <div class="auth-icon"><i class="bi bi-key"></i></div>
        <EditableSetting tag="h1" class="h4 mb-1" setting-key="auth_new_password_title" :default="'New password'" />
        <EditableSetting tag="p" class="mb-0 opacity-75 small" setting-key="auth_new_password_lead" :default="'Choose a secure password'" />
      </div>
      <div class="auth-card-body">
        <div v-if="message" class="alert alert-success py-2 small">{{ message }}</div>
        <div v-if="error" class="alert alert-danger py-2 small">{{ error }}</div>
        <form @submit.prevent="submit">
          <div class="mb-3">
            <label class="form-label" for="reset-password"><EditableSetting tag="span" setting-key="auth_new_password_title" :default="'New password'" /></label>
            <PasswordInput id="reset-password" v-model="password" required minlength="6" autocomplete="new-password" />
          </div>
          <div class="mb-4">
            <label class="form-label" for="reset-password-confirm"><EditableSetting tag="span" setting-key="auth_confirm_password_label" :default="'Confirm password'" /></label>
            <PasswordInput id="reset-password-confirm" v-model="confirm" required autocomplete="new-password" />
          </div>
          <button type="submit" class="btn btn-primary w-100 py-2" :disabled="loading">
            <EditableSetting tag="span" setting-key="auth_save_password_button" :default="loading ? 'Saving...' : 'Reset password'" />
          </button>
        </form>
      </div>
    </div>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after password reset" />
  </div>
</template>
