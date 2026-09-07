<script setup>
import { ref, onMounted, computed } from 'vue';
import api from '@/api';
import { useSettingsStore } from '@/stores';
import LineListEditor from '@/components/admin/LineListEditor.vue';
import MaterialTypeListEditor from '@/components/admin/MaterialTypeListEditor.vue';

const settingsStore = useSettingsStore();
const form = ref({});
const message = ref('');
const error = ref('');

const socialProfiles = [
  ['Facebook', 'social_facebook'],
  ['Pinterest', 'social_pinterest'],
  ['Instagram', 'social_instagram'],
  ['YouTube', 'social_youtube'],
];

const analyticsConfigured = computed(() => /^G-[A-Z0-9]+$/i.test(String(form.value.google_analytics_id || '').trim()));
const enabledSocialCount = computed(() => socialProfiles.filter(([, key]) => String(form.value[key] || '').trim()).length);
const DEFAULT_CONTACT_EMAIL = 'jewisheducationalresources1@gmail.com';

const navHideEmpty = computed({
  get: () => form.value.nav_hide_empty !== 'false',
  set: (value) => {
    form.value.nav_hide_empty = value ? 'true' : 'false';
  },
});

onMounted(async () => {
  await settingsStore.load();
  form.value = {
    ...settingsStore.settings,
    download_limit_enabled: settingsStore.settings.download_limit_enabled === 'true',
    download_limit_max: Number(settingsStore.settings.download_limit_max) || 10,
    nav_max_top_level: Number(settingsStore.settings.nav_max_top_level) || 0,
    nav_hide_empty: settingsStore.settings.nav_hide_empty ?? 'true',
    social_pinterest: settingsStore.settings.social_pinterest || 'https://www.pinterest.com/jewisheducationalresources1/',
    contact_notify_email: settingsStore.settings.contact_notify_email || DEFAULT_CONTACT_EMAIL,
    contact_redirect_url: settingsStore.settings.contact_redirect_url || '',
    contact_redirect_delay: Number(settingsStore.settings.contact_redirect_delay) || 0,
  };
});

