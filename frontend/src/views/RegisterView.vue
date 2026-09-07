<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
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

const name = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.register(name.value, email.value, password.value);
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.error || e.response?.data?.errors?.[0]?.msg || 'Could not create the account.';
  } finally {
    loading.value = false;
  }
}

async function registerGoogle() {
  error.value = '';
  loading.value = true;
  try {
    await auth.loginWithGoogle();
    router.push('/');
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Could not sign up with Google.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <SiteContentSlot page-id="auth" zone="before-auth" label="Content before registration" />
    <div class="auth-card">
      <div class="auth-card-header">
        <div class="auth-icon"><i class="bi bi-person-plus"></i></div>
        <EditableSetting tag="h1" class="h4 mb-1" setting-key="auth_signup_title" :default="'Create Account'" />
        <EditableSetting tag="p" class="mb-0 opacity-75 small" setting-key="auth_signup_lead" :default="'Sign up to access all materials'" />
      </div>
      <div class="auth-card-body">
        <div v-if="error" class="alert alert-danger py-2 small">{{ error }}</div>
        <template v-if="isFirebaseConfigured()">
          <GoogleAuthButton :label="builder.settingValue('auth_google_signup_label', 'Sign up with Google')" :loading="loading" @click="registerGoogle" />
          <div class="auth-divider my-3"><EditableSetting tag="span" setting-key="auth_or_label" :default="'or'" /></div>
        </template>
        <form @submit.prevent="submit">
          <div class="mb-3">
            <label class="form-label" for="signup-name"><EditableSetting tag="span" setting-key="auth_full_name_label" :default="'Full Name'" /></label>
            <input id="signup-name" v-model="name" type="text" class="form-control" placeholder="Your full name" required />
          </div>
          <div class="mb-3">
            <label class="form-label" for="signup-email"><EditableSetting tag="span" setting-key="auth_email_label" :default="'Email address'" /></label>
            <input id="signup-email" v-model="email" type="email" class="form-control" placeholder="your@email.com" required />
          </div>
          <div class="mb-4">
            <label class="form-label" for="signup-password"><EditableSetting tag="span" setting-key="auth_password_label" :default="'Password'" /></label>
            <PasswordInput id="signup-password" v-model="password" required minlength="6" autocomplete="new-password" />
            <EditableSetting tag="div" class="form-text" setting-key="auth_password_hint" :default="'Minimum 6 characters'" />
          </div>
          <button type="submit" class="btn btn-primary w-100 py-2" :disabled="loading">
            <EditableSetting tag="span" setting-key="auth_signup_button" :default="loading ? 'Signing up...' : 'Sign Up Free'" />
          </button>
        </form>
        <p class="text-center mt-4 small text-muted mb-0">
          <EditableSetting tag="span" setting-key="auth_existing_account" :default="'Already have an account?'" /> <router-link to="/login" class="fw-semibold text-decoration-none"><EditableSetting tag="span" setting-key="auth_login_link" :default="'Log in'" /></router-link>
        </p>
      </div>
    </div>
    <SiteContentSlot page-id="auth" zone="after-auth" label="Content after registration" />
  </div>
</template>
