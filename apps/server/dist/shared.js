"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOADS_ROOT = exports.uploadFile = exports.uploadGroupAvatar = exports.uploadUserAvatar = exports.ALLOWED_IMAGE_EXTENSIONS = exports.MESSAGE_INCLUDE = exports.SENDER_SELECT = exports.USER_SELECT = void 0;
exports.ensureDir = ensureDir;
exports.deleteUploadedFile = deleteUploadedFile;
exports.encryptUploadedFile = encryptUploadedFile;
// @ts-nocheck
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const encrypt_1 = require("./encrypt");
// в”Ђв”Ђв”Ђ Prisma select objects в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
/** Standard user fields to include in API responses (excludes password) */
exports.USER_SELECT = {
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
    isVerified: true,
};
/** Compact user fields for message sender / forwarded-from */
exports.SENDER_SELECT = {
    id: true,
    username: true,
    displayName: true,
    avatar: true,
    isVerified: true,
};
/** Full message include for API responses */
exports.MESSAGE_INCLUDE = {
    sender: { select: exports.SENDER_SELECT },
    forwardedFrom: { select: exports.SENDER_SELECT },
    replyTo: {
        include: { sender: { select: { id: true, username: true, displayName: true } } },
    },
    media: true,
    reactions: {
        include: { user: { select: { id: true, username: true, displayName: true } } },
    },
    readBy: { select: { userId: true } },
};
// в”Ђв”Ђв”Ђ File system helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const uploadsRoot = path_1.default.join(__dirname, '../uploads');
/** Ensure a directory exists (recursive). */
function ensureDir(dirPath) {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
}
/** Safely delete a file from the uploads directory given its URL path (e.g. '/uploads/avatars/abc.jpg'). */
function deleteUploadedFile(urlPath) {
    if (!urlPath)
        return;
    try {
        const filename = urlPath.replace(/^\/uploads\//, '');
        const filePath = path_1.default.resolve(uploadsRoot, filename);
        // Path containment check вЂ” prevent directory traversal
        if (!filePath.startsWith(uploadsRoot)) {
            console.error('Path traversal attempt blocked:', urlPath);
            return;
        }
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
        }
    }
    catch (e) {
        console.error('Failed to delete file:', urlPath, e);
    }
}
// в”Ђв”Ђв”Ђ Multer configurations в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const avatarsDir = path_1.default.join(uploadsRoot, 'avatars');
ensureDir(avatarsDir);
ensureDir(uploadsRoot);
/** Allowed image extensions for avatars. */
exports.ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
function createAvatarStorage(prefix = '') {
    return multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, avatarsDir),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            cb(null, `${prefix}${(0, uuid_1.v4)()}${ext}`);
        },
    });
}
/** Multer middleware for user avatar uploads (max 5MB, images only). */
exports.uploadUserAvatar = (0, multer_1.default)({
    storage: createAvatarStorage(''),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (file.mimetype.startsWith('image/') && exports.ALLOWED_IMAGE_EXTENSIONS.has(ext))
            cb(null, true);
        else
            cb(new Error('РўРѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ (jpg, png, gif, webp, avif)'));
    },
});
/** Multer middleware for group avatar uploads (max 5MB, images only). */
exports.uploadGroupAvatar = (0, multer_1.default)({
    storage: createAvatarStorage('group-'),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (file.mimetype.startsWith('image/') && exports.ALLOWED_IMAGE_EXTENSIONS.has(ext))
            cb(null, true);
        else
            cb(new Error('РўРѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ (jpg, png, gif, webp, avif)'));
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
/** Multer middleware for general file uploads (max 50GB for server, 20GB for users). */
exports.uploadFile = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadsRoot),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            cb(null, `${(0, uuid_1.v4)()}${ext}`);
        },
    }),
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB for server
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
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
            cb(new Error('Р­С‚РѕС‚ С‚РёРї С„Р°Р№Р»Р° РЅРµ СЂР°Р·СЂРµС€С‘РЅ'));
            return;
        }
        // Allow ALL other files by default (generic files)
        cb(null, true);
    },
});
// в”Ђв”Ђв”Ђ Post-upload file encryption middleware в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
/**
 * Express middleware that encrypts an uploaded file in-place after multer
 * has written it to disk. Use after any multer middleware.
 */
function encryptUploadedFile(req, _res, next) {
    if (!(0, encrypt_1.isEncryptionEnabled)())
        return next();
    try {
        // Single file upload (req.file)
        if (req.file) {
            (0, encrypt_1.encryptFileInPlace)(req.file.path);
        }
        // Multiple files (req.files) вЂ” handle both array and field-keyed forms
        if (req.files) {
            const files = Array.isArray(req.files)
                ? req.files
                : Object.values(req.files).flat();
            for (const file of files) {
                (0, encrypt_1.encryptFileInPlace)(file.path);
            }
        }
    }
    catch (e) {
        console.error('File encryption error:', e);
        // Don't block the request вЂ” file is already saved, just unencrypted
    }
    next();
}
/** Absolute path to the uploads root directory. */
exports.UPLOADS_ROOT = uploadsRoot;
//# sourceMappingURL=shared.js.map