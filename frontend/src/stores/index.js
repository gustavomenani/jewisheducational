import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api';
import { getGoogleIdToken, firebaseSignOut, isFirebaseConfigured } from '@/firebase';
import { applyTheme } from '@/utils/theme';
import { getSignupAttribution } from '@/utils/attribution';

let activeAuthLogout = null;

if (typeof window !== 'undefined' && !window.__jerAuthExpiryListener) {
  window.__jerAuthExpiryListener = true;
  window.addEventListener('auth:expired', () => {
    activeAuthLogout?.();
  });
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || null);
  // Only trust a stored `user` when a session token is also present. A `user`
  // left behind without a token (e.g. partial clear) must not be treated as a
  // logged-in session — drop it so auth state stays consistent.
  let storedUser = null;
  if (token.value) {
    try {
      storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      localStorage.removeItem('user');
    }
  }
  const user = ref(storedUser);
  if (!token.value && localStorage.getItem('user')) localStorage.removeItem('user');

  const isLoggedIn = computed(() => !!token.value);
  // Admin status requires a valid session (token). Without this, a stale `user`
  // object left in localStorage after a token is cleared would make the app
  // treat the visitor as admin (showing the page-builder UI on public/login
  // pages) while `isLoggedIn` is false — an inconsistent, broken state.
  const isAdmin = computed(() => isLoggedIn.value && user.value?.role === 'admin');

  function setSession(data) {
    user.value = data.user;
    token.value = data.token;
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('token', data.token);
  }

  function logout() {
    user.value = null;
    token.value = null;
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    firebaseSignOut();
  }

  activeAuthLogout = logout;

  async function loginWithGoogle() {
    const idToken = await getGoogleIdToken();
    const { data } = await api.post('/auth/google', {
      idToken,
      ...getSignupAttribution('google'),
    });
    setSession(data);
    return data;
  }

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    setSession(data);
    return data;
  }

  async function register(name, email, password) {
    const { data } = await api.post('/auth/register', {
      name,
      email,
      password,
      ...getSignupAttribution('email'),
    });
    setSession(data);
    return data;
  }

  async function fetchMe() {
    try {
      const { data } = await api.get('/auth/me');
      user.value = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
    } catch (error) {
      // A transient network/API failure must not destroy a still-valid local
      // session. The API interceptor and this branch only clear it on 401.
      if (error.response?.status === 401) logout();
      throw error;
    }
  }

  return { user, token, isLoggedIn, isAdmin, login, register, loginWithGoogle, logout, fetchMe, setSession };
});

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref({});
  const ready = ref(false);
  const loading = ref(false);
  const loadError = ref(null);
  let activeLoad = null;

  async function load() {
    if (activeLoad) return activeLoad;

    activeLoad = (async () => {
      loading.value = true;
      loadError.value = null;
      let lastError = null;

      try {
        // A cold server can take longer than the old eight-second limit. Retry
        // once, but never turn missing settings into published page content.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const { data } = await api.get('/settings', { timeout: 15000 });
            settings.value = data.settings || {};
            applyTheme(settings.value);
            ready.value = true;
            return settings.value;
          } catch (error) {
            lastError = error;
          }
        }

        ready.value = false;
        loadError.value = 'The published site settings could not be loaded.';
        throw lastError || new Error(loadError.value);
      } finally {
        loading.value = false;
        activeLoad = null;
      }
    })();

    return activeLoad;
  }

  return { settings, ready, loading, loadError, load };
});
