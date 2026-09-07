import multer from 'multer';
import Busboy from 'busboy';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { isFirestoreBackend } from '../config/database.js';
import * as db from '../db/index.js';

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const allowedMimes = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
};

const allowedExtensions = {
  '.pdf': ['application/pdf', 'pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  '.ppt': ['application/vnd.ms-powerpoint', 'ppt'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx'],
};

// Extension is always derived from the VALIDATED type, never from the client
// filename. Otherwise a .html payload named "cover.jpg" would be saved with a
// browser-executable extension inside the public covers directory.
export const EXT_BY_MIME = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Material files can legitimately be images. Only cover and gallery
// thumbnail fields belong in `covers`; the primary `file`/`files` fields must
// live in `files` so the download and preview routes resolve them correctly.
export function uploadStorageSubdir(fileOrField) {
  const explicitSubdir = typeof fileOrField === 'object' ? fileOrField?.storageSubdir : null;
  if (explicitSubdir === 'covers' || explicitSubdir === 'files') return explicitSubdir;
  const fieldname = typeof fileOrField === 'string' ? fileOrField : fileOrField?.fieldname;
  return fieldname === 'cover' || fieldname === 'file_thumbnails' ? 'covers' : 'files';
}

// Verifies the file content actually matches the declared type. MIME claims
// from the client are spoofable; signature checks stop HTML/JS disguised as
// an image or document from being stored and served later.
export function contentMatchesType(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false;
  const head = buffer.subarray(0, Math.min(buffer.length, 2048));
  const ascii = (start, end) => head.toString('latin1', start, end);
  switch (mimeType) {
    case 'application/pdf':
      return head.indexOf('%PDF-') >= 0;
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return head[0] === 0x50 && head[1] === 0x4b; // ZIP container
    case 'application/vnd.ms-powerpoint':
      return (head[0] === 0x50 && head[1] === 0x4b) // PPTX content saved as .ppt
        || (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0); // OLE
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    default:
      return true; // type already restricted by allowedType above
  }
}

function allowedType(filename, mimeType) {
  if (allowedMimes[mimeType]) return { mimeType, fileType: allowedMimes[mimeType] };
  const entry = allowedExtensions[path.extname(filename || '').toLowerCase()];
  if (entry) return { mimeType: entry[0], fileType: entry[1] };
  return null;
}

function ensureDir(subdir) {
  const dir = path.join(uploadDir, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const diskStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, ensureDir(uploadStorageSubdir({
      ...file,
      storageSubdir: req.__uploadStorageSubdir,
    })));
  },
  filename(req, file, cb) {
    const type = allowedType(file.originalname, file.mimetype);
    const ext = (type && EXT_BY_MIME[type.mimeType]) || path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const memoryStorage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const type = allowedType(file.originalname, file.mimetype);
  if (type) {
    file.mimetype = type.mimeType;
    cb(null, true);
  } else {
    cb(new Error('File type not allowed.'));
  }
}

