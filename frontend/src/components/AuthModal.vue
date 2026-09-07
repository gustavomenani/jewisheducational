<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useAuthStore } from '@/stores';
import { isFirebaseConfigured } from '@/firebase';
import GoogleAuthButton from '@/components/GoogleAuthButton.vue';
import PasswordInput from '@/components/PasswordInput.vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  initialTab: { type: String, default: 'login' },
});

const emit = defineEmits(['update:modelValue', 'success']);

const auth = useAuthStore();
const tab = ref(props.initialTab);
const error = ref('');
const loading = ref(false);

const loginEmail = ref('');
const loginPassword = ref('');
const regName = ref('');
const regEmail = ref('');
const regPassword = ref('');
const dialogRef = ref(null);
const closeButtonRef = ref(null);
let previouslyFocused = null;

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      previouslyFocused = document.activeElement;
      tab.value = props.initialTab;
      error.value = '';
      nextTick(() => closeButtonRef.value?.focus());
    }
  }
);

function close() {
  emit('update:modelValue', false);
  nextTick(() => {
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus();
    previouslyFocused = null;
  });
}

function onKeydown(event) {
  if (!props.modelValue) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...(dialogRef.value?.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
  ) || [])];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

async function submitLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(loginEmail.value, loginPassword.value);
    emit('success');
    close();
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not log in.';
  } finally {
    loading.value = false;
  }
}

async function submitRegister() {
  error.value = '';
  loading.value = true;
  try {
    await auth.register(regName.value, regEmail.value, regPassword.value);
    emit('success');
    close();
  } catch (e) {
    error.value = e.response?.data?.error || e.response?.data?.errors?.[0]?.msg || 'Could not create the account.';
  } finally {
    loading.value = false;
  }
}

async function submitGoogle() {
  error.value = '';
  loading.value = true;
  try {
    await auth.loginWithGoogle();
    emit('success');
    close();
  } catch (e) {
    error.value = e.response?.data?.error || e.message || 'Could not log in with Google.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="auth-modal-backdrop"
      @click.self="close"
    >
      <div ref="dialogRef" class="auth-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="authModalTitle">
        <button ref="closeButtonRef" type="button" class="auth-modal-close" aria-label="Close" @click="close">
          <i class="bi bi-x-lg"></i>
        </button>

        <div class="auth-card auth-modal-card">
          <div class="auth-card-header">
            <div class="auth-icon">
              <i :class="tab === 'login' ? 'bi bi-shield-lock' : 'bi bi-person-plus'"></i>
            </div>
            <h2 id="authModalTitle" class="h4 mb-1">
              {{ tab === 'login' ? 'Log in to your account' : 'Create a free account' }}
            </h2>
            <p class="mb-0 opacity-75 small">
              {{ tab === 'login'
                ? 'Log in to preview and download materials'
                : 'Sign up to access the full library' }}
            </p>
          </div>

          <div class="auth-card-body">
            <ul class="nav nav-pills nav-fill mb-4 auth-modal-tabs">
              <li class="nav-item">
                <button
                  type="button"
                  class="nav-link"
                  :class="{ active: tab === 'login' }"
                  @click="tab = 'login'; error = ''"
                >
                  Log in
                </button>
              </li>
              <li class="nav-item">
                <button
                  type="button"
                  class="nav-link"
                  :class="{ active: tab === 'register' }"
                  @click="tab = 'register'; error = ''"
                >
                  Sign up
                </button>
              </li>
            </ul>

            <div v-if="error" class="alert alert-danger py-2 small" role="alert" aria-live="assertive">{{ error }}</div>

            <template v-if="isFirebaseConfigured()">
              <GoogleAuthButton :loading="loading" @click="submitGoogle" />
              <div class="auth-divider my-3"><span>or</span></div>
            </template>

            <form v-if="tab === 'login'" @submit.prevent="submitLogin">
              <div class="mb-3">
                <label class="form-label" for="auth-modal-login-email">Email</label>
                <input id="auth-modal-login-email" v-model="loginEmail" type="email" class="form-control" required autofocus />
              </div>
              <div class="mb-4">
                <label class="form-label" for="auth-modal-login-password">Password</label>
                <PasswordInput id="auth-modal-login-password" v-model="loginPassword" required autocomplete="current-password" />
              </div>
              <button type="submit" class="btn btn-primary w-100 py-2" :disabled="loading">
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ loading ? 'Logging in...' : 'Log in and continue' }}
              </button>
            </form>

            <form v-else @submit.prevent="submitRegister">
              <div class="mb-3">
                <label class="form-label" for="auth-modal-register-name">Name</label>
                <input id="auth-modal-register-name" v-model="regName" type="text" class="form-control" required autofocus />
              </div>
              <div class="mb-3">
                <label class="form-label" for="auth-modal-register-email">Email</label>
                <input id="auth-modal-register-email" v-model="regEmail" type="email" class="form-control" required />
              </div>
              <div class="mb-4">
                <label class="form-label" for="auth-modal-register-password">Password</label>
                <PasswordInput id="auth-modal-register-password" v-model="regPassword" required minlength="6" autocomplete="new-password" />
                <div class="form-text">Minimum 6 characters</div>
              </div>
              <button type="submit" class="btn btn-primary w-100 py-2" :disabled="loading">
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ loading ? 'Creating account...' : 'Create account and continue' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
