<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '@/api';
import { getGaConsoleUrl, isAnalyticsEnabled } from '@/analytics';

const stats = ref({});
const recentDownloads = ref([]);
const topResources = ref([]);
const analytics = ref(null);
const downloadReport = ref(null);
const loading = ref(true);
const error = ref('');

const gaConsoleUrl = getGaConsoleUrl();
const gaActive = computed(() => isAnalyticsEnabled());

const downloadFunnel = computed(() => {
  const totals = analytics.value?.interactionEvents?.totals || {};
  const opens = Number(totals.download_page_open) || 0;
  const completed = Number(totals.download_completed) || 0;
  return {
    opens,
    completed,
    conversion: opens ? Math.round((completed / opens) * 100) : 0,
  };
});

const maxChartViews = computed(() => {
  const rows = analytics.value?.dailyChart || [];
  return Math.max(...rows.map((r) => Number(r.views) || 0), 1);
});

function formatDay(day) {
  if (!day) return '';
  const d = new Date(`${day}T12:00:00`);
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function pageLabel(path) {
  const labels = {
    '/': 'Home',
    '/library': 'Library',
    '/login': 'Login',
    '/sign-up': 'Sign up',
  };
  return labels[path] || path;
}

onMounted(loadDashboard);

async function loadDashboard() {
  loading.value = true;
  error.value = '';
  try {
    const [dashboardRes, analyticsRes, reportRes] = await Promise.all([
      api.get('/admin/dashboard'),
      api.get('/analytics/stats').catch(() => ({ data: null })),
      api.get('/admin/downloads/report').catch(() => ({ data: null })),
    ]);
    stats.value = dashboardRes.data.stats || {};
    recentDownloads.value = dashboardRes.data.recentDownloads || [];
    topResources.value = dashboardRes.data.topResources || [];
    analytics.value = analyticsRes.data;
    downloadReport.value = reportRes.data?.report || null;
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not load the dashboard. Please try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div>
    <div class="admin-page-header d-flex flex-wrap justify-content-between align-items-start gap-3">
      <div>
        <h1>Dashboard</h1>
        <p>Platform overview</p>
      </div>
      <a
        :href="gaConsoleUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="btn btn-outline-primary btn-sm"
      >
        <i class="bi bi-graph-up-arrow me-1"></i>
        Open Google Analytics
      </a>
    </div>

    <div v-if="loading" class="admin-card text-center py-5" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <p class="mb-0 mt-2">Loading dashboard…</p>
    </div>

    <div v-else-if="error" class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn btn-sm btn-outline-dark" @click="loadDashboard">Retry</button>
    </div>

    <template v-else>
    <div class="admin-card mb-4">
      <div class="admin-card-header">
        <i class="bi bi-compass me-2"></i>Google Analytics — next steps
      </div>
      <div class="admin-card-body small">
        <p class="mb-2">
          The site is already configured with ID
          <code>{{ analytics?.googleAnalyticsId || analytics?.measurementId || 'Not configured' }}</code>.
          Use the panel below for a quick traffic overview. For complete reports such as time on page and navigation paths, open Google Analytics.
        </p>
        <ol class="mb-3 ps-3">
          <li>Click <strong>Open Google Analytics</strong> at the top of this page.</li>
          <li>In the menu, open <strong>Reports → Engagement → Pages and screens</strong> to see time on each page.</li>
          <li>To see where visits came from, open <strong>Acquisition → Traffic acquisition</strong>.</li>
          <li>For WhatsApp, Pinterest, and email campaigns, use links with tracking parameters as shown below.</li>
        </ol>
        <div class="alert alert-light border mb-0">
          <strong>Trackable links (copy and use on social media):</strong>
          <ul class="mb-0 mt-2">
            <li><code>https://jewisheducationalresources.org/?utm_source=whatsapp&utm_medium=social</code></li>
            <li><code>https://jewisheducationalresources.org/?utm_source=pinterest&utm_medium=social</code></li>
            <li><code>https://jewisheducationalresources.org/?utm_source=email&utm_medium=newsletter</code></li>
          </ul>
        </div>
        <p v-if="!gaActive" class="text-warning mb-0 mt-2">
          <i class="bi bi-exclamation-triangle me-1"></i>
          GA is not active in this build. Check <code>VITE_GA_MEASUREMENT_ID</code> or Admin → Settings → Google Analytics ID.
        </p>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div
        v-for="item in [
          { key: 'users', label: 'Users', icon: 'bi-people' },
          { key: 'resources', label: 'Materials', icon: 'bi-file-earmark-text' },
          { key: 'downloads', label: 'Downloads', icon: 'bi-download' },
          { key: 'categories', label: 'Categories', icon: 'bi-tags' },
        ]"
        :key="item.key"
        class="col-sm-6 col-xl-3"
      >
        <div class="admin-stat-card">
          <div class="card-body d-flex align-items-center gap-3 p-3">
            <div class="stat-icon"><i :class="item.icon"></i></div>
            <div>
              <div class="stat-value">{{ stats[item.key] || 0 }}</div>
              <div class="text-muted small">{{ item.label }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="analytics" class="admin-card mb-4">
      <div class="admin-card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span><i class="bi bi-bar-chart-line me-2"></i>Site traffic</span>
        <small class="text-muted">Google Analytics + internal dashboard</small>
      </div>
      <div class="p-3">
        <div class="row g-3 mb-4">
          <div class="col-sm-6 col-lg-3">
            <div class="analytics-metric">
              <div class="analytics-metric-value">{{ analytics.today?.visitors || 0 }}</div>
              <div class="analytics-metric-label">Visitors today</div>
              <small class="text-muted">{{ analytics.today?.pageViews || 0 }} page views</small>
            </div>
          </div>
          <div class="col-sm-6 col-lg-3">
            <div class="analytics-metric">
              <div class="analytics-metric-value">{{ analytics.week?.visitors || 0 }}</div>
              <div class="analytics-metric-label">Last 7 days</div>
              <small class="text-muted">{{ analytics.week?.pageViews || 0 }} page views</small>
            </div>
          </div>
          <div class="col-sm-6 col-lg-3">
            <div class="analytics-metric">
              <div class="analytics-metric-value">{{ analytics.month?.visitors || 0 }}</div>
              <div class="analytics-metric-label">Last 30 days</div>
              <small class="text-muted">{{ analytics.month?.pageViews || 0 }} page views</small>
            </div>
          </div>
          <div class="col-sm-6 col-lg-3">
            <div class="analytics-metric">
              <div class="analytics-metric-value">{{ analytics.total?.visitors || 0 }}</div>
              <div class="analytics-metric-label">Total visitors</div>
              <small class="text-muted">{{ analytics.total?.pageViews || 0 }} page views</small>
            </div>
          </div>
        </div>

        <div v-if="analytics.dailyChart?.length" class="analytics-chart mb-4">
          <div class="small text-muted mb-2">Page views — last 14 days</div>
          <div class="analytics-chart-bars">
            <div
              v-for="row in analytics.dailyChart"
              :key="row.day"
              class="analytics-chart-bar-wrap"
              :title="`${formatDay(row.day)}: ${row.views} views`"
            >
              <div
                class="analytics-chart-bar"
                :style="{ height: `${(Number(row.views) / maxChartViews) * 100}%` }"
              ></div>
              <span class="analytics-chart-label">{{ formatDay(row.day) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="analytics?.interactionEvents" class="row g-4 mb-4">
      <div class="col-lg-5">
        <div class="admin-card h-100">
          <div class="admin-card-header">Content interactions</div>
          <div class="list-group list-group-flush">
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Preview opens</span>
              <strong>{{ analytics.interactionEvents.totals?.resource_preview_open || 0 }}</strong>
            </div>
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Page clicks</span>
              <strong>{{ analytics.interactionEvents.totals?.resource_page_click || 0 }}</strong>
            </div>
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Download clicks</span>
              <strong>{{ analytics.interactionEvents.totals?.resource_download_click || 0 }}</strong>
            </div>
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Download-page opens</span>
              <strong>{{ analytics.interactionEvents.totals?.download_page_open || 0 }}</strong>
            </div>
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Deliveries started</span>
              <strong>{{ analytics.interactionEvents.totals?.download_started || 0 }}</strong>
            </div>
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Files delivered</span>
              <strong>{{ analytics.interactionEvents.totals?.download_completed || 0 }}</strong>
            </div>
            <div class="list-group-item d-flex justify-content-between border-0 px-3 py-3">
              <span>Open → delivered</span>
              <strong>{{ downloadFunnel.conversion }}%</strong>
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="admin-card h-100">
          <div class="admin-card-header">Preview and page clicks by file</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="row in analytics.interactionEvents.perFile || []"
              :key="`${row.resource_id}-${row.file_id}`"
              class="list-group-item d-flex justify-content-between align-items-center border-0 px-3 py-3"
            >
              <span>
                <strong>{{ row.file_label }}</strong>
                <small class="text-muted d-block">{{ row.resource_title }}</small>
              </span>
              <span class="text-end small">
                <span class="badge rounded-pill text-bg-info me-1">{{ row.previews || 0 }} previews</span>
                <span class="badge rounded-pill text-bg-secondary me-1">{{ row.page_clicks || 0 }} page clicks</span>
                <span class="badge rounded-pill text-bg-warning me-1">{{ row.download_clicks || 0 }} download clicks</span>
                <span class="badge rounded-pill text-bg-primary me-1">{{ row.download_page_opens || 0 }} opens</span>
                <span class="badge rounded-pill text-bg-success">{{ row.download_completed || 0 }} delivered</span>
              </span>
            </li>
            <li
              v-if="!analytics.interactionEvents.perFile?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              Preview and page activity will appear here.
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Traffic sources (30 days)</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="row in analytics?.topTrafficSources || []"
              :key="row.source"
              class="list-group-item d-flex justify-content-between align-items-center border-0 px-3 py-3"
            >
              <span>{{ row.source }}</span>
              <span class="badge rounded-pill text-bg-secondary">{{ row.visits }}</span>
            </li>
            <li
              v-if="!analytics?.topTrafficSources?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              Traffic sources will appear as the site receives visits.
            </li>
          </ul>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Sign-up sources</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="row in analytics?.signupSources || []"
              :key="row.source"
              class="list-group-item d-flex justify-content-between align-items-center border-0 px-3 py-3"
            >
              <span>{{ row.source }}</span>
              <span class="badge rounded-pill text-bg-primary">{{ row.count }} user(s)</span>
            </li>
            <li
              v-if="!analytics?.signupSources?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              New sign-ups will show their source here. Also see Admin → Users.
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Most visited pages (30 days)</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="page in analytics?.topPages || []"
              :key="page.path"
              class="list-group-item d-flex justify-content-between align-items-center border-0 px-3 py-3"
            >
              <span class="text-truncate me-2">{{ pageLabel(page.path) }}</span>
              <span class="badge rounded-pill text-bg-secondary">{{ page.views }}</span>
            </li>
            <li
              v-if="!analytics?.topPages?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              Visits will appear here as people use the site.
            </li>
          </ul>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Recent visits</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="(visit, i) in analytics?.recentVisits || []"
              :key="i"
              class="list-group-item d-flex justify-content-between align-items-start border-0 px-3 py-3 gap-2"
            >
              <span class="text-truncate">{{ pageLabel(visit.path) }}</span>
              <small class="text-muted text-nowrap">{{ formatDateTime(visit.created_at) }}</small>
            </li>
            <li
              v-if="!analytics?.recentVisits?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              No visits recorded yet.
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Clicks on the download page</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="(row, i) in downloadReport?.recentIntents || []"
              :key="'intent-' + i"
              class="list-group-item d-flex justify-content-between align-items-start border-0 px-3 py-3 gap-2"
            >
              <span>
                <strong>{{ row.user_name }}</strong>
                <small class="text-muted d-block">{{ row.file_label }} · {{ row.resource_title }}</small>
              </span>
              <small class="text-muted text-nowrap">{{ formatDateTime(row.created_at) }}</small>
            </li>
            <li
              v-if="!downloadReport?.recentIntents?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              Activity will appear here when someone opens a download page.
            </li>
          </ul>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Completed downloads (file saved)</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="(row, i) in downloadReport?.recent || []"
              :key="'dl-' + i"
              class="list-group-item d-flex justify-content-between align-items-start border-0 px-3 py-3 gap-2"
            >
              <span>
                <strong>{{ row.user_name }}</strong>
                <small class="text-muted d-block">{{ row.file_label }} · {{ row.resource_title }}</small>
              </span>
              <small class="text-muted text-nowrap">{{ formatDateTime(row.created_at) }}</small>
            </li>
            <li
              v-if="!downloadReport?.recent?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              No completed downloads yet.
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Downloads by worksheet / letter</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="(row, i) in downloadReport?.perFile || []"
              :key="i"
              class="list-group-item d-flex justify-content-between align-items-center border-0 px-3 py-3"
            >
              <span>
                <strong>{{ row.file_label }}</strong>
                <small class="text-muted d-block">{{ row.resource_title }}</small>
              </span>
              <span class="badge rounded-pill text-bg-primary">{{ row.count }}</span>
            </li>
            <li
              v-if="!downloadReport?.perFile?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              No downloads recorded yet.
            </li>
          </ul>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Who downloaded what</div>
          <div class="list-group list-group-flush">
            <div
              v-for="user in downloadReport?.perUser || []"
              :key="user.user_id"
              class="list-group-item border-0 px-3 py-3"
            >
              <div class="d-flex justify-content-between align-items-start mb-1">
                <strong>{{ user.user_name }}</strong>
                <span class="badge text-bg-secondary">{{ user.total }} downloads</span>
              </div>
              <small class="text-muted d-block mb-2">{{ user.user_email }}</small>
              <ul class="small mb-0 ps-3">
                <li v-for="(f, j) in user.files" :key="j">
                  {{ f.file_label }} <span class="text-muted">({{ f.resource_title }})</span> — {{ f.count }}×
                </li>
              </ul>
            </div>
            <div
              v-if="!downloadReport?.perUser?.length"
              class="list-group-item text-muted border-0 py-4 text-center"
            >
              Downloads by user will appear here.
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Recent downloads</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="(d, i) in recentDownloads"
              :key="i"
              class="list-group-item d-flex justify-content-between border-0 px-3 py-3"
            >
              <span>
                {{ d.resource_title }}
                <small v-if="d.file_label" class="text-muted d-block">{{ d.file_label }}</small>
              </span>
              <small class="text-muted text-end">{{ d.user_name || 'Anonymous' }}</small>
            </li>
            <li v-if="!recentDownloads.length" class="list-group-item text-muted border-0 py-4 text-center">
              No downloads yet.
            </li>
          </ul>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="admin-card">
          <div class="admin-card-header">Most downloaded</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="r in topResources"
              :key="r.id"
              class="list-group-item d-flex justify-content-between align-items-center border-0 px-3 py-3"
            >
              <span>{{ r.title }}</span>
              <span class="badge rounded-pill text-bg-primary">{{ r.download_count }}</span>
            </li>
            <li v-if="!topResources.length" class="list-group-item text-muted border-0 py-4 text-center">
              No data.
            </li>
          </ul>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>
