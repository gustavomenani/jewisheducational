import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import * as db from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return false;
  }
  return true;
}

router.get('/folders', authenticate, async (req, res) => {
  const folders = await db.favoriteFolderListByUser(req.user.id);
  res.json({ folders });
});

router.post(
  '/folders',
  authenticate,
  [body('name').trim().notEmpty().isLength({ max: 80 })],
  async (req, res) => {
    if (!validate(req, res)) return;
    try {
      const folder = await db.favoriteFolderCreate(req.user.id, req.body.name);
      res.status(201).json({ folder });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

router.get('/', authenticate, async (req, res) => {
  const folderId = req.query.folder ? Number(req.query.folder) : null;
  const favorites = await db.favoriteListByUser(req.user.id, folderId || null);
  res.json({ favorites });
});

router.get('/ids', authenticate, async (req, res) => {
  const ids = await db.favoriteIdsByUser(req.user.id);
  res.json({ ids });
});

router.post('/:resourceId', authenticate, async (req, res) => {
  const resource = await db.resourceFindById(req.params.resourceId);
  if (!resource?.is_published) return res.status(404).json({ error: 'Resource not found.' });

  const folderId = req.body?.folderId ? Number(req.body.folderId) : null;
  const savedFolderId = await db.favoriteAdd(req.user.id, resource.id, folderId);
  res.status(201).json({ message: 'Salvo na sua lista.', saved: true, folderId: savedFolderId });
});

router.delete('/:resourceId', authenticate, async (req, res) => {
  await db.favoriteRemove(req.user.id, req.params.resourceId);
  res.json({ message: 'Removed from your list.', saved: false });
});

export default router;
