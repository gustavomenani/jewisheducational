import { Router } from 'express';
import * as db from '../db/index.js';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth.js';
import { uniqueSlug } from '../utils/helpers.js';

const router = Router();

function isCategoryVisibleToVisitors(category) {
  return category?.is_archived !== true
    && category?.is_archived !== 1
    && category?.is_archived !== '1'
    && category?.nav_visible !== false
    && category?.nav_visible !== 0
    && category?.nav_visible !== '0';
}

function publicCategoryIds(categories) {
  const byId = new Map(categories.map((category) => [Number(category.id), category]));
  const memo = new Map();
  function isPublic(id, visiting = new Set()) {
    const key = Number(id);
    if (!key) return true;
    if (memo.has(key)) return memo.get(key);
    if (visiting.has(key)) {
      memo.set(key, false);
      return false;
    }
    const category = byId.get(key);
    if (!isCategoryVisibleToVisitors(category)) {
      memo.set(key, false);
      return false;
    }
    const nextVisiting = new Set(visiting);
    nextVisiting.add(key);
    const result = !category.parent_id || isPublic(category.parent_id, nextVisiting);
    memo.set(key, result);
    return result;
  }
  return new Set(categories.filter((category) => isPublic(category.id)).map((category) => Number(category.id)));
}

router.get('/', optionalAuth, async (req, res) => {
  const categories = await db.categoryListWithCounts();
  const includeHidden = req.query.include_hidden === 'true' && req.user?.role === 'admin';
  if (includeHidden) return res.json({ categories });
  const publicIds = publicCategoryIds(categories);
  res.json({ categories: categories.filter((category) => publicIds.has(Number(category.id))) });
});

router.get('/:slug', async (req, res) => {
  const category = await db.categoryFindBySlug(req.params.slug);
  if (!category) return res.status(404).json({ error: 'Category not found.' });
  const allCategories = await db.categoryListAll();
  if (!publicCategoryIds(allCategories).has(Number(category.id))) return res.status(404).json({ error: 'Category not found.' });

  const publicIds = publicCategoryIds(allCategories);
  const subcategories = (await db.categoryChildren(category.id)).filter((item) => publicIds.has(Number(item.id)));
  res.json({ category, subcategories });
});

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { name, description, sort_order, parent_id, nav_visible } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required.' });

  if (parent_id) {
    const parent = await db.categoryFindById(parent_id);
    if (!parent) return res.status(400).json({ error: 'Invalid parent category.' });
  }

  const slug = await uniqueSlug(name, (s) => db.categorySlugExists(s));

  const result = await db.categoryCreate({
    name: name.trim(),
    slug,
    description: description || null,
    parent_id: parent_id || null,
    sort_order: sort_order || 0,
    nav_visible: nav_visible === false || nav_visible === 0 || nav_visible === '0' ? 0 : 1,
  });

  const category = await db.categoryFindById(result.insertId);
  res.status(201).json({ category });
});

router.put('/reorder', authenticate, requireAdmin, async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Item list is required.' });
  }
  try {
    for (const item of items) {
      if (item.id == null || item.sort_order == null) continue;
      const existing = await db.categoryFindById(item.id);
      if (existing) {
        await db.categoryUpdate(item.id, {
          name: existing.name,
          slug: existing.slug,
          description: existing.description,
          parent_id: existing.parent_id,
          sort_order: Number(item.sort_order),
          nav_visible: existing.nav_visible,
        });
      }
    }
    const categories = await db.categoryListWithCounts();
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: 'Could not reorder categories.' });
  }
});

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const { name, description, sort_order, parent_id, nav_visible } = req.body;
  const existing = await db.categoryFindById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found.' });

  if (parent_id && Number(parent_id) === Number(req.params.id)) {
    return res.status(400).json({ error: 'A category cannot be its own parent.' });
  }

  if (parent_id) {
    const descendants = await db.categoryGetDescendantIds(req.params.id);
    if (descendants.includes(Number(parent_id))) {
      return res.status(400).json({ error: 'A category cannot be moved inside one of its own subtopics.' });
    }
    const parent = await db.categoryFindById(parent_id);
    if (!parent) return res.status(400).json({ error: 'Invalid parent category.' });
  }

  let slug = existing.slug;
  if (name && name !== existing.name) {
    slug = await uniqueSlug(name, (s) => db.categorySlugExists(s, req.params.id));
  }

  const nextNavVisible = nav_visible === undefined
    ? existing.nav_visible
    : (nav_visible === false || nav_visible === 0 || nav_visible === '0' ? 0 : 1);

  await db.categoryUpdate(req.params.id, {
    name: name?.trim() || existing.name,
    slug,
    description: description ?? existing.description,
    parent_id: parent_id === '' || parent_id === undefined ? existing.parent_id : parent_id || null,
    sort_order: sort_order ?? existing.sort_order,
    nav_visible: nextNavVisible,
  });

  const category = await db.categoryFindById(req.params.id);
  res.json({ category });
});

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const existing = await db.categoryFindById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Category not found.' });

  const children = await db.categoryChildren(req.params.id);
  if (children.length) return res.status(400).json({ error: 'Delete the subcategories first.' });

  await db.categoryDelete(req.params.id);
  res.json({ message: 'Category deleted.' });
});

export async function getDescendantIds(categoryId) {
  return db.categoryGetDescendantIds(categoryId);
}

export default router;
