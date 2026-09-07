import { ref, computed } from 'vue';
import { messages } from './messages.js';

const locale = ref('en');

export function useI18n() {
  const t = (key) => messages.en[key] || key;

  const isEn = computed(() => true);

  function setLocale() {}

  return { locale, t, isEn, setLocale };
}

export function initLocale() {
  document.documentElement.lang = 'en';
}