const multerInstance = multer({
  storage: isFirestoreBackend() ? memoryStorage : diskStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

function getRawMultipartBody(req) {
  if (req.rawBody && Buffer.isBuffer(req.rawBody) && req.rawBody.length) {
    return req.rawBody;
  }
  if (Buffer.isBuffer(req.body) && req.body.length) {
    return req.body;
  }
  return null;
}

function createFirebaseMultipartHandler(mode, fieldDefsOrName) {
  return (req, res, next) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      if (!req.body || Buffer.isBuffer(req.body)) req.body = {};
      if (mode === 'single') req.file = undefined;
      else req.files = req.files || {};
      return next();
    }

    const limits = { fileSize: MAX_FILE_SIZE };
    if (mode === 'fields') {
      limits.files = fieldDefsOrName.reduce((sum, field) => sum + (field.maxCount || 1), 0);
    }

    const busboy = Busboy({ headers: req.headers, limits });
    const fields = {};
    const filesByField = {};
    const filePromises = [];

    busboy.on('field', (name, value) => {
      fields[name] = value;
    });

    busboy.on('file', (fieldname, stream, info) => {
      const promise = new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('limit', () => reject(new Error('File exceeds the 50 MB limit.')));
        stream.on('error', reject);
        stream.on('end', () => {
          const type = allowedType(info.filename, info.mimeType || 'application/octet-stream');
          if (!type) {
            reject(new Error('File type not allowed.'));
            return;
          }
          resolve({
            fieldname,
            originalname: info.filename || 'file',
            encoding: info.encoding,
            mimetype: type.mimeType,
            buffer: Buffer.concat(chunks),
            storageSubdir: req.__uploadStorageSubdir,
          });
        });
      });

      filePromises.push(
        promise.then((file) => {
          file.size = file.buffer.length;
          if (!filesByField[fieldname]) filesByField[fieldname] = [];
          const maxCount = mode === 'single'
            ? 1
            : fieldDefsOrName.find((field) => field.name === fieldname)?.maxCount ?? 99;
          if (filesByField[fieldname].length >= maxCount) {
            throw new Error(`File limit exceeded for "${fieldname}".`);
          }
          filesByField[fieldname].push(file);
        })
      );
    });

    busboy.on('error', (err) => next(err));

    busboy.on('finish', () => {
      Promise.all(filePromises)
        .then(() => {
          req.body = fields;
          if (mode === 'single') {
            req.file = filesByField[fieldDefsOrName]?.[0];
          } else {
            req.files = filesByField;
          }
          next();
        })
        .catch(next);
    });

    try {
      const rawBody = getRawMultipartBody(req);
      if (rawBody) {
        busboy.end(rawBody);
      } else {
        req.pipe(busboy);
      }
    } catch (err) {
      next(err);
    }
  };
}

export const upload = {
  single(name) {
    if (isFirestoreBackend()) {
      return createFirebaseMultipartHandler('single', name);
    }
    return multerInstance.single(name);
  },
  fields(defs) {
    if (isFirestoreBackend()) {
      return createFirebaseMultipartHandler('fields', defs);
    }
    return multerInstance.fields(defs);
  },
  settingsImage() {
    const handler = isFirestoreBackend()
      ? createFirebaseMultipartHandler('single', 'file')
      : multerInstance.single('file');
    return (req, res, next) => {
      req.__uploadStorageSubdir = 'covers';
      handler(req, res, (error) => {
        if (req.file) req.file.storageSubdir = 'covers';
        delete req.__uploadStorageSubdir;
        next(error);
      });
    };
  },
};

async function uploadToFirebase(file, subdir) {
  const ext = EXT_BY_MIME[file.mimetype] || path.extname(file.originalname);
  const filename = `${uuidv4()}${ext}`;
  const destPath = `${subdir}/${filename}`;
  const publicUrl = await db.storageUpload(file.buffer, destPath, file.mimetype);
  return { filename, publicUrl, storagePath: destPath };
}

export async function processUploadedFile(file) {
  if (!file) return file;
  let buffer = file.buffer || null;
  if (!buffer && file.path && fs.existsSync(file.path)) {
    const fd = fs.openSync(file.path, 'r');
    try {
      const probe = Buffer.alloc(2048);
      const bytesRead = fs.readSync(fd, probe, 0, probe.length, 0);
      buffer = probe.subarray(0, bytesRead);
    } finally {
      fs.closeSync(fd);
    }
  }
  if (!contentMatchesType(buffer, file.mimetype)) {
    // Reject spoofed content and remove the staged file so a failed upload
    // cannot leave orphaned bytes behind.
    if (file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch { /* best effort cleanup */ }
    }
    const error = new Error('File content does not match the declared type.');
    error.status = 400;
    throw error;
  }
  if (isFirestoreBackend() && file.buffer) {
    const subdir = uploadStorageSubdir(file);
    const uploaded = await uploadToFirebase(file, subdir);
    file.filename = uploaded.filename;
    file.publicUrl = uploaded.publicUrl;
    file.storagePath = uploaded.storagePath;
  }
  return file;
}

export async function processUploadedFiles(files = []) {
  const processed = [];
  try {
    for (const file of files) processed.push(await processUploadedFile(file));
    return processed;
  } catch (error) {
    // A multipart request may have uploaded earlier files before a later file
    // fails validation/storage. Clean those staged objects immediately so a
    // failed Publish cannot leave orphaned uploads behind.
    for (const file of processed) {
      try {
        if (file.storagePath) await db.storageDelete(file.storagePath);
        else if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch { /* best effort cleanup */ }
    }
    throw error;
  }
}

export function getFileType(mime) {
  return allowedMimes[mime] || 'other';
}

export { uploadDir };
