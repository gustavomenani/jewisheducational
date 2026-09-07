<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import api from '@/api';
import { buildCategoryTree, categoryDepth } from '@/utils/categoryTree';

const categories = ref([]);
const error = ref('');
const loading = ref(true);
const togglingId = ref(null);
const reorderingId = ref(null);
const draggingId = ref(null);
const dragOverId = ref(null);

// Match the public menu order: buildCategoryTree sorts each level by
// sort_order (then name), so the admin list mirrors what visitors see.
const sortedCategories = computed(() => {
  const flat = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      flat.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(buildCategoryTree(categories.value));
  return flat;
});

onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/categories', { params: { include_hidden: 'true' } });
    categories.value = data.categories || [];
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not load categories.';
  } finally {
    loading.value = false;
  }
}

async function remove(id) {
  if (!confirm('Delete category?')) return;
  error.value = '';
  try {
    await api.delete(`/categories/${id}`);
    await load();
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not delete the category.';
  }
}

function isHidden(cat) {
  return cat.nav_visible === false || cat.nav_visible === 0 || cat.nav_visible === '0';
}

// Alterna a visibilidade no menu direto pela tabela, sem abrir a edição.
async function toggleVisible(cat) {
  togglingId.value = cat.id;
  error.value = '';
  try {
    const { data } = await api.put(`/categories/${cat.id}`, { nav_visible: isHidden(cat) ? 1 : 0 });
    const idx = categories.value.findIndex((c) => c.id === cat.id);
    if (idx >= 0) {
      categories.value[idx] = { ...categories.value[idx], nav_visible: data.category.nav_visible };
    }
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not change visibility.';
  } finally {
    togglingId.value = null;
  }
}

function rowDepth(cat) {
  return categoryDepth(cat, categories.value);
}

// --- Reordenar arrastando (apenas entre irmãos do mesmo assunto pai) ---
function sameParent(a, b) {
  return String(a.parent_id || '') === String(b.parent_id || '');
}

function siblingsOf(parentId) {
  return [...categories.value]
    .filter((c) => String(c.parent_id || '') === String(parentId || ''))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
}

function onDragStart(cat) {
  draggingId.value = cat.id;
}

function onDragOver(cat) {
  const dragged = categories.value.find((c) => c.id === draggingId.value);
  // Só destaca alvos válidos: outro item irmão do mesmo pai.
  dragOverId.value = dragged && cat.id !== dragged.id && sameParent(dragged, cat) ? cat.id : null;
}

function resetDrag() {
  draggingId.value = null;
  dragOverId.value = null;
}

function siblingPosition(cat) {
  return siblingsOf(cat.parent_id).findIndex((item) => item.id === cat.id);
}

async function saveSiblingOrder(sibs) {
  const updates = [];
  sibs.forEach((c, i) => {
    const ref = categories.value.find((x) => x.id === c.id);
    if (ref && ref.sort_order !== i) {
      ref.sort_order = i;
      updates.push({ id: c.id, sort_order: i });
    }
  });

  if (!updates.length) return;
  reorderingId.value = updates[0].id;
  try {
    await Promise.all(updates.map((u) => api.put(`/categories/${u.id}`, { sort_order: u.sort_order })));
  } catch (e) {
    error.value = e.response?.data?.error || 'Could not save the new order.';
    await load();
  } finally {
    reorderingId.value = null;
  }
}

async function moveCategory(cat, direction) {
  if (reorderingId.value !== null) return;
  const sibs = siblingsOf(cat.parent_id);
  const index = sibs.findIndex((item) => item.id === cat.id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sibs.length) return;
  [sibs[index], sibs[target]] = [sibs[target], sibs[index]];
  await saveSiblingOrder(sibs);
}

function onReorderKeydown(event, cat) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    moveCategory(cat, event.key === 'ArrowUp' ? -1 : 1);
  }
}

async function onDrop(target) {
  const draggedId = draggingId.value;
  const dragged = categories.value.find((c) => c.id === draggedId);
  resetDrag();
  if (!dragged || draggedId === target.id) return;

  if (!sameParent(dragged, target)) {
    error.value = 'You can only reorder within the same parent subject.';
    return;
  }

  const sibs = siblingsOf(dragged.parent_id);
  const from = sibs.findIndex((c) => c.id === draggedId);
  const to = sibs.findIndex((c) => c.id === target.id);
  if (from < 0 || to < 0) return;

  sibs.splice(to, 0, sibs.splice(from, 1)[0]);

  await saveSiblingOrder(sibs);
}
</script>

