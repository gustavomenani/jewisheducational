<script setup>
import { ref, onMounted } from 'vue';
import api from '@/api';
import { useSettingsStore } from '@/stores';
import {
  MATERIAL_ACTIONS,
  materialActionFormFromSettings,
  materialActionPayload,
} from '@/utils/materialActions';

const settingsStore = useSettingsStore();
const form = ref({});
const message = ref('');
const saveFailed = ref(false);
const loading = ref(true);
const saving = ref(false);

function isActionOn(actionId) {
  const def = MATERIAL_ACTIONS.find((a) => a.id === actionId);
  return form.value[def?.key] !== 'false';
}

function setActionOn(actionId, on) {
  const def = MATERIAL_ACTIONS.find((a) => a.id === actionId);
  if (def) form.value[def.key] = on ? 'true' : 'false';
}

onMounted(async () => {
  loading.value = true;
  await settingsStore.load();
  form.value = {
    ...materialActionFormFromSettings(settingsStore.settings),
    classroom_share_url: settingsStore.settings.classroom_share_url ?? '',
  };
  loading.value = false;
});

async function save() {
  saving.value = true;
  message.value = '';
  saveFailed.value = false;
  try {
    const payload = {
      ...settingsStore.settings,
      ...materialActionPayload(form.value),
      classroom_share_url: form.value.classroom_share_url ?? '',
    };
    await api.put('/settings', { settings: payload });
    await settingsStore.load();
    message.value = 'Integrations saved.';
    setTimeout(() => { message.value = ''; }, 3000);
  } catch (e) {
    saveFailed.value = true;
    message.value = e.response?.data?.error || 'Could not save integrations.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="admin-page-header">
      <h1>Integrations</h1>
      <p>Material action buttons: preview, download, Classroom, Pinterest, and favorites</p>
    </div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <template v-else>
      <div v-if="message" class="alert" :class="saveFailed ? 'alert-danger' : 'alert-success'">
        {{ message }}
      </div>

      <form class="admin-card" @submit.prevent="save">
        <div class="admin-card-body">
          <h2 class="h6 text-uppercase text-muted mb-3" style="letter-spacing:0.05em">Material buttons</h2>
          <p class="text-muted small mb-3">
            Enable or disable each icon in the action bar on resource pages, favorites, and downloads.
            Disable anything you do not want to show.
          </p>
          <div class="row g-3">
            <div v-for="action in MATERIAL_ACTIONS" :key="action.id" class="col-md-6">
              <div class="form-check form-switch">
                <input
                  :id="action.key"
                  class="form-check-input"
                  type="checkbox"
                  role="switch"
                  :checked="isActionOn(action.id)"
                  @change="setActionOn(action.id, $event.target.checked)"
                />
                <label class="form-check-label" :for="action.key">{{ action.label }}</label>
              </div>
              <div class="form-text ms-4">{{ action.hint }}</div>
            </div>
          </div>

          <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Google Classroom</h2>
          <div class="row g-3">
            <div class="col-12">
              <label class="admin-form-label">Sharing URL (optional)</label>
              <input
                v-model="form.classroom_share_url"
                class="form-control"
                placeholder="https://classroom.google.com/share?url={url}&title={title}"
                :disabled="!isActionOn('classroom')"
              />
              <div class="form-text">
                Leave blank to use the Google Classroom default.
                Use <code>{url}</code> for the resource link and <code>{title}</code> for its title.
              </div>
            </div>
          </div>

          <div class="alert alert-light border mt-4 mb-0 small">
            <i class="bi bi-info-circle me-1"></i>
            The <strong>Pinterest</strong> button appears only on resources with a cover image.
            Payments and subscriptions are available in <router-link to="/admin/payments">Payments</router-link>.
          </div>
        </div>
        <div class="admin-card-header border-top">
          <button type="submit" class="btn btn-primary px-4" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-check-lg me-1"></i>
            Save integrations
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
