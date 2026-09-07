<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores';
import { isFirebaseConfigured } from '@/firebase';
import GoogleAuthButton from '@/components/GoogleAuthButton.vue';
import PasswordInput from '@/components/PasswordInput.vue';
import EditableSetting from '@/builder/EditableSetting.vue';
import SiteContentSlot from '@/builder/SiteContentSlot.vue';
import { useBuilderStore } from '@/builder/store';

const auth = useAuthStore();
const builder = useBuilderStore();
const router = useRouter();
const route = useRoute();

function safeRedirect(value, fallback = '/') {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  return candidate;
}

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value.trim(), password.value);
    router.push(safeRedirect(route.query.redirect, auth.isAdmin ? '/admin' : '/'));
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not log in.';
  } finally {
    loading.value = false;
  }
}

async function loginGoogle() {
  error.value = '';
  loading.value = true;
  try {
    await auth.loginWithGoogle();
    router.push(safeRedirect(route.query.redirect, auth.isAdmin ? '/admin' : '/'));
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Could not log in with Google.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before sign in" />
    <div class="auth-card">
      <div class="auth-card-header">
        <div class="auth-icon"><i class="bi bi-shield-lock"></i></div>
        <EditableSetting tag="h1" class="h4 mb-1" setting-key="auth_login_title" :default="'Welcome back'" />
        <EditableSetting tag="p" class="mb-0 opacity-75 small" setting-key="auth_login_lead" :default="'Sign in to your account to access the library'" />
      </div>
      <div class="auth-card-body">
        <div v-if="error" class="alert alert-danger py-2 small" role="alert">{{ error }}</div>
        <template v-if="isFirebaseConfigured()">
          <GoogleAuthButton :label="builder.settingValue('auth_google_login_label', 'Continue with Google')" :loading="loading" @click="loginGoogle" />
          <div class="auth-divider my-3"><EditableSetting tag="span" setting-key="auth_or_label" :default="'or'" /></div>
        </template>
        <form @submit.prevent="submit">
          <div class="mb-3">
            <label for="login-email" class="form-label"><EditableSetting tag="span" setting-key="auth_email_label" :default="'Email address'" /></label>
            <input id="login-email" v-model="email" type="email" class="form-control" placeholder="your@email.com" required autofocus />
          </div>
          <div class="mb-4">
            <label for="login-password" class="form-label"><EditableSetting tag="span" setting-key="auth_password_label" :default="'Password'" /></label>
            <PasswordInput id="login-password" v-model="password" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary w-100 py-2" :disabled="loading">
            <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
            <EditableSetting tag="span" setting-key="auth_login_button" :default="loading ? 'Logging in...' : 'Log in'" />
          </button>
        </form>
        <div class="text-center mt-4 small text-muted">
          <router-link to="/forgot-password" class="text-decoration-none"><EditableSetting tag="span" setting-key="auth_forgot_link" :default="'Forgot password?'" /></router-link>
          <span class="mx-2">·</span>
          <router-link to="/sign-up" class="text-decoration-none fw-semibold"><EditableSetting tag="span" setting-key="auth_signup_link" :default="'Sign up free'" /></router-link>
        </div>
      </div>
    </div>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after sign in" />
  </div>
</template>
