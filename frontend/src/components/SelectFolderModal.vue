<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import api from '@/api';
import { useI18n } from '@/i18n';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  resourceId: { type: [Number, String], default: null },
});

const emit = defineEmits(['update:modelValue', 'saved']);

const { t } = useI18n();
const folders = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const showNewFolder = ref(false);
const newFolderName = ref('');
const modalRef = ref(null);
const closeButtonRef = ref(null);
let previousActiveElement = null;

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) {
      restoreFocus();
      return;
    }
    previousActiveElement = document.activeElement;
    error.value = '';
    showNewFolder.value = false;
    newFolderName.value = '';
    await nextTick();
    if (closeButtonRef.value) closeButtonRef.value.focus();
    else modalRef.value?.focus();
    loading.value = true;
    try {
      const { data } = await api.get('/favorites/folders');
      folders.value = data.folders || [];
    } catch {
      folders.value = [];
      error.value = t('folderLoadError');
    } finally {
      loading.value = false;
    }
  }
);

function close() {
  emit('update:modelValue', false);
}

function focusableElements() {
  return Array.from(modalRef.value?.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ) || []);
}

function trapFocus(event) {
  if (event.key !== 'Tab' || !props.modelValue) return;
  const elements = focusableElements();
  if (!elements.length) {
    event.preventDefault();
    modalRef.value?.focus();
    return;
  }
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

function restoreFocus() {
  const target = previousActiveElement;
  previousActiveElement = null;
  if (target && target !== document.body && target.isConnected) {
    nextTick(() => target.focus({ preventScroll: true }));
  }
}

function onKeydown(event) {
  if (!props.modelValue) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
  else if (event.key === 'Tab') trapFocus(event);
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
  restoreFocus();
});

async function selectFolder(folder) {
  if (!props.resourceId || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await api.post(`/favorites/${props.resourceId}`, { folderId: folder.id });
    emit('saved', folder);
    close();
  } catch (e) {
    error.value = e.response?.data?.error || t('folderSaveError');
  } finally {
    saving.value = false;
  }
}

async function createFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  saving.value = true;
  error.value = '';
  try {
    const { data } = await api.post('/favorites/folders', { name });
    folders.value = [...folders.value, data.folder];
    newFolderName.value = '';
    showNewFolder.value = false;
    await selectFolder(data.folder);
  } catch (e) {
    error.value = e.response?.data?.error || t('folderCreateError');
    saving.value = false;
  }
}

function folderLabel(folder) {
  return folder.is_default ? t('defaultFolder') : folder.name;
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="k5-folder-modal-backdrop" role="presentation" @click.self="close">
      <div
        ref="modalRef"
        class="k5-folder-modal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="'k5-folder-title'"
        tabindex="-1"
      >
        <div class="k5-folder-modal-head">
          <h2 id="k5-folder-title" class="k5-folder-modal-title">{{ t('selectFolder') }}</h2>
          <button ref="closeButtonRef" type="button" class="k5-folder-modal-close" :aria-label="t('close')" @click="close">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <div v-if="error" class="alert alert-danger py-2 mx-3 mt-2 mb-0 small" role="alert">{{ error }}</div>

        <div v-if="loading" class="text-center py-4">
          <div class="spinner-border spinner-border-sm text-primary"></div>
        </div>

        <ul v-else class="k5-folder-list">
          <li v-for="folder in folders" :key="folder.id">
            <button
              type="button"
              class="k5-folder-item"
              :disabled="saving"
              @click="selectFolder(folder)"
            >
              <i class="bi bi-folder-fill k5-folder-icon"></i>
              <span>{{ folderLabel(folder) }}</span>
              <small v-if="folder.item_count" class="k5-folder-count">{{ folder.item_count }}</small>
            </button>
          </li>
        </ul>

        <div class="k5-folder-modal-foot">
          <template v-if="showNewFolder">
            <form class="k5-folder-new-form" @submit.prevent="createFolder">
              <label for="new-folder-name" class="visually-hidden">{{ t('folderNamePlaceholder') }}</label>
              <input
                id="new-folder-name"
                v-model="newFolderName"
                type="text"
                class="form-control form-control-sm"
                :placeholder="t('folderNamePlaceholder')"
                maxlength="80"
                autofocus
              />
              <button type="submit" class="btn btn-sm btn-primary" :disabled="saving || !newFolderName.trim()">
                {{ t('createFolder') }}
              </button>
              <button type="button" class="btn btn-sm btn-link" @click="showNewFolder = false">{{ t('cancel') }}</button>
            </form>
          </template>
          <button v-else type="button" class="k5-folder-add-btn" @click="showNewFolder = true">
            <i class="bi bi-folder-plus k5-folder-icon"></i>
            {{ t('addNewFolder') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
