<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import api from '@/api';

const props = defineProps({
  clientId: { type: String, default: '' },
  currency: { type: String, default: 'USD' },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['success', 'error', 'loading']);

const containerRef = ref(null);
const sdkLoading = ref(false);
const renderToken = ref(0);
let buttonsInstance = null;

function loadPayPalSdk(clientId, currency) {
  if (!clientId) return Promise.reject(new Error('PayPal is not configured.'));
  if (window.paypal?.__jerClientId === clientId && window.paypal?.__jerCurrency === currency) {
    return Promise.resolve(window.paypal);
  }

  const existing = document.getElementById('paypal-sdk');
  if (existing) existing.remove();
  delete window.paypal;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'paypal-sdk';
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture`;
    script.async = true;
    script.onload = () => {
      if (window.paypal) {
        window.paypal.__jerClientId = clientId;
        window.paypal.__jerCurrency = currency;
        resolve(window.paypal);
      } else {
        reject(new Error('PayPal SDK is unavailable.'));
      }
    };
    script.onerror = () => reject(new Error('Could not load PayPal.'));
    document.head.appendChild(script);
  });
}

async function renderButtons() {
  const token = ++renderToken.value;
  if (!containerRef.value || !props.clientId || props.disabled) return;

  sdkLoading.value = true;
  try {
    const paypal = await loadPayPalSdk(props.clientId, props.currency);
    if (token !== renderToken.value) return;

    containerRef.value.innerHTML = '';
    if (buttonsInstance?.close) {
      try { buttonsInstance.close(); } catch { /* ignore */ }
    }

    buttonsInstance = paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal' },
      createOrder: async () => {
        emit('loading', true);
        try {
          const { data } = await api.post('/payments/paypal/create-order');
          return data.orderId;
        } finally {
          emit('loading', false);
        }
      },
      onApprove: async (data) => {
        emit('loading', true);
        try {
          const res = await api.post('/payments/paypal/capture-order', { orderId: data.orderID });
          emit('success', res.data);
        } catch (err) {
          const message = err.response?.data?.error || err.message || 'Payment failed.';
          emit('error', message);
        } finally {
          emit('loading', false);
        }
      },
      onError: (err) => {
        emit('error', typeof err === 'string' ? err : 'PayPal error.');
      },
    });

    if (!buttonsInstance.isEligible()) {
      containerRef.value.innerHTML = '<p class="small text-muted mb-0">PayPal is unavailable in this browser.</p>';
      return;
    }

    await buttonsInstance.render(containerRef.value);
  } catch (err) {
    if (token === renderToken.value && containerRef.value) {
      containerRef.value.innerHTML = `<p class="small text-danger mb-0">${err.message || 'Could not load PayPal.'}</p>`;
    }
    emit('error', err.message || 'Could not load PayPal.');
  } finally {
    if (token === renderToken.value) sdkLoading.value = false;
  }
}

onMounted(renderButtons);
watch(() => [props.clientId, props.currency, props.disabled], renderButtons);

onBeforeUnmount(() => {
  renderToken.value += 1;
  if (buttonsInstance?.close) {
    try { buttonsInstance.close(); } catch { /* ignore */ }
  }
});
</script>

<template>
  <div class="paypal-checkout">
    <div v-if="sdkLoading" class="text-center py-2">
      <span class="spinner-border spinner-border-sm text-primary"></span>
      <span class="small text-muted ms-2">Carregando PayPal…</span>
    </div>
    <div ref="containerRef"></div>
  </div>
</template>
