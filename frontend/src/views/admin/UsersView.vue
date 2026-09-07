<script setup>

import { ref, computed, onMounted, nextTick } from 'vue';

import { RouterLink } from 'vue-router';

import api from '@/api';



const users = ref([]);
const loading = ref(true);

const error = ref('');
const success = ref('');

const searchQuery = ref('');
const addUserButton = ref(null);
const createUserModal = ref(null);
const showCreateUser = ref(false);
const showPassword = ref(false);
const creatingUser = ref(false);
const createError = ref('');
const newUser = ref(emptyNewUser());
let previousActiveElement = null;

function emptyNewUser() {
  return {
    name: '',
    email: '',
    password: '',
    role: 'user',
    account_type: 'free',
  };
}



const planOptions = [

  { value: 'free', label: 'Free', class: 'admin-select-plan-free' },

  { value: 'paid', label: 'Paid', class: 'admin-select-plan-paid' },

  { value: 'school', label: 'School', class: 'admin-select-plan-school' },

];



const sourceBadgeClass = {

  WhatsApp: 'badge-source-whatsapp',

  Pinterest: 'badge-source-pinterest',

  Facebook: 'badge-source-facebook',

  Instagram: 'badge-source-instagram',

  YouTube: 'badge-source-youtube',

  'E-mail': 'badge-source-email',
  Email: 'badge-source-email',

  Google: 'badge-source-google',

  'Google (ad)': 'badge-source-google-ads',

  Direto: 'badge-source-direct',
  Direct: 'badge-source-direct',

  'Outro site': 'badge-source-other',
  'Other website': 'badge-source-other',

  Desconhecido: 'badge-source-unknown',
  Unknown: 'badge-source-unknown',

};

const sourceLabels = {
  'E-mail': 'Email',
  Direto: 'Direct',
  'Outro site': 'Other website',
  Desconhecido: 'Unknown',
};



const filteredUsers = computed(() => {

  const q = searchQuery.value.trim().toLowerCase();

  if (!q) return users.value;

  return users.value.filter(

    (u) =>

      u.name?.toLowerCase().includes(q) ||

      u.email?.toLowerCase().includes(q) ||

      planLabel(u.plan).toLowerCase().includes(q) ||

      (u.signup_source || '').toLowerCase().includes(q)

  );

});



function sourceLabel(user) {

  const source = user.signup_source || 'Desconhecido';
  return sourceLabels[source] || source;

}



function sourceClass(user) {

  return sourceBadgeClass[user.signup_source || 'Desconhecido'] || 'badge-source-unknown';

}



function sourceDetail(user) {

  const parts = [];

  if (user.signup_method) parts.push(`Sign-up: ${user.signup_method === 'google' ? 'Google' : 'Email'}`);

  if (user.signup_utm_source) parts.push(`utm_source=${user.signup_utm_source}`);

  if (user.signup_utm_medium) parts.push(`utm_medium=${user.signup_utm_medium}`);

  if (user.signup_utm_campaign) parts.push(`utm_campaign=${user.signup_utm_campaign}`);

  if (user.signup_referrer) parts.push(`referrer: ${user.signup_referrer}`);

  if (user.signup_landing_path) parts.push(`page: ${user.signup_landing_path}`);

  return parts.join(' · ') || 'No source data (older sign-up)';

}



function planLabel(plan) {

  return planOptions.find((p) => p.value === plan)?.label || 'Free';

}



function planSelectClass(plan) {

  return planOptions.find((p) => p.value === plan)?.class || 'admin-select-plan-free';

}



function formatDate(value) {

  if (!value) return '—';

  return new Date(value).toLocaleDateString('en-US');

}



onMounted(loadUsers);

async function openCreateUser() {
  previousActiveElement = document.activeElement;
  createError.value = '';
  showPassword.value = false;
  newUser.value = emptyNewUser();
  showCreateUser.value = true;
  await nextTick();
  createUserModal.value?.querySelector('#new-user-name')?.focus();
}

