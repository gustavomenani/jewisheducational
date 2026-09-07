<script setup>
import { ref, inject, computed } from 'vue';
import { RouterLink } from 'vue-router';

defineOptions({ name: 'AdminCategoryFolder' });

const props = defineProps({
  node: { type: Object, required: true },
  resourcesByCategory: { type: Map, required: true },
  depth: { type: Number, default: 0 },
});

const actions = inject('materialActions');

const expanded = ref(true);
const materials = computed(() => props.resourcesByCategory.get(Number(props.node.id)) || []);

function toggle() {
  expanded.value = !expanded.value;
}

// Data de upload do material (created_at). Vem como Date (Firestore) ou string
// ISO/datetime (MySQL) — new Date() cobre os dois. Formato pt-BR curto.
function formatUploadDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR');
}
</script>

<template>
  <div class="admin-folder">
    <button
      type="button"
      class="admin-folder-header"
      :aria-expanded="expanded"
      :aria-controls="`admin-folder-body-${node.id}`"
      @click="toggle"
    >
      <i class="bi" :class="expanded ? 'bi-folder2-open' : 'bi-folder2'"></i>
      <span class="admin-folder-name">{{ node.name }}</span>
      <span v-if="materials.length" class="badge text-bg-light admin-folder-count">{{ materials.length }}</span>
      <i class="bi admin-folder-chevron" :class="expanded ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
    </button>

    <div :id="`admin-folder-body-${node.id}`" v-show="expanded" class="admin-folder-body">
      <div v-for="r in materials" :key="r.id" class="admin-folder-material">
        <span class="admin-folder-material-title">{{ r.title }}</span>
        <span class="badge" :class="r.is_published ? 'bg-success' : 'bg-secondary'">
          {{ r.is_published ? 'Published' : 'Draft' }}
        </span>
        <span class="badge text-bg-light">{{ actions.limitLabel(r) }}</span>
        <span class="admin-folder-material-downloads" title="Downloads">
          <i class="bi bi-download me-1"></i>{{ r.download_count }}
        </span>
        <span
          v-if="formatUploadDate(r.created_at)"
          class="admin-folder-material-date"
          title="Data de upload"
        >
          <i class="bi bi-calendar3 me-1"></i>{{ formatUploadDate(r.created_at) }}
        </span>
        <div class="admin-actions">
          <button
            type="button"
            class="btn btn-sm admin-action-btn"
            :class="r.is_published ? 'btn-outline-secondary' : 'btn-success'"
            :disabled="actions.publishing.value === r.id"
            :title="r.is_published ? 'Unpublish (return to draft)' : 'Publish now'"
            :aria-label="r.is_published ? 'Unpublish material' : 'Publish material'"
            @click="actions.togglePublish(r)"
          >
            <span v-if="actions.publishing.value === r.id" class="spinner-border spinner-border-sm"></span>
            <i v-else :class="r.is_published ? 'bi bi-eye-slash' : 'bi bi-globe'"></i>
          </button>
          <RouterLink
            :to="`/admin/materials/${r.id}`"
            class="btn btn-sm btn-outline-primary admin-action-btn"
            title="Edit material"
            aria-label="Edit material"
          >
            <i class="bi bi-pencil-square"></i>
          </RouterLink>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary admin-action-btn"
            :disabled="actions.duplicating.value === r.id"
            title="Duplicate material"
            aria-label="Duplicate material"
            @click="actions.duplicate(r)"
          >
            <span v-if="actions.duplicating.value === r.id" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-copy"></i>
          </button>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger admin-action-btn"
            :disabled="actions.deleting.value === r.id"
            title="Delete material"
            aria-label="Delete material"
            @click="actions.remove(r.id)"
          >
            <span v-if="actions.deleting.value === r.id" class="spinner-border spinner-border-sm"></span>
            <i v-else class="bi bi-trash3"></i>
          </button>
        </div>
      </div>

      <p v-if="!materials.length && !node.children.length" class="admin-folder-empty">
        No materials in this folder.
      </p>

      <AdminCategoryFolder
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :resources-by-category="resourcesByCategory"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
.admin-folder-material-date {
  font-size: 0.78rem;
  color: #64748b;
  white-space: nowrap;
}
</style>