function isValidProfileUrl(value) {
  if (!String(value || '').trim()) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidContactEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidContactRedirect(value) {
  const raw = String(value || '').trim();
  if (!raw) return true;
  if (raw.startsWith('/') && !raw.startsWith('//')) return true;
  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

async function save() {
  error.value = '';
  const invalidProfile = socialProfiles.find(([, key]) => !isValidProfileUrl(form.value[key]));
  if (invalidProfile) {
    error.value = `${invalidProfile[0]} needs a complete HTTPS URL.`;
    return;
  }
  if (form.value.google_analytics_id && !analyticsConfigured.value) {
    error.value = 'Google Analytics ID must use the format G-XXXXXXXXXX.';
    return;
  }
  if (!isValidContactEmail(form.value.contact_notify_email)) {
    error.value = 'Enter a valid contact notification email.';
    return;
  }
  if (!isValidContactRedirect(form.value.contact_redirect_url)) {
    error.value = 'Contact redirect must be a site path or a complete HTTPS URL.';
    return;
  }
  try {
    const payload = {
      ...form.value,
      download_limit_enabled: form.value.download_limit_enabled ? 'true' : 'false',
      download_limit_max: String(form.value.download_limit_max ?? 10),
      nav_max_top_level: String(form.value.nav_max_top_level ?? 0),
      nav_hide_empty: form.value.nav_hide_empty !== 'false' ? 'true' : 'false',
      contact_notify_email: String(form.value.contact_notify_email || '').trim().toLowerCase(),
      contact_redirect_url: String(form.value.contact_redirect_url || '').trim(),
      contact_redirect_delay: String(Math.min(10, Math.max(0, Math.floor(Number(form.value.contact_redirect_delay) || 0)))),
    };
    await api.put('/settings', { settings: payload });
    await settingsStore.load();
    message.value = 'Settings saved successfully.';
    setTimeout(() => { message.value = ''; }, 3000);
  } catch (err) {
    error.value = err.response?.data?.error || 'Error saving settings.';
  }
}
</script>

<template>
  <div>
    <div class="admin-page-header">
      <h1>Settings</h1>
      <p>Customize the site, download limits, and navigation</p>
    </div>

    <div v-if="message" class="alert alert-success">{{ message }}</div>
    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <form class="admin-card" @submit.prevent="save">
      <div class="admin-card-body">
        <h2 class="h6 text-uppercase text-muted mb-3" style="letter-spacing:0.05em">Site</h2>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="admin-form-label" for="settings-site-name">Site name</label>
            <input id="settings-site-name" v-model="form.site_name" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="admin-form-label" for="settings-site-logo">Logo (URL)</label>
            <input id="settings-site-logo" v-model="form.site_logo" class="form-control" placeholder="/uploads/covers/logo.png" />
          </div>
          <div class="col-12">
            <label class="admin-form-label" for="settings-site-description">Description</label>
            <textarea id="settings-site-description" v-model="form.site_description" class="form-control" rows="2"></textarea>
          </div>
          <div class="col-12">
            <label class="admin-form-label" for="settings-seo-keywords">SEO keywords</label>
            <input id="settings-seo-keywords" v-model="form.seo_keywords" class="form-control" />
          </div>
          <div class="col-12">
            <label class="admin-form-label" for="settings-grade-levels">Grades</label>
            <LineListEditor v-model="form.grade_levels" input-id="settings-grade-levels" placeholder="Example: Grade 1" />
            <div class="form-text">
              This list appears on the resource form and as a Library filter. Leave it blank to hide the filter.
            </div>
          </div>
          <div class="col-12">
            <label class="admin-form-label" for="settings-material-types">Resource types</label>
            <MaterialTypeListEditor v-model="form.material_types" input-id="settings-material-types" placeholder="Example: Worksheet" />
            <div class="form-text">
              Click the icon or color circle to change it. This list appears on the resource form and as a Library filter.
            </div>
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Download limits</h2>
        <p class="text-muted small mb-3">
          Control how many times each user can download resources. Browser previews do not count toward the limit; only file downloads do.
          Administrators have no limit. You can also set a different limit for each resource under Admin → Materials → Edit.
        </p>
        <div class="row g-3">
          <div class="col-12">
            <div class="form-check form-switch">
              <input
                id="download_limit_enabled"
                v-model="form.download_limit_enabled"
                class="form-check-input"
                type="checkbox"
                role="switch"
              />
              <label class="form-check-label" for="download_limit_enabled">Enable download limit</label>
            </div>
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-download-limit-max">Maximum quantity</label>
            <input
              id="settings-download-limit-max"
              v-model.number="form.download_limit_max"
              type="number"
              min="0"
              class="form-control"
              :disabled="!form.download_limit_enabled"
            />
            <div class="form-text">Use 0 for unlimited downloads, even when the switch is enabled.</div>
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-download-limit-period">Period</label>
            <select id="settings-download-limit-period" v-model="form.download_limit_period" class="form-select" :disabled="!form.download_limit_enabled">
              <option value="day">Per day</option>
              <option value="week">Per week</option>
              <option value="month">per month</option>
              <option value="year">Per year</option>
              <option value="forever">Lifetime total (no reset)</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-download-limit-mode">Apply limit to</label>
            <select id="settings-download-limit-mode" v-model="form.download_limit_mode" class="form-select" :disabled="!form.download_limit_enabled">
              <option value="per_resource">Each resource separately</option>
              <option value="global">All resources together</option>
            </select>
            <div class="form-text">
              <strong>Each material:</strong> ex. 3 Aleph-Bet downloads per month.<br />
              <strong>All together:</strong> ex. 10 site downloads per month.
            </div>
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Paywall / Premium</h2>
        <p class="text-muted small mb-3">
          Text shown when a user reaches the limit or tries to download a full PDF.
          To enable PayPal and checkout on the site, use the
          <router-link to="/admin/payments">Payments</router-link>.
        </p>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-paywall-plan-name">Plan name</label>
            <input id="settings-paywall-plan-name" v-model="form.paywall_plan_name" class="form-control" placeholder="Premium" />
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-paywall-plan-price">Displayed price</label>
            <input id="settings-paywall-plan-price" v-model="form.paywall_plan_price" class="form-control" placeholder="$29/month" />
          </div>
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-paywall-upgrade-url">Subscription / payment link</label>
            <input id="settings-paywall-upgrade-url" v-model="form.paywall_upgrade_url" class="form-control" placeholder="https://..." />
          </div>
          <div class="col-md-6">
            <label class="admin-form-label" for="settings-paywall-limit-title">Title — limit reached</label>
            <input id="settings-paywall-limit-title" v-model="form.paywall_limit_title" class="form-control" />
          </div>
          <div class="col-md-6">
            <label class="admin-form-label" for="settings-paywall-premium-title">Title — Premium full PDF</label>
            <input id="settings-paywall-premium-title" v-model="form.paywall_premium_title" class="form-control" />
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Social profiles</h2>
        <p class="text-muted small mb-3">{{ enabledSocialCount }} of 4 profile links are active. Save to update the footer immediately.</p>
        <div class="row g-3">
          <div class="col-md-3">
            <label class="admin-form-label" for="settings-social-facebook">Facebook</label>
            <input id="settings-social-facebook" v-model="form.social_facebook" class="form-control" type="url" placeholder="https://facebook.com/..." />
          </div>
          <div class="col-md-3">
            <label class="admin-form-label" for="settings-social-pinterest">Pinterest</label>
            <input id="settings-social-pinterest" v-model="form.social_pinterest" class="form-control" type="url" placeholder="https://pinterest.com/..." />
          </div>
          <div class="col-md-3">
            <label class="admin-form-label" for="settings-social-instagram">Instagram</label>
            <input id="settings-social-instagram" v-model="form.social_instagram" class="form-control" type="url" placeholder="https://instagram.com/..." />
          </div>
          <div class="col-md-3">
            <label class="admin-form-label" for="settings-social-youtube">YouTube</label>
            <input id="settings-social-youtube" v-model="form.social_youtube" class="form-control" type="url" placeholder="https://youtube.com/..." />
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Contact form</h2>
        <p class="text-muted small mb-3">
          Messages are always saved under <router-link to="/admin/contact-messages">Contact Messages</router-link>.
          Email notifications are sent when SMTP is configured.
        </p>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="admin-form-label" for="contact-notify-email">Notification email</label>
            <input
              id="contact-notify-email"
              v-model.trim="form.contact_notify_email"
              class="form-control"
              type="email"
              required
              placeholder="name@example.com"
            />
          </div>
          <div class="col-md-6">
            <label class="admin-form-label" for="contact-redirect-url">Redirect after submission</label>
            <input
              id="contact-redirect-url"
              v-model.trim="form.contact_redirect_url"
              class="form-control"
              placeholder="/thank-you or https://example.com/thank-you"
            />
            <div class="form-text">Leave blank to keep visitors on the contact form.</div>
          </div>
          <div class="col-md-3">
            <label class="admin-form-label" for="contact-redirect-delay">Redirect delay (seconds)</label>
            <input
              id="contact-redirect-delay"
              v-model.number="form.contact_redirect_delay"
              class="form-control"
              type="number"
              min="0"
              max="10"
              step="1"
            />
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Top navigation (subjects)</h2>
        <p class="text-muted small mb-3">
          Navigation subjects come from <strong>Admin → Categories</strong>. Here you control how many appear and whether empty subjects are hidden.
        </p>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="admin-form-label" for="settings-nav-max-top-level">Maximum top subjects</label>
            <input id="settings-nav-max-top-level" v-model.number="form.nav_max_top_level" type="number" min="0" class="form-control" />
            <div class="form-text">0 shows all subjects. For example, 6 limits the top bar to six.</div>
          </div>
          <div class="col-md-4 d-flex align-items-end">
            <div class="form-check form-switch mb-2">
              <input
                id="nav_hide_empty"
                v-model="navHideEmpty"
                class="form-check-input"
                type="checkbox"
              />
              <label class="form-check-label" for="nav_hide_empty">Hide subjects without materials</label>
            </div>
          </div>
        </div>

        <h2 class="h6 text-uppercase text-muted mb-3 mt-4" style="letter-spacing:0.05em">Google Analytics</h2>
        <p class="text-muted small mb-3">
          Optional database ID in addition to <code>VITE_GA_MEASUREMENT_ID</code> at deployment. The <strong>Dashboard</strong> shows internal visits and links to the complete GA report.
        </p>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="admin-form-label" for="settings-google-analytics-id">Google Analytics ID</label>
            <input id="settings-google-analytics-id" v-model="form.google_analytics_id" class="form-control" placeholder="G-XXXXXXXXXX" />
            <div class="form-text" :class="analyticsConfigured ? 'text-success' : 'text-muted'">
              {{ analyticsConfigured ? 'Measurement ID format is valid.' : 'Enter an ID such as G-HHPLFCMXZC.' }}
            </div>
            <div class="form-text">Example: G-HHPLFCMXZC — save it and use the button on the Dashboard.</div>
          </div>
        </div>
      </div>
      <div class="admin-card-header border-top">
        <button type="submit" class="btn btn-primary px-4">
          <i class="bi bi-check-lg me-1"></i>Save settings
        </button>
      </div>
    </form>
  </div>
</template>
