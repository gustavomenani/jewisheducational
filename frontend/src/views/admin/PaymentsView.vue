<script setup>
import { ref, onMounted } from 'vue';
import api from '@/api';

const form = ref({
  paypal_enabled: false,
  paypal_mode: 'sandbox',
  paypal_client_id: '',
  paypal_client_secret: '',
  paypal_plan_amount: '9.99',
  paypal_plan_currency: 'USD',
  paypal_plan_months: '12',
  paywall_plan_name: 'Premium',
  paywall_plan_price: '',
});
const secretMasked = ref('');
const hasSecret = ref(false);
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const message = ref('');
const error = ref('');
const stripe = ref({
  enabled: false,
  publishable_key: '',
  secret_masked: '',
  secret_set: false,
  webhook_set: false,
  plan_name: '',
  plan_months: '',
});

onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/admin/payments');
    const p = data.payments || {};
    form.value = {
      paypal_enabled: !!p.paypal_enabled,
      paypal_mode: p.paypal_mode === 'live' ? 'live' : 'sandbox',
      paypal_client_id: p.paypal_client_id || '',
      paypal_client_secret: '',
      paypal_plan_amount: p.paypal_plan_amount || '9.99',
      paypal_plan_currency: p.paypal_plan_currency || 'USD',
      paypal_plan_months: p.paypal_plan_months || '12',
      paywall_plan_name: p.paywall_plan_name || 'Premium',
      paywall_plan_price: p.paywall_plan_price || '',
    };
    secretMasked.value = p.paypal_client_secret_masked || '';
    hasSecret.value = !!p.has_secret;
    stripe.value = {
      enabled: !!p.stripe_enabled,
      publishable_key: p.stripe_publishable_key || '',
      secret_masked: p.stripe_secret_masked || '',
      secret_set: !!p.stripe_secret_set,
      webhook_set: !!p.stripe_webhook_set,
      plan_name: p.stripe_plan_name || '',
      plan_months: p.stripe_plan_months || '',
    };
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not load settings.';
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  message.value = '';
  error.value = '';
  try {
    const { data } = await api.put('/admin/payments', { payments: form.value });
    message.value = data.message || 'Saved.';
    const p = data.payments || {};
    secretMasked.value = p.paypal_client_secret_masked || '';
    hasSecret.value = !!p.has_secret;
    form.value.paypal_client_secret = '';
    setTimeout(() => { message.value = ''; }, 4000);
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not save payment settings.';
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  message.value = '';
  error.value = '';
  try {
    await api.put('/admin/payments', { payments: form.value });
    const { data } = await api.post('/admin/payments/test');
    message.value = data.message || 'Connection successful.';
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not connect to PayPal.';
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div>
    <div class="admin-page-header">
      <h1>Payments</h1>
      <p>Platform configured with <strong>Stripe</strong> card payments. PayPal below is optional.</p>
    </div>

    <div v-if="message" class="alert alert-success">{{ message }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <template v-else>
      <div class="admin-card mb-4">
        <div class="admin-card-body">
          <div
            class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 p-3 rounded border"
            :class="stripe.enabled ? 'border-success bg-success-subtle' : 'border-secondary bg-light'"
          >
            <div>
              <h2 class="h5 mb-1">
                <i class="bi bi-credit-card-2-front me-2" :class="stripe.enabled ? 'text-success' : 'text-muted'"></i>
                Stripe {{ stripe.enabled ? 'active' : 'inactive' }}
              </h2>
              <p class="text-muted small mb-0">
                <span v-if="stripe.enabled">Card payment active — users see the Subscribe by card button.</span>
                <span v-else>Stripe is inactive. Configure the secret key on the server to enable it.</span>
              </p>
            </div>
            <span class="badge" :class="stripe.enabled ? 'bg-success' : 'bg-secondary'">
              {{ stripe.enabled ? 'Active' : 'Inactive' }}
            </span>
          </div>

          <h2 class="h6 text-uppercase text-muted mb-3" style="letter-spacing:0.05em">Stripe keys</h2>
          <p class="text-muted small mb-3">
            <i class="bi bi-shield-lock me-1"></i>
            Stripe keys are stored on the <strong>server</strong> as environment variables, not in the database, for security.
            The secret is masked and can only be changed by redeploying.
          </p>
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="admin-form-label" for="stripe-publishable-key">Publishable key (public)</label>
              <input id="stripe-publishable-key" :value="stripe.publishable_key || '—'" class="form-control" readonly />
            </div>
            <div class="col-md-6">
              <label class="admin-form-label" for="stripe-secret-key">Secret key</label>
              <input id="stripe-secret-key" :value="stripe.secret_set ? stripe.secret_masked : 'not configured'" class="form-control" readonly />
            </div>
          </div>
          <div class="d-flex flex-wrap gap-4">
            <span class="small">
              <i class="bi me-1" :class="stripe.secret_set ? 'bi-check-circle-fill text-success' : 'bi-x-circle text-danger'"></i>
              Secret key {{ stripe.secret_set ? 'configured' : 'missing' }}
            </span>
            <span
              class="small"
              :title="stripe.webhook_set
                ? 'Signing secret (whsec) configured — events are verified.'
                : 'The endpoint may already be registered with Stripe, but the signing secret (whsec) must be configured on the server to verify signatures.'"
            >
              <i class="bi me-1" :class="stripe.webhook_set ? 'bi-check-circle-fill text-success' : 'bi-exclamation-circle text-warning'"></i>
              Webhook subscription {{ stripe.webhook_set ? 'active' : 'pending (whsec)' }}
            </span>
            <span class="small text-muted">
              Plan: {{ stripe.plan_name || 'Premium' }} · {{ stripe.plan_months || '1' }} month(s)
            </span>
          </div>
        </div>
      </div>

      <form class="admin-card" @submit.prevent="save">
      <div class="admin-card-body">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 p-3 rounded border"
          :class="form.paypal_enabled ? 'border-success bg-success-subtle' : 'border-secondary bg-light'">
          <div>
            <h2 class="h5 mb-1">
              <i class="bi me-2" :class="form.paypal_enabled ? 'bi-paypal text-primary' : 'bi-paypal text-muted'"></i>
              PayPal {{ form.paypal_enabled ? 'active' : 'disabled' }}
            </h2>
            <p class="text-muted small mb-0">
              <span v-if="form.paypal_enabled">
                Users see the <strong>Paid</strong> badge and can subscribe to Premium on the site.
              </span>
              <span v-else>
                Payments are hidden. Premium resources remain locked without checkout.
              </span>
            </p>
          </div>
          <div class="form-check form-switch m-0">
            <input
              id="paypal-enabled"
              v-model="form.paypal_enabled"
              class="form-check-input"
              type="checkbox"
              role="switch"
            />
            <label class="form-check-label" for="paypal-enabled">Enable payments</label>
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3" style="letter-spacing:0.05em">PayPal credentials</h2>
        <p class="text-muted small mb-3">
          Create an app at
          <a href="https://developer.paypal.com/dashboard/applications/live" target="_blank" rel="noopener">developer.paypal.com</a>
          and paste the Client ID and Secret. Use <strong>Sandbox</strong> for testing.
        </p>
        <div class="row g-3 mb-4">
          <div class="col-md-4">
            <label class="admin-form-label" for="paypal-mode">Environment</label>
            <select id="paypal-mode" v-model="form.paypal_mode" class="form-select">
              <option value="sandbox">Sandbox (testing)</option>
              <option value="live">Live (production)</option>
            </select>
          </div>
          <div class="col-md-8">
            <label class="admin-form-label" for="paypal-client-id">Client ID</label>
            <input id="paypal-client-id" v-model="form.paypal_client_id" class="form-control" placeholder="AaBbCc..." autocomplete="off" />
          </div>
          <div class="col-12">
            <label class="admin-form-label" for="paypal-client-secret">Client Secret</label>
            <input
              id="paypal-client-secret"
              v-model="form.paypal_client_secret"
              type="password"
              class="form-control"
              :placeholder="hasSecret ? `Saved: ${secretMasked} — leave blank to keep it` : 'Paste the secret here'"
              autocomplete="new-password"
            />
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3" style="letter-spacing:0.05em">Premium plan</h2>
        <div class="row g-3 mb-4">
          <div class="col-md-4">
            <label class="admin-form-label" for="paypal-plan-name">Display name</label>
            <input id="paypal-plan-name" v-model="form.paywall_plan_name" class="form-control" placeholder="Premium" />
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="paypal-plan-price">Displayed price</label>
            <input id="paypal-plan-price" v-model="form.paywall_plan_price" class="form-control" placeholder="$9.99/year" />
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="paypal-plan-months">Duration (months)</label>
            <input id="paypal-plan-months" v-model="form.paypal_plan_months" type="number" min="1" class="form-control" />
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="paypal-plan-amount">Amount charged (PayPal)</label>
            <input id="paypal-plan-amount" v-model="form.paypal_plan_amount" class="form-control" placeholder="9.99" />
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="paypal-plan-currency">Currency</label>
            <input id="paypal-plan-currency" v-model="form.paypal_plan_currency" class="form-control" placeholder="USD" maxlength="3" />
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            Save
          </button>
          <button type="button" class="btn btn-outline-secondary" :disabled="testing" @click="testConnection">
            <span v-if="testing" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-plug me-1"></i>
            Test connection
          </button>
        </div>
      </div>
    </form>
    </template>
  </div>
</template>
