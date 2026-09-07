<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { RouterLink } from 'vue-router';
import { categoryLink, flattenSubtree } from '@/utils/categoryTree';
import { useBuilderStore } from '@/builder/store';
import EditableContentText from '@/builder/EditableContentText.vue';

const props = defineProps({
  node: { type: Object, required: true },
  activeSlug: { type: String, default: '' },
});

const open = ref(false);
const builder = useBuilderStore();
const rootRef = ref(null);
const triggerRef = ref(null);

const submenuItems = computed(() => flattenSubtree(props.node));

// Mega-menu em colunas (estilo K5Learning): cada filho direto vira uma
// coluna, com seus próprios filhos listados abaixo do título.
const columns = computed(() =>
  (props.node.children || []).map((child) => ({
    node: child,
    items: flattenSubtree(child),
  }))
);

const isActive = computed(() => {
  const slug = props.activeSlug;
  if (!slug) return false;
  if (props.node.slug === slug) return true;
  return submenuItems.value.some((item) => item.node.slug === slug);
});

const triggerId = computed(() => `k5-nav-trigger-${props.node.id}`);
const menuId = computed(() => `k5-nav-menu-${props.node.id}`);

function menuLinks() {
  return Array.from(rootRef.value?.querySelectorAll('[role="menuitem"]') || []);
}

function openMenu(focusFirst = false) {
  open.value = true;
  if (focusFirst) nextTick(() => menuLinks()[0]?.focus());
}

function focusTrigger() {
  const element = triggerRef.value?.$el || triggerRef.value;
  element?.focus();
}

function closeMenu(restoreFocus = false) {
  open.value = false;
  if (restoreFocus) nextTick(focusTrigger);
}

function onTriggerKeydown(event) {
  if (!props.node.children?.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    openMenu(true);
  } else if (event.key === ' ') {
    event.preventDefault();
    if (open.value) closeMenu();
    else openMenu(true);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    openMenu(true);
  } else if (event.key === 'Escape' && open.value) {
    event.preventDefault();
    closeMenu(true);
  }
}

function onMenuKeydown(event) {
  const links = menuLinks();
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu(true);
    return;
  }
  if (!links.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = links.indexOf(document.activeElement);
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? links.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + links.length) % links.length;
  links[next]?.focus();
}

function onFocusOut(event) {
  if (!rootRef.value?.contains(event.relatedTarget)) closeMenu();
}

function onDocumentClick(event) {
  if (rootRef.value && !rootRef.value.contains(event.target)) closeMenu();
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape' && open.value) closeMenu(true);
}

function selectCategory(event, category) {
  if (!builder.editMode) return;
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent('editor:content-select', {
    detail: { entity: 'category', id: category?.id },
  }));
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div
    ref="rootRef"
    class="k5-top-nav-item"
    :class="{ 'is-open': open, 'has-children': node.children?.length, 'is-active': isActive }"
    @mouseenter="node.children?.length ? openMenu() : null"
    @mouseleave="closeMenu()"
    @focusin="node.children?.length ? openMenu() : null"
    @focusout="onFocusOut"
  >
    <RouterLink
      :to="categoryLink(node)"
      class="k5-nav-link"
      ref="triggerRef"
      :id="node.children?.length ? triggerId : undefined"
      :aria-haspopup="node.children?.length ? 'menu' : undefined"
      :aria-expanded="node.children?.length ? open : undefined"
      :aria-controls="node.children?.length ? menuId : undefined"
      @keydown="onTriggerKeydown"
      @click="selectCategory($event, node); closeMenu()"
    >
      <EditableContentText entity="category" :item="node" field="name" tag="span" placeholder="Category name…" />
    </RouterLink>

    <div
      v-if="node.children?.length && open"
      :id="menuId"
      class="k5-mega-dropdown"
      role="menu"
      :aria-labelledby="triggerId"
      @keydown="onMenuKeydown"
    >
      <div class="k5-mega-columns">
        <div v-for="col in columns" :key="col.node.id" class="k5-mega-column">
          <RouterLink :to="categoryLink(col.node)" class="k5-mega-column-title" role="menuitem" @click="selectCategory($event, col.node); closeMenu()">
            <i class="bi bi-folder2-open me-1" aria-hidden="true"></i><EditableContentText entity="category" :item="col.node" field="name" tag="span" placeholder="Category name…" />
          </RouterLink>
          <RouterLink
            v-for="item in col.items"
            :key="item.node.id"
            :to="categoryLink(item.node)"
            class="k5-mega-column-item"
            role="menuitem"
            @click="selectCategory($event, item.node); closeMenu()"
          >
            <i class="bi bi-folder2-open me-1" aria-hidden="true"></i><EditableContentText entity="category" :item="item.node" field="name" tag="span" placeholder="Category name…" />
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