async function closeCreateUser() {
  if (creatingUser.value) return;
  showCreateUser.value = false;
  createError.value = '';
  newUser.value.password = '';
  await nextTick();
  const target = previousActiveElement || addUserButton.value;
  previousActiveElement = null;
  if (target && target.isConnected) target.focus({ preventScroll: true });
}

function onCreateDialogKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCreateUser();
    return;
  }
  if (event.key !== 'Tab') return;
  const elements = Array.from(createUserModal.value?.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) || []);
  if (!elements.length) return;
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function createUser() {
  createError.value = '';
  success.value = '';
  const payload = {
    ...newUser.value,
    name: newUser.value.name.trim(),
    email: newUser.value.email.trim().toLowerCase(),
  };

  if (!payload.name || !payload.email || payload.password.length < 6) {
    createError.value = 'Complete all fields. The temporary password needs at least 6 characters.';
    return;
  }

  creatingUser.value = true;
  try {
    const { data } = await api.post('/admin/users', payload);
    users.value.unshift(data.user);
    success.value = `${data.user.name} can now sign in with the temporary password.`;
    showCreateUser.value = false;
    newUser.value = emptyNewUser();
    await nextTick();
    addUserButton.value?.focus();
  } catch (e) {
    createError.value = e.response?.data?.error || 'Could not create the user.';
    newUser.value.password = '';
  } finally {
    creatingUser.value = false;
  }
}



async function toggleBlock(user) {

  try {

    const { data } = await api.put(`/admin/users/${user.id}`, {

      is_blocked: user.is_blocked ? 0 : 1,

    });

    const idx = users.value.findIndex((u) => u.id === user.id);

    users.value[idx] = data.user;

  } catch (e) {

    error.value = e.response?.data?.error || 'Could not update the user.';

  }

}



async function setRole(user, role) {
  try {
    const { data } = await api.put(`/admin/users/${user.id}`, { role });
    const idx = users.value.findIndex((u) => u.id === user.id);
    if (idx >= 0) users.value[idx] = data.user;
    error.value = '';
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not update the user role.';
  }
}



async function setPlan(user, plan) {

  try {

    const { data } = await api.put(`/admin/users/${user.id}`, { account_type: plan });

    const idx = users.value.findIndex((u) => u.id === user.id);

    users.value[idx] = data.user;

    error.value = '';

  } catch (e) {

    error.value = e.response?.data?.error || 'Could not update the plan.';

  }

}



async function grantPremium(user) {
  try {
    await api.post(`/admin/users/${user.id}/premium`, { months: 12 });
    const idx = users.value.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      users.value[idx] = { ...users.value[idx], plan: 'paid', account_type: 'paid', has_premium: true };
    }
    error.value = '';
    alert(`Premium enabled for ${user.name}.`);
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not enable Premium.';
  }
}

async function loadUsers() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/admin/users');
    users.value = data.users || [];
  } catch (e) {
    users.value = [];
    error.value = e.response?.data?.error || 'Could not load users. Please try again.';
  } finally {
    loading.value = false;
  }
}

async function purgeTestUsers() {
  const nonAdmins = users.value.filter((u) => u.role !== 'admin');
  if (!nonAdmins.length) {
    alert('There are no test users to remove.');
    return;
  }
  const names = nonAdmins.map((u) => u.email).join('\n• ');
  if (!confirm(`Remove ${nonAdmins.length} test user(s)?\n\nAdmin accounts will be kept.\n\n• ${names}`)) return;
  try {
    const { data } = await api.post('/admin/purge-test-users');
    await loadUsers();
    error.value = '';
    alert(data.message);
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not remove test users.';
  }
}

</script>



