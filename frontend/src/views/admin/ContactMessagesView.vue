<script setup>
import { computed, onMounted, ref } from 'vue';
import api from '@/api';

const messages = ref([]);
const selectedId = ref(null);
const loading = ref(true);
const error = ref('');
const busy = ref(false);

const sortedMessages = computed(() =>
  [...messages.value].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
);
const selected = computed(() =>
  messages.value.find((message) => String(message.id) === String(selectedId.value)) || null
);
const unreadCount = computed(() =>
  messages.value.filter((message) => message.status !== 'read').length
);

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

async function loadMessages() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/admin/contact-messages');
    messages.value = data.messages || [];
    if (!selected.value && sortedMessages.value.length) {
      selectedId.value = sortedMessages.value[0].id;
    }
  } catch (err) {
    error.value = err.response?.data?.error || 'Could not load contact messages.';
  } finally {
    loading.value = false;
  }
}

async function setStatus(message, status) {
  if (!message || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.patch(`/admin/contact-messages/${message.id}`, { status });
    message.status = status;
    message.read_at = status === 'read' ? new Date().toISOString() : null;
  } catch (err) {
    error.value = err.response?.data?.error || 'Could not update the contact message.';
  } finally {
    busy.value = false;
  }
}

async function deleteSelected() {
  if (!selected.value || busy.value) return;
  if (!window.confirm('Delete this contact message?')) return;
  busy.value = true;
  error.value = '';
  const id = selected.value.id;
  try {
    await api.delete(`/admin/contact-messages/${id}`);
    messages.value = messages.value.filter((message) => String(message.id) !== String(id));
    selectedId.value = sortedMessages.value[0]?.id ?? null;
  } catch (err) {
    error.value = err.response?.data?.error || 'Could not delete the contact message.';
  } finally {
    busy.value = false;
  }
}

onMounted(loadMessages);
</script>

<template>
  <div>
    <div class="admin-page-header d-flex flex-wrap justify-content-between align-items-start gap-3">
      <div>
        <h1>Contact Messages</h1>
        <p>Read and manage messages submitted through the website</p>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="badge text-bg-primary">{{ unreadCount }} unread</span>
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="loading" @click="loadMessages">
          <i class="bi bi-arrow-clockwise me-1"></i>Refresh
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div v-if="loading" class="admin-card">
      <div class="admin-card-body text-center py-5">
        <span class="spinner-border text-primary" role="status"></span>
        <p class="text-muted mt-3 mb-0">Loading contact messages…</p>
      </div>
    </div>

    <div v-else-if="!sortedMessages.length" class="admin-card">
      <div class="admin-card-body text-center py-5">
        <i class="bi bi-inbox fs-1 text-muted"></i>
        <h2 class="h5 mt-3">No contact messages yet</h2>
        <p class="text-muted mb-0">New website messages will appear here.</p>
      </div>
    </div>

    <div v-else class="contact-inbox">
      <section class="admin-card contact-list" aria-label="Contact message list">
        <button
          v-for="message in sortedMessages"
          :key="message.id"
          type="button"
          class="contact-list-item"
          :class="{ active: String(message.id) === String(selectedId), unread: message.status !== 'read' }"
          @click="selectedId = message.id"
        >
          <span class="contact-list-heading">
            <strong>{{ message.name }}</strong>
            <small>{{ formatDate(message.created_at) }}</small>
          </span>
          <span class="contact-list-email">{{ message.email }}</span>
          <span class="contact-list-preview">{{ message.message }}</span>
        </button>
      </section>

      <section v-if="selected" class="admin-card contact-detail">
        <div class="admin-card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <h2 class="h5 mb-1">{{ selected.name }}</h2>
            <a :href="`mailto:${selected.email}`">{{ selected.email }}</a>
          </div>
          <span class="badge" :class="selected.status === 'read' ? 'text-bg-light' : 'text-bg-primary'">
            {{ selected.status === 'read' ? 'Read' : 'Unread' }}
          </span>
        </div>
        <div class="admin-card-body">
          <p class="text-muted small">{{ formatDate(selected.created_at) }}</p>
          <p class="contact-message-body">{{ selected.message }}</p>
          <p class="small text-muted mb-0">
            Email notification:
            <strong>{{ String(selected.notification_status || 'not_configured').replace('_', ' ') }}</strong>
          </p>
        </div>
        <div class="admin-card-header border-top d-flex flex-wrap gap-2">
          <a :href="`mailto:${selected.email}`" class="btn btn-primary">
            <i class="bi bi-reply me-1"></i>Reply
          </a>
          <button
            v-if="selected.status === 'read'"
            type="button"
            class="btn btn-outline-secondary"
            :disabled="busy"
            @click="setStatus(selected, 'unread')"
          >
            Mark as unread
          </button>
          <button
            v-else
            type="button"
            class="btn btn-outline-secondary"
            :disabled="busy"
            @click="setStatus(selected, 'read')"
          >
            Mark as read
          </button>
          <button type="button" class="btn btn-outline-danger ms-auto" :disabled="busy" @click="deleteSelected">
            <i class="bi bi-trash me-1"></i>Delete
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.contact-inbox {
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.contact-list {
  max-height: 68vh;
  overflow-y: auto;
}

.contact-list-item {
  width: 100%;
  padding: 1rem;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
  color: #334155;
  text-align: left;
}

.contact-list-item:hover,
.contact-list-item.active {
  background: #eff6ff;
}

.contact-list-item.unread {
  box-shadow: inset 4px 0 #2563eb;
}

.contact-list-heading {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.contact-list-heading small,
.contact-list-email,
.contact-list-preview {
  display: block;
  color: #64748b;
  font-size: 0.82rem;
}

.contact-list-preview {
  margin-top: 0.35rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-message-body {
  min-height: 9rem;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .contact-inbox {
    grid-template-columns: 1fr;
  }

  .contact-list {
    max-height: 20rem;
  }
}
</style>
