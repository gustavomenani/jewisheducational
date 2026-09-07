<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import api from '@/api';
import { buildCategoryTree, getDescendantIds } from '@/utils/categoryTree';
import CategorySearchSelect from '@/components/admin/CategorySearchSelect.vue';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => route.params.id && route.params.id !== 'novo');

const categories = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const form = ref({
  name: '',
  description: '',
  sort_order: 0,
  parent_id: '',
  nav_visible: true,
});

// Segue a mesma ordem definida em Categories (sort_order), não alfabética —
// assim o dropdown bate com a ordem que o admin arrasta/reordena lá.
const parentOptions = computed(() => {
  const blocked = new Set();
  if (isEdit.value) {
    const id = Number(route.params.id);
    blocked.add(id);
    getDescendantIds(id, categories.value).forEach((childId) => blocked.add(childId));
  }
  const tree = buildCategoryTree(categories.value);
  const options = [];
  function walk(nodes, depth, prefixParts) {
    for (const node of nodes) {
      const parts = [...prefixParts, node.name];
      if (!blocked.has(node.id)) {
        options.push({ id: node.id, depth, pathLabel: parts.join(' › ') });
      }
      if (node.children?.length) walk(node.children, depth + 1, parts);
    }
  }
  walk(tree, 0, []);
  return options;
});

const parentSearchOptions = computed(() =>
  parentOptions.value.map((p) => {
    const parts = p.pathLabel.split(' › ');
    return {
      id: p.id,
      label: parts[parts.length - 1],
      parent: parts.length > 1 ? parts[parts.length - 2] : '',
      depth: p.depth,
      path: p.pathLabel,
    };
  })
);

onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/categories', { params: { include_hidden: 'true' } });
    categories.value = data.categories;

    if (isEdit.value) {
      const cat = categories.value.find((c) => String(c.id) === String(route.params.id));
      if (!cat) {
        router.replace('/admin/categories');
        return;
      }
      form.value = {
        name: cat.name,
        description: cat.description || '',
        sort_order: cat.sort_order ?? 0,
        parent_id: cat.parent_id || '',
        nav_visible: cat.nav_visible !== false && cat.nav_visible !== 0 && cat.nav_visible !== '0',
      };
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not load the category.';
  } finally {
    loading.value = false;
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    const payload = {
      ...form.value,
      parent_id: form.value.parent_id || null,
      nav_visible: form.value.nav_visible ? 1 : 0,
    };
    if (isEdit.value) {
      await api.put(`/categories/${route.params.id}`, payload);
    } else {
      await api.post('/categories', payload);
    }
    router.push('/admin/categories');
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not save the category.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div>
    <div class="admin-page-header">
      <nav aria-label="breadcrumb" class="mb-2">
        <ol class="breadcrumb mb-0 small">
          <li class="breadcrumb-item">
            <RouterLink to="/admin/categories">Categories</RouterLink>
          </li>
          <li class="breadcrumb-item active" aria-current="page">
            {{ isEdit ? 'Edit' : 'New category' }}
          </li>
        </ol>
      </nav>
      <h1>{{ isEdit ? 'Edit category' : 'New category' }}</h1>
      <p>
        Define the subject, menu hierarchy, and visibility.
        Main subjects appear in the top navigation; subtopics can have unlimited levels.
      </p>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border text-primary"></div>
    </div>

    <form v-else class="admin-card" @submit.prevent="save">
      <div class="admin-card-body">
        <div class="row g-3">
          <div class="col-md-6">
            <label class="admin-form-label">Name *</label>
            <input v-model="form.name" class="form-control" placeholder="Example: Hebrew" required />
          </div>
          <div class="col-md-6">
            <label class="admin-form-label">Parent (subtopic of…)</label>
            <CategorySearchSelect
              v-model="form.parent_id"
              :options="parentSearchOptions"
              empty-label="— Main subject (top menu) —"
              placeholder="Search category..."
            />
            <div class="form-text">Leave blank to display it as a subject in the top navigation.</div>
          </div>
          <div class="col-12">
            <label class="admin-form-label">Description</label>
            <input v-model="form.description" class="form-control" placeholder="Optional — internal use or SEO" />
          </div>
          <div class="col-12">
            <div class="form-check form-switch">
              <input id="nav_visible" v-model="form.nav_visible" class="form-check-input" type="checkbox" />
              <label class="form-check-label" for="nav_visible">Show in visitor navigation and category lists</label>
            </div>
            <div class="form-text">
              Turn this off to hide this category and its subtopics from menus, sidebars, filters, and topic lists. Its resources stay saved.
            </div>
          </div>
        </div>

        <div class="d-flex flex-wrap gap-2 mt-4 pt-3 border-top">
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            <i v-else class="bi bi-check-lg me-1"></i>
            {{ isEdit ? 'Update' : 'Create category' }}
          </button>
          <RouterLink to="/admin/categories" class="btn btn-outline-secondary">
            Cancel
          </RouterLink>
        </div>
      </div>
    </form>
  </div>
</template>
