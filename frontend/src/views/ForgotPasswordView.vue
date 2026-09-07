<script setup>
import { ref } from 'vue';
import api from '@/api';
import EditableSetting from '@/builder/EditableSetting.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';

const email = ref('');
const message = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  message.value = '';
  error.value = '';
  loading.value = true;
  try {
    const { data } = await api.post('/auth/forgot-password', { email: email.value });
    message.value = data.message;
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not send the request.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before password recovery" />
    <div class="auth-card">
      <div class="auth-card-header">
        <div class="auth-icon"><i class="bi bi-envelope"></i></div>
        <EditableSetting tag="h1" class="h4 mb-1" setting-key="auth_recovery_title" :default="'Reset Password'" />
        <EditableSetting tag="p" class="mb-0 opacity-75 small" setting-key="auth_recovery_lead" :default="'We will send a reset link to your email'" />
      </div>
      <div class="auth-card-body">
        <div v-if="message" class="alert alert-success py-2 small">{{ message }}</div>
        <div v-if="error" class="alert alert-danger py-2 small">{{ error }}</div>
        <form @submit.prevent="submit">
          <div class="mb-4">
            <label class="form-label" for="forgot-email"><EditableSetting tag="span" setting-key="auth_email_label" :default="'Email address'" /></label>
            <input id="forgot-email" v-model="email" type="email" class="form-control" placeholder="your@email.com" required />
          </div>
          <button type="submit" class="btn btn-primary w-100 py-2" :disabled="loading">
            <EditableSetting tag="span" setting-key="auth_send_reset_button" :default="loading ? 'Sending...' : 'Send Reset Link'" />
          </button>
        </form>
        <p class="text-center mt-4 small mb-0">
          <router-link to="/login" class="text-decoration-none"><EditableSetting tag="span" setting-key="auth_back_login_link" :default="'Back to Log in'" /></router-link>
        </p>
      </div>
    </div>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after password recovery" />
  </div>
</template>
