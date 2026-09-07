<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const pages = [
  {
    id: 'home',
    label: 'Home',
    to: '/',
    icon: 'bi-house',
    description: 'Hero, cards, headings, guide, contact content, images, and sections.',
  },
  {
    id: 'library',
    label: 'Library',
    to: '/library',
    icon: 'bi-collection',
    description: 'Search, filter, shortcut, result, and empty-state presentation text.',
  },
  {
    id: 'global',
    label: 'Header & Footer',
    to: '/',
    icon: 'bi-window',
    description: 'Brand, navigation labels, grade choices, footer copy, and social links.',
  },
  {
    id: 'resource',
    label: 'Resource Page',
    to: '/',
    icon: 'bi-file-earmark-text',
    description: 'Breadcrumbs, preview, download, favorite labels, and template copy.',
  },
  {
    id: 'download',
    label: 'Download Page',
    to: '/',
    icon: 'bi-download',
    description: 'Download breadcrumbs, guidance, button labels, and error actions.',
  },
];

function openEditor(page = pages[0]) {
  router.push({ path: page.to, query: { edit: '1', area: page.id } });
}
</script>

<template>
  <div>
    <div class="admin-page-header d-flex flex-wrap justify-content-between align-items-start gap-3">
      <div>
        <h1>Visual editor</h1>
        <p>Edit the site visually with a simple click, add content, preview, and publish workflow.</p>
      </div>
      <a href="/" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-box-arrow-up-right me-1"></i>View Site
      </a>
    </div>

    <div class="card border-0 shadow-sm my-3">
      <div class="card-body text-center py-5">
        <i class="bi bi-pencil-square text-primary" style="font-size: 3rem"></i>
        <h2 class="h5 mt-3 mb-2">Edit the site without touching code</h2>
        <p class="text-muted mb-4 mx-auto" style="max-width: 600px">
          Click what you want to change, add responsive text and image sections, check the mobile
          preview, and publish only when everything is ready.
        </p>
        <button class="btn btn-primary btn-lg" @click="openEditor(pages[0])">
          <i class="bi bi-pencil-square me-2"></i>Edit site
        </button>
      </div>
    </div>

    <div class="row g-3 my-2" role="region" aria-label="How the editor works">
      <div class="col-md-4"><div class="card border-0 bg-light h-100"><div class="card-body"><strong>1. Select</strong><p class="small text-muted mb-0 mt-1">Click outlined content directly on the page.</p></div></div></div>
      <div class="col-md-4"><div class="card border-0 bg-light h-100"><div class="card-body"><strong>2. Customize</strong><p class="small text-muted mb-0 mt-1">Edit it or use Add content for images and text.</p></div></div></div>
      <div class="col-md-4"><div class="card border-0 bg-light h-100"><div class="card-body"><strong>3. Publish</strong><p class="small text-muted mb-0 mt-1">Preview desktop and mobile before going live.</p></div></div></div>
    </div>

    <h3 class="h6 text-uppercase text-muted mt-4 mb-2">Choose an editing area</h3>
    <div class="editor-area-grid">
      <article
        v-for="page in pages"
        :key="page.id"
        class="card border-0 shadow-sm editor-area-card"
      >
        <div class="card-body d-flex flex-column">
          <i :class="['bi', page.icon, 'editor-area-icon']"></i>
          <h2 class="h5 mt-3">{{ page.label }}</h2>
          <p class="text-muted small flex-grow-1">{{ page.description }}</p>
          <button type="button" class="btn btn-outline-primary" @click="openEditor(page)">
            <i class="bi bi-pencil-square me-1"></i>Edit {{ page.label }}
          </button>
        </div>
      </article>
    </div>

    <div class="alert alert-light border mt-4 small text-muted mb-0">
      <i class="bi bi-info-circle me-1"></i>
      Current colors, fonts, content, and published settings remain active until you publish a new
      version from the editor.
    </div>
  </div>
</template>

<style scoped>
.editor-area-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.editor-area-card {
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.editor-area-card:hover {
  transform: translateY(-2px);
}
.editor-area-icon {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(59, 175, 184, 0.12);
  color: var(--edu-teal, #3bafb8);
  font-size: 1.3rem;
}
</style>