<template>

  <div class="admin-users-page">

    <div class="admin-page-header d-flex flex-wrap justify-content-between align-items-end gap-3">

      <div>

        <h1>Users</h1>

        <p>Manage accounts, plans, and permissions</p>

      </div>

      <div class="d-flex flex-wrap gap-2">
        <button ref="addUserButton" type="button" class="btn btn-primary btn-sm" @click="openCreateUser">
          <i class="bi bi-person-plus me-1"></i>Add user
        </button>
        <button type="button" class="btn btn-outline-danger btn-sm" @click="purgeTestUsers">
          <i class="bi bi-trash me-1"></i>Delete test users (keep admins)
        </button>
        <RouterLink to="/admin" class="btn btn-outline-primary btn-sm">
          <i class="bi bi-download me-1"></i>View downloads in the Dashboard
        </RouterLink>
      </div>

    </div>



    <div v-if="error" class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn btn-sm btn-outline-dark" @click="loadUsers">Retry</button>
    </div>
    <div v-if="success" class="alert alert-success" role="status">
      <i class="bi bi-check-circle me-1"></i>{{ success }}
    </div>



    <div v-if="loading" class="admin-card text-center py-5" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <p class="mb-0 mt-2">Loading users…</p>
    </div>

    <template v-else>
    <div class="admin-card mb-3">

      <div class="admin-card-body py-3">

        <div class="row g-2 align-items-center">

          <div class="col-md-8 col-lg-6">

            <div class="input-group">

              <span class="input-group-text"><i class="bi bi-search"></i></span>

              <input

                v-model="searchQuery"

                type="search"

                class="form-control"

                aria-label="Search users"

                placeholder="Search by name, email, or plan..."

              />

            </div>

          </div>

          <div class="col-md-4 col-lg-6 text-md-end">

            <small class="text-muted">{{ filteredUsers.length }} of {{ users.length }} user(s)</small>

          </div>

        </div>

      </div>

    </div>



    <div class="admin-card admin-users-card">

      <div class="table-responsive">

        <table class="table admin-table admin-users-table mb-0">

          <thead>

            <tr>

              <th>Name</th>

              <th>Email</th>

              <th class="col-narrow">Role</th>

              <th class="col-narrow">Plan</th>

              <th class="col-narrow">Source</th>

              <th class="col-narrow">Account</th>

              <th class="col-date">Sign-up date</th>

              <th class="col-actions" scope="col"><span class="visually-hidden">Actions</span></th>

            </tr>

          </thead>

          <tbody>

            <tr v-for="u in filteredUsers" :key="u.id">

              <td class="col-name">

                <span class="fw-semibold">{{ u.name }}</span>

              </td>

              <td class="col-email" :title="u.email">{{ u.email }}</td>

              <td class="col-narrow">

                <select

                  :value="u.role"

                  class="form-select form-select-sm admin-cell-select"

                  :aria-label="`Role for ${u.name}`"

                  @change="setRole(u, $event.target.value)"

                >

                  <option value="user">User</option>

                  <option value="admin">Admin</option>

                </select>

              </td>

              <td class="col-narrow">

                <select

                  :value="u.plan || 'free'"

                  :class="['form-select', 'form-select-sm', 'admin-cell-select', planSelectClass(u.plan)]"

                  :aria-label="`Plan for ${u.name}`"

                  @change="setPlan(u, $event.target.value)"

                >

                  <option v-for="opt in planOptions" :key="opt.value" :value="opt.value">

                    {{ opt.label }}

                  </option>

                </select>

              </td>

              <td class="col-narrow">

                <span

                  class="badge source-badge"

                  :class="sourceClass(u)"

                  :title="sourceDetail(u)"

                >

                  {{ sourceLabel(u) }}

                </span>

              </td>

              <td class="col-narrow">

                <span class="badge account-badge" :class="u.is_blocked ? 'account-badge-blocked' : 'account-badge-active'">

                  {{ u.is_blocked ? 'Blocked' : 'Active' }}

                </span>

              </td>

              <td class="col-date"><small class="text-muted">{{ formatDate(u.created_at) }}</small></td>

              <td class="col-actions">

                <div class="admin-actions">

                  <button

                    v-if="u.role !== 'admin' && u.plan !== 'paid'"

                    type="button"

                    class="btn btn-sm btn-outline-primary admin-action-btn"

                    title="Activate Premium for 12 months"

                    :aria-label="`Activate Premium for ${u.name}`"

                    @click="grantPremium(u)"

                  >

                    <i class="bi bi-star"></i>

                  </button>

                  <button

                    type="button"

                    class="btn btn-sm admin-action-btn"

                    :class="u.is_blocked ? 'btn-outline-success' : 'btn-outline-warning'"

                    :title="u.is_blocked ? 'Unblock user' : 'Block user'"

                    :aria-label="u.is_blocked ? `Unblock ${u.name}` : `Block ${u.name}`"

                    @click="toggleBlock(u)"

                  >

                    <i :class="u.is_blocked ? 'bi bi-unlock' : 'bi bi-lock'"></i>

                  </button>

                </div>

              </td>

            </tr>

            <tr v-if="!filteredUsers.length">

              <td colspan="8" class="text-center text-muted py-4">No users found.</td>

            </tr>

          </tbody>

        </table>

      </div>

    </div>

    </template>

    <Teleport to="body">
      <div
        v-if="showCreateUser"
        class="admin-user-modal-backdrop"
        role="presentation"
        @click.self="closeCreateUser"
        @keydown="onCreateDialogKeydown"
      >
        <section
          ref="createUserModal"
          class="admin-user-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="createUserTitle"
        >
          <header class="admin-user-modal-header">
            <div>
              <h2 id="createUserTitle" class="h5 mb-1">Add user</h2>
              <p class="text-muted small mb-0">Create an account that is ready to use immediately.</p>
            </div>
            <button type="button" class="btn-close" aria-label="Close" @click="closeCreateUser"></button>
          </header>

          <form @submit.prevent="createUser">
            <div class="admin-user-modal-body">
              <div v-if="createError" class="alert alert-danger py-2 small" role="alert">{{ createError }}</div>

              <div class="mb-3">
                <label for="new-user-name" class="form-label">Name</label>
                <input id="new-user-name" v-model="newUser.name" class="form-control" type="text" required autofocus />
              </div>

              <div class="mb-3">
                <label for="new-user-email" class="form-label">Email</label>
                <input id="new-user-email" v-model="newUser.email" class="form-control" type="email" required autocomplete="off" />
              </div>

              <div class="mb-3">
                <label for="new-user-password" class="form-label">Temporary password</label>
                <div class="input-group">
                  <input
                    id="new-user-password"
                    v-model="newUser.password"
                    class="form-control"
                    :type="showPassword ? 'text' : 'password'"
                    minlength="6"
                    required
                    autocomplete="new-password"
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    :aria-pressed="showPassword"
                    @click="showPassword = !showPassword"
                  >
                    <i :class="showPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                  </button>
                </div>
                <div class="form-text">At least 6 characters. Share it with the user securely.</div>
              </div>

              <div class="row g-3">
                <div class="col-sm-6">
                  <label for="new-user-role" class="form-label">Role</label>
                  <select id="new-user-role" v-model="newUser.role" class="form-select">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div class="col-sm-6">
                  <label for="new-user-plan" class="form-label">Plan</label>
                  <select id="new-user-plan" v-model="newUser.account_type" class="form-select">
                    <option v-for="option in planOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <footer class="admin-user-modal-footer">
              <button type="button" class="btn btn-outline-secondary" :disabled="creatingUser" @click="closeCreateUser">
                Cancel
              </button>
              <button type="submit" class="btn btn-primary" :disabled="creatingUser">
                <span v-if="creatingUser" class="spinner-border spinner-border-sm me-2"></span>
                {{ creatingUser ? 'Creating user...' : 'Create user' }}
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>

  </div>

</template>

<style scoped>
.admin-user-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(15, 23, 42, 0.64);
  backdrop-filter: blur(3px);
}

.admin-user-modal {
  width: min(100%, 560px);
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.3);
}

.admin-user-modal-header,
.admin-user-modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.25rem;
}

.admin-user-modal-header {
  border-bottom: 1px solid #e2e8f0;
}

.admin-user-modal-body {
  padding: 1.25rem;
}

.admin-user-modal-footer {
  justify-content: flex-end;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}
</style>


