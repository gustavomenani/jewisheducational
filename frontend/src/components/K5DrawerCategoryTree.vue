<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { categoryLink } from '@/utils/categoryTree';
import EditableContentText from '@/builder/EditableContentText.vue';
import EditableSetting from '@/builder/EditableSetting.vue';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 },
});

const emit = defineEmits(['navigate']);

const expanded = ref(new Set());

function toggle(id) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function isOpen(id) {
  return expanded.value.has(id);
}

function onNav() {
  emit('navigate');
}
</script>

<template>
  <template v-for="node in nodes" :key="node.id">
    <div v-if="node.children?.length" class="edu-drawer-group" :class="{ open: isOpen(node.id) }">
      <button
        type="button"
        class="edu-drawer-item edu-drawer-item-heading"
        :style="{ paddingLeft: `${0.75 + depth * 0.65}rem` }"
        :aria-expanded="isOpen(node.id)"
        @click="toggle(node.id)"
      >
        <span class="edu-drawer-item-label"><EditableContentText entity="category" :item="node" field="name" tag="span" placeholder="Category name…" /></span>
        <i class="bi bi-chevron-down edu-drawer-chevron"></i>
      </button>
      <div v-show="isOpen(node.id)" class="edu-drawer-sublist">
        <RouterLink
          :to="categoryLink(node)"
          class="edu-drawer-sublink"
          :style="{ paddingLeft: `${1.25 + depth * 0.65}rem` }"
          @click="onNav"
        >
          <EditableSetting tag="span" setting-key="drawer_view_all_prefix" :default="'View all in'" /> <EditableContentText entity="category" :item="node" field="name" tag="span" placeholder="Category name…" />
        </RouterLink>
        <K5DrawerCategoryTree :nodes="node.children" :depth="depth + 1" @navigate="onNav" />
      </div>
    </div>
    <RouterLink
      v-else
      :to="categoryLink(node)"
      class="edu-drawer-item"
      :style="{ paddingLeft: `${0.75 + depth * 0.65}rem` }"
      @click="onNav"
    >
      <span class="edu-drawer-item-label"><EditableContentText entity="category" :item="node" field="name" tag="span" placeholder="Category name…" /></span>
      <i class="bi bi-chevron-right edu-drawer-chevron"></i>
    </RouterLink>
  </template>
</template>

<script>
export default { name: 'K5DrawerCategoryTree' };
</script>
