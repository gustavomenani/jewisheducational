<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

function onLogout() {
  auth.logout();
  router.replace('/login');
}

const sidebarCollapsed = ref(false);
const mobileOpen = ref(false);

const links = [
  { to: '/admin', icon: 'bi-speedometer2', label: 'Dashboard', end: true },
  { to: '/admin/materials', icon: 'bi-file-earmark-text', label: 'Materials' },
  { to: '/admin/categories', icon: 'bi-tags', label: 'Categories' },
  { to: '/admin/users', icon: 'bi-people', label: 'Users' },
  { to: '/admin/contact-messages', icon: 'bi-envelope', label: 'Contact Messages' },
  { to: '/admin/appearance', icon: 'bi-palette', label: 'Appearance' },
  { to: '/admin/payments', icon: 'bi-credit-card', label: 'Payments' },
  { to: '/admin/plans', icon: 'bi-cash-coin', label: 'Plans' },
  { to: '/admin/integrations', icon: 'bi-share', label: 'Integrations' },
  { to: '/admin/settings', icon: 'bi-sliders', label: 'Settings' },
];

onMounted(() => {
  sidebarCollapsed.value = localStorage.getItem('admin-sidebar-collapsed') === '1';
});

watch(sidebarCollapsed, (value) => {
  localStorage.setItem('admin-sidebar-collapsed', value ? '1' : '0');
});

watch(() => route.path, () => {
  mobileOpen.value = false;
});

function toggleSidebar() {
  if (window.innerWidth < 992) {
    mobileOpen.value = !mobileOpen.value;
  } else {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }
}

function onKeydown(event) {
  if (event.key !== 'Escape' || !mobileOpen.value) return;
  mobileOpen.value = false;
  nextTick(() => document.querySelector('.admin-toggle')?.focus());
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div
    class="admin-app"
    :class="{
      'admin-sidebar-collapsed': sidebarCollapsed,
      'admin-sidebar-mobile-open': mobileOpen,
    }"
  >
    <div class="admin-backdrop" @click="mobileOpen = false"></div>

    <aside id="admin-sidebar" class="admin-sidebar">
      <div class="admin-sidebar-brand">
        <RouterLink to="/admin" class="brand-link">
          <span class="brand-icon"><i class="bi bi-grid-1x2-fill"></i></span>
          <span class="brand-text">Admin Panel</span>
        </RouterLink>
      </div>

      <nav class="admin-sidebar-nav">
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          :end="link.end"
          class="admin-nav-link"
          :title="sidebarCollapsed ? link.label : undefined"
        >
          <i :class="link.icon"></i>
          <span class="nav-label">{{ link.label }}</span>
        </RouterLink>
      </nav>

      <div class="admin-sidebar-footer">
        <RouterLink to="/" class="admin-nav-link">
          <i class="bi bi-box-arrow-up-right"></i>
          <span class="nav-label">View Site</span>
        </RouterLink>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-header">
        <div class="admin-header-left">
          <button
            type="button"
            class="admin-toggle"
            aria-label="Toggle menu"
            aria-controls="admin-sidebar"
            :aria-expanded="mobileOpen"
            @click="toggleSidebar"
          >
            <i class="bi" :class="mobileOpen || !sidebarCollapsed ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar'"></i>
          </button>
          <div class="admin-header-title d-none d-md-block">
            <small class="text-muted">Administration</small>
          </div>
        </div>
        <div class="admin-header-actions">
          <span class="admin-user-badge d-none d-sm-inline">
            <i class="bi bi-person-circle me-1"></i>{{ auth.user?.name === 'Administrador' ? 'Administrator' : auth.user?.name }}
          </span>
          <button type="button" class="btn btn-admin-outline btn-sm" @click="onLogout">
            Log out
          </button>
        </div>
      </header>

      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
</style>
