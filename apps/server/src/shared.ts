import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';
import { encryptFileInPlace, isEncryptionEnabled } from './encrypt';

// ─── Prisma select objects ────────────────────────────────────────────

/** Standard user fields to include in API responses (excludes password) */
export const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  bio: true,
  birthday: true,
  isOnline: true,
  lastSeen: true,
  createdAt: true,
  hideStoryViews: true,
} as const;

/** Compact user fields for message sender / forwarded-from */
export const SENDER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

/** Full message include for API responses */
export const MESSAGE_INCLUDE = {
  sender: { select: SENDER_SELECT },
  forwardedFrom: { select: SENDER_SELECT },
  replyTo: {
    include: { sender: { select: { id: true, username: true, displayName: true } } },
  },
  media: true,
  reactions: {
    include: { user: { select: { id: true, username: true, displayName: true } } },
  },
  readBy: { select: { userId: true } },
} as const;

// ─── File system helpers ──────────────────────────────────────────────

const uploadsRoot = path.join(__dirname, '../uploads');

/** Ensure a directory exists (recursive). */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/** Safely delete a file from the uploads directory given its URL path (e.g. '/uploads/avatars/abc.jpg'). */
export function deleteUploadedFile(urlPath: string): void {
  if (!urlPath) return;
  try {
    const filename = urlPath.replace(/^\/uploads\//, '');
    const filePath = path.resolve(uploadsRoot, filename);

    // Path containment check — prevent directory traversal
    if (!filePath.startsWith(uploadsRoot)) {
      console.error('Path traversal attempt blocked:', urlPath);
      return;
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error('Failed to delete file:', urlPath, e);
  }
}

// ─── Multer configurations ───────────────────────────────────────────

const avatarsDir = path.join(uploadsRoot, 'avatars');
ensureDir(avatarsDir);
ensureDir(uploadsRoot);

/** Allowed image extensions for avatars. */
export const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

function createAvatarStorage(prefix = '') {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}${uuidv4()}${ext}`);
    },
  });
}

/** Multer middleware for user avatar uploads (max 5MB, images only). */
export const uploadUserAvatar = multer({
  storage: createAvatarStorage(''),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error('Только изображения (jpg, png, gif, webp, avif)'));
  },
});

/** Multer middleware for group avatar uploads (max 5MB, images only). */
export const uploadGroupAvatar = multer({
  storage: createAvatarStorage('group-'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(ext)) cb(null, true);
    else cb(new Error('Только изображения (jpg, png, gif, webp, avif)'));
  },
});

/** Blocked file extensions that could be served as executable content (kept minimal for functionality). */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.dll', '.sys', '.drv',
]);

/** Allowed audio extensions for explicit audio file support. */
const ALLOWED_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus', '.weba', '.aiff', '.alac', '.ape', '.amr']);

/** Allowed image extensions for explicit image file support. */
const ALLOWED_IMAGE_EXTENSIONS_GENERAL = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico', '.tiff', '.tif', '.heic', '.heif', '.raw', '.psd']);

/** Allowed video extensions for explicit video file support. */
const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg', '.3gp', '.3g2', '.ogv', '.vob']);

/** Allowed document extensions for explicit document file support. */
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.tar', '.gz', '.html', '.htm', '.xml', '.xhtml', '.csv', '.json', '.md', '.epub', '.mobi', '.azw', '.azw3', '.djvu', '.xps', '.oxps', '.fb2', '.fb2.zip']);

/** Multer middleware for general file uploads (max 20GB). */
export const uploadFile = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Allow audio files explicitly
    if (ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
      cb(null, true);
      return;
    }
    
    // Allow image files explicitly
    if (ALLOWED_IMAGE_EXTENSIONS_GENERAL.has(ext)) {
      cb(null, true);
      return;
    }
    
    // Allow video files explicitly
    if (ALLOWED_VIDEO_EXTENSIONS.has(ext)) {
      cb(null, true);
      return;
    }
    
    // Allow document files explicitly
    if (ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) {
      cb(null, true);
      return;
    }
    
    // Block dangerous executable extensions
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error('Этот тип файла не разрешён'));
      return;
    }
    
    // Allow ALL other files by default (generic files)
    cb(null, true);
  },
});

// ─── Post-upload file encryption middleware ───────────────────────────

/**
 * Express middleware that encrypts an uploaded file in-place after multer
 * has written it to disk. Use after any multer middleware.
 */
export function encryptUploadedFile(req: Request, _res: Response, next: NextFunction): void {
  if (!isEncryptionEnabled()) return next();

  try {
    // Single file upload (req.file)
    if (req.file) {
      encryptFileInPlace(req.file.path);
    }
    // Multiple files (req.files) — handle both array and field-keyed forms
    if (req.files) {
      const files = Array.isArray(req.files)
        ? req.files
        : Object.values(req.files).flat();
      for (const file of files) {
        encryptFileInPlace(file.path);
      }
    }
  } catch (e) {
    console.error('File encryption error:', e);
    // Don't block the request — file is already saved, just unencrypted
  }

  next();
}

/** Absolute path to the uploads root directory. */
export const UPLOADS_ROOT = uploadsRoot;
