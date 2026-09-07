import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { initAnalytics, trackPageView } from './analytics';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './assets/main.css';
import './assets/k5-home.css';

import { initLocale } from './i18n';
import { useAuthStore, useSettingsStore } from '@/stores';
import { refreshAuthenticatedUser } from '@/auth/adminAccess';

initLocale();

function bootstrap() {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  app.mount('#app');

  // Mount immediately so a slow settings endpoint cannot leave a blank page.
  // Settings, theme, analytics and the authenticated session hydrate in the
  // background while the app displays its normal loading states.
  const settingsStore = useSettingsStore(pinia);
  const authStore = useAuthStore(pinia);
  void settingsStore.load().then(async () => {
    // The database setting is authoritative. Initializing only after the
    // settings request avoids briefly configuring an env ID and then
    // replacing it with a second GA4 measurement ID.
    initAnalytics();
    await router.isReady();
    const current = router.currentRoute.value;
    trackPageView(current.fullPath, document.title, { bootstrap: true, persist: false });
  }).catch(() => {});
  void refreshAuthenticatedUser(authStore).catch(() => {});
}

bootstrap();
