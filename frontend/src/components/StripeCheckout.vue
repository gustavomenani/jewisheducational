<script setup>
import { ref } from 'vue';
import api from '@/api';

const emit = defineEmits(['error']);
const loading = ref(false);

async function startCheckout() {
  loading.value = true;
  emit('error', '');
  try {
    const { data } = await api.post('/payments/stripe/create-checkout-session');
    if (data.url) {
      window.location.href = data.url;
    } else {
      emit('error', 'Could not start checkout.');
      loading.value = false;
    }
  } catch (err) {
    emit('error', err.response?.data?.error || err.message || 'Could not start checkout.');
    loading.value = false;
  }
}
</script>

<template>
  <button type="button" class="btn btn-primary w-100" :disabled="loading" @click="startCheckout">
    <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
    <i v-else class="bi bi-credit-card me-1"></i>
    Subscribe by card
  </button>
</template>
