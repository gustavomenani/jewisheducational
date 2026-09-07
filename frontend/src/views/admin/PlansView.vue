<script setup>
import { ref, onMounted } from 'vue';
import api from '@/api';
import { useSettingsStore } from '@/stores';

const settingsStore = useSettingsStore();

const plans = ref([]);
const plansLoading = ref(false);
const tierOptions = [
  { value: 'standard', label: 'Parents and Teachers' },
  { value: 'school', label: 'School (exclusive access)' },
];
const freeLimit = ref({ enabled: false, max: 10, period: 'month', mode: 'per_resource' });

const materials = ref([]);
const loadingMaterials = ref(false);
const savingSettings = ref(false);
const message = ref('');
const error = ref('');
const materialSearch = ref('');

const periodOptions = [
  { value: 'day', label: 'per day' },
  { value: 'week', label: 'per week' },
  { value: 'month', label: 'per month' },
  { value: 'year', label: 'per year' },
  { value: 'forever', label: 'lifetime total' },
];

onMounted(async () => {
  await settingsStore.load();
  const s = settingsStore.settings;
  freeLimit.value = {
    enabled: s.download_limit_enabled === 'true',
    max: Number(s.download_limit_max) || 10,
    period: s.download_limit_period || 'month',
    mode: s.download_limit_mode || 'per_resource',
  };
  await loadPlans();
  await loadMaterials();
});

async function loadPlans() {
  plansLoading.value = true;
  try {
    const { data } = await api.get('/admin/stripe-plans');
    plans.value = (data.plans || []).map((p) => ({
      key: p.key,
      name: p.name || '',
      priceDollars: p.price_cents ? p.price_cents / 100 : null,
      price_display: p.price_display || '',
      months: p.months || 12,
      tier: p.tier === 'school' ? 'school' : 'standard',
    }));
    if (!plans.value.length) addPlan();
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not load plans.';
  } finally {
    plansLoading.value = false;
  }
}

function addPlan() {
  plans.value.push({
    key: 'plan-' + Date.now(),
    name: '',
    priceDollars: null,
    price_display: '',
    months: 12,
    tier: plans.value.some((p) => p.tier === 'standard') ? 'school' : 'standard',
  });
}

function removePlan(i) {
  plans.value.splice(i, 1);
}

async function loadMaterials() {
  loadingMaterials.value = true;
  try {
    const { data } = await api.get('/resources/admin/all');
    materials.value = (data.resources || []).map((r) => {
      const max = r.download_limit_max;
      let type = 'default';
      if (max === 0 || max === '0') type = 'unlimited';
      else if (max != null && Number(max) > 0) type = 'custom';
      return {
        id: r.id,
        title: r.title,
        category: r.category_name || '',
        type,
        max: Number(max) > 0 ? Number(max) : 3,
        period: r.download_limit_period || 'month',
        saving: false,
        saved: false,
      };
    });
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not load resources.';
  } finally {
    loadingMaterials.value = false;
  }
}

async function saveSettings() {
  savingSettings.value = true;
  message.value = '';
  error.value = '';
  try {
    const cleanPlans = plans.value.map((p) => ({
      key: p.key,
      name: (p.name || 'Premium').trim(),
      price_display: p.price_display?.trim() || (p.priceDollars ? `$${p.priceDollars}/month` : ''),
      price_cents: Math.max(0, Math.round((Number(p.priceDollars) || 0) * 100)),
      months: Math.max(1, Number(p.months) || 1),
      tier: p.tier === 'school' ? 'school' : 'standard',
    }));
    // Plano exibido na tela de cobrança = primeiro plano da lista.
    const primary = cleanPlans[0] || {};
    const payload = {
      ...settingsStore.settings,
      paywall_plan_name: primary.name || 'Premium',
      paywall_plan_price: primary.price_display || '',
      paypal_plan_months: String(primary.months || 1),
      stripe_plan_months: String(primary.months || 1),
      download_limit_enabled: freeLimit.value.enabled ? 'true' : 'false',
      download_limit_max: String(freeLimit.value.max ?? 10),
      download_limit_period: freeLimit.value.period || 'month',
      download_limit_mode: freeLimit.value.mode || 'per_resource',
    };
    await api.put('/settings', { settings: payload });
    await api.put('/admin/stripe-plans', { plans: cleanPlans });
    await settingsStore.load();
    message.value = 'Plans and limits saved.';
    setTimeout(() => { message.value = ''; }, 3000);
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not save plans and limits.';
  } finally {
    savingSettings.value = false;
  }
}