<template>
  <div>
    <div class="admin-page-header d-flex flex-wrap justify-content-between align-items-end gap-3">
      <div>
        <h1>Categories / Subjects</h1>
        <p>
          Build the top navigation tree: main subject → subtopic → nested subtopic (with unlimited levels).
          The site menu updates automatically when you save here or publish materials.
        </p>
      </div>
      <RouterLink to="/admin/categories/new" class="btn btn-primary">
        <i class="bi bi-plus-lg me-1"></i>New category
      </RouterLink>
    </div>

    <div v-if="error" class="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
      <span>{{ error }}</span>
      <button type="button" class="btn btn-sm btn-outline-dark" @click="load">Retry</button>
    </div>

    <div class="alert alert-info py-2 small">
      <strong>How it works:</strong>
      subjects without a parent appear in the top bar;
      <strong>drag</strong> the <i class="bi bi-grip-vertical"></i> handle to change the navigation order (between items with the same parent);
      use the <i class="bi bi-eye"></i> button to show or hide an item without deleting it.
      Subjects with published resources appear automatically when they are not empty.
    </div>

    <div v-if="loading" class="admin-card text-center py-5" role="status">
      <div class="spinner-border text-primary" aria-hidden="true"></div>
      <p class="mb-0 mt-2">Loading categories…</p>
    </div>

    <div v-else class="admin-card">
      <table class="table admin-table mb-0">
        <thead>
          <tr>
            <th scope="col" style="width: 2.5rem"><span class="visually-hidden">Reorder</span></th>
            <th>Subject</th>
            <th>Slug</th>
            <th>Materials</th>
            <th scope="col"><span class="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!sortedCategories.length">
            <td colspan="5" class="text-center text-muted py-4">
              No categories yet.
              <RouterLink to="/admin/categories/new">Create the first one</RouterLink>
            </td>
          </tr>
          <tr
            v-for="cat in sortedCategories"
            :key="cat.id"
            :class="{ 'cat-row-dragging': draggingId === cat.id, 'cat-row-over': dragOverId === cat.id }"
            @dragover.prevent="onDragOver(cat)"
            @drop.prevent="onDrop(cat)"
            @dragend="resetDrag"
          >
            <td class="text-center">
              <i
                class="bi bi-grip-vertical cat-drag-handle"
                draggable="true"
                tabindex="0"
                role="button"
                :aria-label="`Reorder ${cat.name}`"
                title="Drag to reorder"
                @dragstart="onDragStart(cat)"
                @keydown="onReorderKeydown($event, cat)"
              ></i>
            </td>
            <td>
              <span :style="{ paddingLeft: `${rowDepth(cat) * 1.75}rem` }" class="d-inline-block">
                <span v-if="rowDepth(cat)" class="text-muted me-1">↳</span>
                {{ cat.name }}
              </span>
            </td>
            <td><code>{{ cat.slug }}</code></td>
            <td>{{ cat.resource_count || 0 }}</td>
            <td class="text-end">
              <div class="admin-actions">
                <button
                  type="button"
                  class="btn btn-sm admin-action-btn"
                  :disabled="reorderingId !== null || siblingPosition(cat) <= 0"
                  title="Move subject up"
                  aria-label="Move subject up"
                  @click="moveCategory(cat, -1)"
                >
                  <i class="bi bi-chevron-up"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-sm admin-action-btn"
                  :disabled="reorderingId !== null || siblingPosition(cat) < 0 || siblingPosition(cat) >= siblingsOf(cat.parent_id).length - 1"
                  title="Move subject down"
                  aria-label="Move subject down"
                  @click="moveCategory(cat, 1)"
                >
                  <i class="bi bi-chevron-down"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-sm admin-action-btn"
                  :class="isHidden(cat) ? 'btn-outline-secondary' : 'btn-outline-success'"
                  :disabled="togglingId === cat.id"
                  :title="isHidden(cat) ? 'Hidden from visitor navigation and lists — click to show' : 'Visible to visitors — click to hide from navigation and lists'"
                  :aria-label="isHidden(cat) ? 'Show subject to visitors' : 'Hide subject from visitor navigation and lists'"
                  @click="toggleVisible(cat)"
                >
                  <i class="bi" :class="isHidden(cat) ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
                <RouterLink
                  :to="`/admin/categories/${cat.id}`"
                  class="btn btn-sm btn-outline-primary admin-action-btn"
                  title="Edit"
                  aria-label="Edit subject"
                >
                  <i class="bi bi-pencil-square"></i>
                </RouterLink>
                <button type="button" class="btn btn-sm btn-outline-danger admin-action-btn" title="Delete" aria-label="Delete subject" @click="remove(cat.id)">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cat-drag-handle {
  cursor: grab;
  color: #94a3b8;
}
.cat-drag-handle:active {
  cursor: grabbing;
}
.cat-row-dragging {
  opacity: 0.45;
}
.cat-row-over td {
  box-shadow: inset 0 2px 0 0 var(--bs-primary, #3bafb8);
}
</style>
