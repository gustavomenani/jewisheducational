<script setup>
import { ref, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { buildCategoryTree } from '@/utils/categoryTree';
import { useBuilderStore } from '@/builder/store';
import EditableContentText from '@/builder/EditableContentText.vue';
import EditableSetting from '@/builder/EditableSetting.vue';

const props = defineProps({
  categories: { type: Array, default: () => [] },
  activeSlug: { type: String, default: '' },
  linkQuery: { type: Object, default: () => ({}) },
  anchorCategory: { type: Object, default: null },
  title: { type: String, default: 'Materials' },
  titleItem: { type: Object, default: null },
  titleSettingKey: { type: String, default: '' },
  titleDefault: { type: String, default: '' },
});
const builder = useBuilderStore();

function findInTree(nodes, id) {
  for (const n of nodes) {
    if (Number(n.id) === Number(id)) return n;
    if (n.children?.length) {
      const found = findInTree(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Lista achatada de todos os nós do subárvore ancorada, cada um com sua
// profundidade e a cadeia de ids ancestrais — usada para decidir o que fica
// visível conforme o que está expandido.
const flatItems = computed(() => {
  const tree = buildCategoryTree(props.categories);
  let roots;
  if (props.anchorCategory) {
    const anchor = findInTree(tree, props.anchorCategory.id);
    roots = anchor ? [anchor] : [];
  } else {
    roots = tree;
  }
  const items = [];
  function walk(nodes, depth, ancestors) {
    for (const node of nodes) {
      items.push({ node, depth, ancestors, hasChildren: !!node.children?.length });
      if (node.children?.length) walk(node.children, depth + 1, [...ancestors, Number(node.id)]);
    }
  }
  walk(roots, 0, []);
  return items;
});

// Ids expandidos. Por padrão o assunto âncora abre (mostrando os sub-assuntos),
// mas os sub-sub-assuntos ficam recolhidos até clicar na seta.
const expanded = ref(new Set());

function addActiveAncestors(base) {
  const set = new Set(base);
  const activeItem = flatItems.value.find((it) => it.node.slug === props.activeSlug);
  if (activeItem) activeItem.ancestors.forEach((id) => set.add(Number(id)));
  return set;
}

function resetExpanded() {
  const base = new Set();
  if (props.anchorCategory) base.add(Number(props.anchorCategory.id));
  expanded.value = addActiveAncestors(base);
}

watch(() => props.anchorCategory?.id, resetExpanded, { immediate: true });
watch(() => props.activeSlug, () => { expanded.value = addActiveAncestors(expanded.value); });
// As categorys podem carregar depois da montagem — reaplica os padrões.
watch(() => props.categories, resetExpanded);

const visibleItems = computed(() =>
  flatItems.value.filter((it) => it.ancestors.every((id) => expanded.value.has(Number(id))))
);

function isExpanded(id) {
  return expanded.value.has(Number(id));
}

function toggle(id) {
  const set = new Set(expanded.value);
  const n = Number(id);
  if (set.has(n)) set.delete(n);
  else set.add(n);
  expanded.value = set;
}

function linkClass(depth, slug) {
  const active = props.activeSlug === slug;
  return depth === 0 ? ['k5-sidebar-link', { active }] : ['k5-sidebar-sublink', { active }];
}

function selectCategory(event, category) {
  if (!builder.editMode) return;
  event.preventDefault();
  event.stopPropagation();
  window.dispatchEvent(new CustomEvent('editor:content-select', {
    detail: { entity: 'category', id: category?.id },
  }));
}

function selectCategoryWithKeyboard(event, category) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  selectCategory(event, category);
}
</script>

<template>
  <aside class="k5-sidebar">
    <div
      class="k5-sidebar-head"
      :tabindex="builder.editMode && anchorCategory ? 0 : undefined"
      :role="builder.editMode && anchorCategory ? 'button' : undefined"
      @click="anchorCategory && selectCategory($event, anchorCategory)"
      @keydown="anchorCategory && selectCategoryWithKeyboard($event, anchorCategory)"
    >
      <EditableContentText
        v-if="titleItem"
        entity="category"
        :item="titleItem"
        field="name"
        tag="span"
        placeholder="Category name…"
      />
      <EditableSetting v-else-if="titleSettingKey" tag="span" :setting-key="titleSettingKey" :default="titleDefault || title" />
      <span v-else>{{ title }}</span>
    </div>
    <ul class="k5-sidebar-list">
      <li v-for="item in visibleItems" :key="item.node.id">
        <div class="k5-sidebar-row" :style="{ '--depth': item.depth }">
          <button
            v-if="item.hasChildren"
            type="button"
            class="k5-sidebar-toggle"
            :aria-expanded="isExpanded(item.node.id)"
            :aria-label="isExpanded(item.node.id) ? 'Collapse subtopics' : 'View subtopics'"
            @click="toggle(item.node.id)"
          >
            <i class="bi" :class="isExpanded(item.node.id) ? 'bi-chevron-down' : 'bi-chevron-right'"></i>
          </button>
          <span v-else class="k5-sidebar-toggle-spacer"></span>
          <RouterLink
            :to="{ path: `/library/category/${item.node.slug}`, query: linkQuery }"
            :class="linkClass(item.depth, item.node.slug)"
            @click="selectCategory($event, item.node)"
          >
            <EditableContentText entity="category" :item="item.node" field="name" tag="span" placeholder="Category name…" />
          </RouterLink>
        </div>
      </li>
    </ul>
  </aside>
</template>