// Reaproveita o PUT do material enviando só o limite; os demais campos
// são preservados no backend (fallback para os valores existentes).
async function saveMaterialLimit(m) {
  m.saving = true;
  m.saved = false;
  error.value = '';
  try {
    const fd = new FormData();
    if (m.type === 'default') {
      fd.append('download_limit_max', '');
      fd.append('download_limit_period', '');
    } else if (m.type === 'unlimited') {
      fd.append('download_limit_max', '0');
      fd.append('download_limit_period', '');
    } else {
      fd.append('download_limit_max', String(m.max || 1));
      fd.append('download_limit_period', m.period || 'month');
    }
    await api.put(`/resources/${m.id}`, fd);
    m.saved = true;
    setTimeout(() => { m.saved = false; }, 2500);
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not save the resource limit.';
  } finally {
    m.saving = false;
  }
}

function filteredMaterials() {
  const q = materialSearch.value.trim().toLowerCase();
  if (!q) return materials.value;
  return materials.value.filter((m) => m.title.toLowerCase().includes(q) || m.category.toLowerCase().includes(q));
}
</script>

<template>
  <div>
    <div class="admin-page-header">
      <h1>Plans &amp; Downloads</h1>
      <p>Configure the Premium plan, the free limit, and the download limit for each material.</p>
    </div>

    <div v-if="message" class="alert alert-success">{{ message }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <form class="admin-card mb-4" @submit.prevent="saveSettings">
      <div class="admin-card-body">
        <h2 class="h6 text-uppercase text-muted mb-1" style="letter-spacing:0.05em">Paid plans</h2>
        <p class="text-muted small mb-3">
          The <strong>price can be any amount</strong> and can be changed at any time. The
          <strong>School</strong> type unlocks resources marked "School plan exclusive."
          The first plan in the list appears on the billing screen.
        </p>

        <div v-if="plansLoading" class="text-center py-3">
          <div class="spinner-border text-primary"></div>
        </div>

        <div v-else class="mb-4">
          <div v-for="(p, i) in plans" :key="p.key" class="p-3 mb-2 border rounded bg-white">
            <div class="row g-3 align-items-end">
              <div class="col-md-4">
                <label class="admin-form-label" :for="`plan-name-${i}`">Plan name</label>
                <input :id="`plan-name-${i}`" v-model="p.name" class="form-control" placeholder="Parents and Teachers" />
              </div>
              <div class="col-md-2">
                <label class="admin-form-label" :for="`plan-price-${i}`">Price (USD)</label>
                <input :id="`plan-price-${i}`" v-model.number="p.priceDollars" type="number" min="0" step="0.01" class="form-control" placeholder="9.99" />
              </div>
              <div class="col-md-2">
                <label class="admin-form-label" :for="`plan-months-${i}`">Duration (months)</label>
                <input :id="`plan-months-${i}`" v-model.number="p.months" type="number" min="1" class="form-control" />
              </div>
              <div class="col-md-3">
                <label class="admin-form-label" :for="`plan-tier-${i}`">Access type</label>
                <select :id="`plan-tier-${i}`" v-model="p.tier" class="form-select">
                  <option v-for="t in tierOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>
              <div class="col-md-1 text-end">
                <button type="button" class="btn btn-outline-danger btn-sm" title="Remove plan" :aria-label="`Remove ${p.name || 'plan'}`" @click="removePlan(i)">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-outline-primary btn-sm mt-1" @click="addPlan">
            <i class="bi bi-plus-lg me-1"></i>Add plan
          </button>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3" style="letter-spacing:0.05em">Download limit (Free plan)</h2>
        <div class="form-check form-switch mb-3">
          <input id="free-limit-enabled" v-model="freeLimit.enabled" class="form-check-input" type="checkbox" role="switch" />
          <label class="form-check-label" for="free-limit-enabled">Enable download limit for the Free plan</label>
        </div>
        <div class="row g-3">
          <div class="col-md-3">
            <label class="admin-form-label" for="free-limit-max">Maximum</label>
            <input id="free-limit-max" v-model.number="freeLimit.max" type="number" min="1" class="form-control" :disabled="!freeLimit.enabled" />
          </div>
          <div class="col-md-3">
            <label class="admin-form-label" for="free-limit-period">Period</label>
            <select id="free-limit-period" v-model="freeLimit.period" class="form-select" :disabled="!freeLimit.enabled">
              <option value="day">Per day</option>
              <option value="week">Per week</option>
              <option value="month">per month</option>
              <option value="year">Per year</option>
              <option value="forever">Lifetime total (no reset)</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="admin-form-label" for="free-limit-mode">How to count</label>
            <select id="free-limit-mode" v-model="freeLimit.mode" class="form-select" :disabled="!freeLimit.enabled">
              <option value="per_resource">Per resource (the limit applies to each resource)</option>
              <option value="global">Global (the limit counts all site downloads)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="admin-card-header border-top">
        <button type="submit" class="btn btn-primary" :disabled="savingSettings">
          <span v-if="savingSettings" class="spinner-border spinner-border-sm me-1"></span>
          Save plan and limits
        </button>
      </div>
    </form>

    <div class="admin-card">
      <div class="admin-card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h2 class="h6 text-uppercase text-muted mb-0" style="letter-spacing:0.05em">Limit by resource</h2>
          <input id="plan-material-search" v-model="materialSearch" aria-label="Search materials" class="form-control form-control-sm" style="max-width:240px" placeholder="Search material..." />
        </div>
        <p class="text-muted small mb-3">
          Each resource can use the <strong>site default</strong> above, be <strong>unlimited</strong>, or have a
          <strong>custom</strong> limit. Save each row separately.
        </p>

        <div v-if="loadingMaterials" class="text-center py-4">
          <div class="spinner-border text-primary"></div>
        </div>

        <table v-else class="table admin-table mb-0">
          <thead>
            <tr>
              <th>Material</th>
              <th>Download limit</th>
              <th scope="col"><span class="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!filteredMaterials().length">
              <td colspan="3" class="text-center text-muted py-4">No materials found.</td>
            </tr>
            <tr v-for="m in filteredMaterials()" :key="m.id">
              <td>
                <div class="fw-semibold">{{ m.title }}</div>
                <small v-if="m.category" class="text-muted">{{ m.category }}</small>
              </td>
              <td>
                <div class="d-flex flex-wrap gap-2 align-items-center">
                  <select v-model="m.type" class="form-select form-select-sm" style="width:auto" :aria-label="`Download limit type for ${m.title}`">
                    <option value="default">Site default</option>
                    <option value="unlimited">Unlimited</option>
                    <option value="custom">Custom</option>
                  </select>
                  <template v-if="m.type === 'custom'">
                    <input v-model.number="m.max" type="number" min="1" class="form-control form-control-sm" style="width:80px" :aria-label="`Download limit maximum for ${m.title}`" />
                    <select v-model="m.period" class="form-select form-select-sm" style="width:auto" :aria-label="`Download limit period for ${m.title}`">
                      <option v-for="p in periodOptions" :key="p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </template>
                </div>
              </td>
              <td class="text-end">
                <button type="button" class="btn btn-sm btn-primary" :disabled="m.saving" @click="saveMaterialLimit(m)">
                  <span v-if="m.saving" class="spinner-border spinner-border-sm"></span>
                  <i v-else-if="m.saved" class="bi bi-check-lg"></i>
                  <span v-else>Save</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
