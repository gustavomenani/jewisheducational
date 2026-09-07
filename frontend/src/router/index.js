import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores';
import { trackPageView } from '@/analytics';
import { legacyPathRedirect } from './legacyRoutes.js';
import { applyRouteSeo } from '@/utils/seo';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layouts/PublicLayout.vue'),
      children: [
        { path: '', name: 'home', component: () => import('@/views/HomeView.vue') },
        { path: 'library', name: 'library', component: () => import('@/views/LibraryView.vue') },
        { path: 'library/category/:slug', name: 'category', component: () => import('@/views/LibraryView.vue') },
        { path: 'resource/:slug', name: 'resource', component: () => import('@/views/ResourceView.vue') },
        { path: 'resource/:slug/download/:fileId', name: 'download', component: () => import('@/views/DownloadView.vue'), meta: { auth: true } },
        { path: 'login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
        { path: 'sign-up', name: 'register', component: () => import('@/views/RegisterView.vue'), meta: { guest: true } },
        { path: 'forgot-password', name: 'forgot-password', component: () => import('@/views/ForgotPasswordView.vue'), meta: { guest: true } },
        { path: 'reset-password/:token', name: 'reset-password', component: () => import('@/views/ResetPasswordView.vue'), meta: { guest: true } },
        { path: 'my-account', name: 'account', component: () => import('@/views/AccountView.vue'), meta: { auth: true } },
        { path: 'profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { auth: true } },
        { path: 'my-list', name: 'favorites', component: () => import('@/views/FavoritesView.vue'), meta: { auth: true } },
      ],
    },
    {
      path: '/resource/:slug/present/:fileId',
      name: 'presentation-play',
      component: () => import('@/views/PresentationView.vue'),
      meta: { auth: true },
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { auth: true, admin: true },
      children: [
        { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/DashboardView.vue') },
        { path: 'materials', name: 'admin-materials', component: () => import('@/views/admin/MaterialsView.vue') },
        { path: 'materials/new', name: 'admin-material-new', component: () => import('@/views/admin/MaterialFormView.vue') },
        { path: 'materials/:id', name: 'admin-material-edit', component: () => import('@/views/admin/MaterialFormView.vue') },
        { path: 'categories', name: 'admin-categories', component: () => import('@/views/admin/CategoriesView.vue') },
        { path: 'categories/new', name: 'admin-category-new', component: () => import('@/views/admin/CategoryFormView.vue') },
        { path: 'categories/:id', name: 'admin-category-edit', component: () => import('@/views/admin/CategoryFormView.vue') },
        { path: 'users', name: 'admin-users', component: () => import('@/views/admin/UsersView.vue') },
        { path: 'contact-messages', name: 'admin-contact-messages', component: () => import('@/views/admin/ContactMessagesView.vue') },
        { path: 'appearance', name: 'admin-appearance', component: () => import('@/views/admin/AppearanceView.vue') },
        { path: 'payments', name: 'admin-payments', component: () => import('@/views/admin/PaymentsView.vue') },
        { path: 'plans', name: 'admin-plans', component: () => import('@/views/admin/PlansView.vue') },
        { path: 'integrations', name: 'admin-integrations', component: () => import('@/views/admin/IntegrationsView.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/SettingsView.vue') },
      ],
    },
  ],
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  const legacyPath = legacyPathRedirect(to.path);
  if (legacyPath) return { path: legacyPath, query: to.query, hash: to.hash, replace: true };

  const auth = useAuthStore();

  if (to.meta.auth && !auth.isLoggedIn) return { name: 'login', query: { redirect: to.fullPath } };
  if (to.meta.admin && !auth.isAdmin) return { name: 'home' };
  if (to.meta.guest && auth.isLoggedIn) return { name: 'home' };
});

router.afterEach((to) => {
  applyRouteSeo(to);
  trackPageView(to.fullPath, document.title);
});

export default router;
