/**
 * @typedef {object} FlatCategory
 * @property {number|string} id
 * @property {string} name
 * @property {string} slug
 * @property {number|string|null} [parent_id]
 * @property {number} [sort_order]
 * @property {number} [resource_count]
 * @property {boolean|number} [nav_visible]
 */

/**
 * @typedef {FlatCategory & { children: CategoryNode[] }} CategoryNode
 */

/**
 * @param {FlatCategory[]} categories
 * @returns {CategoryNode[]}
 */
export function buildCategoryTree(categories) {
  const byParent = new Map();
  categories.forEach((cat) => {
    const pid = cat.parent_id || null;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push({ ...cat, children: [] });
  });

  function attach(parentId) {
    const nodes = (byParent.get(parentId) || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name));
    return nodes.map((node) => ({
      ...node,
      children: attach(node.id),
    }));
  }

  return attach(null);
}

/**
 * @param {number|string} categoryId
 * @param {FlatCategory[]} categories
 * @returns {number[]}
 */
export function getDescendantIds(categoryId, categories) {
  const ids = [];
  const children = categories.filter((c) => Number(c.parent_id) === Number(categoryId));
  for (const child of children) {
    ids.push(child.id);
    ids.push(...getDescendantIds(child.id, categories));
  }
  return ids;
}

/**
 * @param {FlatCategory} cat
 * @param {FlatCategory[]} categories
 * @returns {number}
 */
export function categoryDepth(cat, categories) {
  let depth = 0;
  let pid = cat.parent_id;
  while (pid) {
    depth += 1;
    const parent = categories.find((c) => Number(c.id) === Number(pid));
    if (!parent) break;
    pid = parent.parent_id;
  }
  return depth;
}

/**
 * @param {FlatCategory} cat
 * @param {FlatCategory[]} categories
 * @returns {string}
 */
export function categoryBreadcrumb(cat, categories) {
  const parts = [cat.name];
  let pid = cat.parent_id;
  while (pid) {
    const parent = categories.find((c) => Number(c.id) === Number(pid));
    if (!parent) break;
    parts.unshift(parent.name);
    pid = parent.parent_id;
  }
  return parts.join(' › ');
}

function isNavVisibleFlag(cat) {
  return cat.nav_visible !== false && cat.nav_visible !== 0 && cat.nav_visible !== '0';
}

function isArchivedFlag(cat) {
  return cat.is_archived === true || cat.is_archived === 1 || cat.is_archived === '1';
}

/**
 * Returns only categories that visitors may discover through navigation,
 * sidebars, filters, and category chips. A hidden parent also hides its
 * descendants, so an administrator's intent cannot be bypassed by a child
 * category elsewhere in the public interface.
 *
 * This deliberately does not determine whether a material itself is public:
 * direct links and published resources continue to use their own rules.
 *
 * @param {FlatCategory[]} categories
 * @returns {FlatCategory[]}
 */
export function visibleCategoriesForVisitors(categories = []) {
  const byId = new Map(categories.map((category) => [String(category.id), category]));

  return categories.filter((category) => {
    const seen = new Set();
    let current = category;

    while (current) {
      const id = String(current.id);
      if (seen.has(id)) return false;
      seen.add(id);

      if (!isNavVisibleFlag(current) || isArchivedFlag(current)) return false;

      const parentId = current.parent_id;
      if (parentId === null || parentId === undefined || parentId === '') return true;
      current = byId.get(String(parentId)) || null;
    }

    // Preserve orphaned categories while the administrator repairs the tree.
    return true;
  });
}

/**
 * @param {CategoryNode} node
 * @param {boolean} hideEmpty
 * @returns {CategoryNode|null}
 */
function pruneNavNode(node, hideEmpty) {
  const children = (node.children || [])
    .map((child) => pruneNavNode(child, hideEmpty))
    .filter(Boolean);

  const count = Number(node.resource_count) || 0;
  const hasContent = count > 0 || children.length > 0;
  if (!isNavVisibleFlag(node)) return null;
  if (hideEmpty && !hasContent) return null;

  return { ...node, children };
}

// Mantém o nó de 1º nível mesmo vazio (para a barra de assuntos ficar cheia,
// estilo K5Learning), mas ainda poda sub-assuntos vazios dos dropdowns.
function keepTopNode(node, hideEmpty) {
  if (!isNavVisibleFlag(node)) return null;
  const children = (node.children || [])
    .map((child) => pruneNavNode(child, hideEmpty))
    .filter(Boolean);
  return { ...node, children };
}

/**
 * @param {FlatCategory[]} categories
 * @param {{ hideEmpty?: boolean, maxTopLevel?: number, keepTopLevel?: boolean }} [options]
 * @returns {CategoryNode[]}
 */
export function buildNavTree(categories, options = {}) {
  const hideEmpty = options.hideEmpty !== false;
  const keepTopLevel = options.keepTopLevel === true;
  const maxTop = Number(options.maxTopLevel) || 0;

  const pruned = buildCategoryTree(categories)
    .map((node) => (keepTopLevel ? keepTopNode(node, hideEmpty) : pruneNavNode(node, hideEmpty)))
    .filter(Boolean);

  return maxTop > 0 ? pruned.slice(0, maxTop) : pruned;
}

export function flattenSubtree(node, depth = 0) {
  const items = [];
  for (const child of node.children || []) {
    items.push({ node: child, depth });
    items.push(...flattenSubtree(child, depth + 1));
  }
  return items;
}

/**
 * @param {CategoryNode} node
 * @returns {string}
 */
export function categoryLink(node) {
  return `/library/category/${node.slug}`;
}
