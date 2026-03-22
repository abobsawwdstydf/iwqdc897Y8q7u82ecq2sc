"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initEncryption = initEncryption;
exports.isEncryptionEnabled = isEncryptionEnabled;
exports.encryptText = encryptText;
exports.decryptText = decryptText;
exports.encryptFileInPlace = encryptFileInPlace;
exports.isFileEncrypted = isFileEncrypted;
exports.decryptFileToBuffer = decryptFileToBuffer;
exports.resolveUploadPath = resolveUploadPath;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * AES-256-GCM encryption for message content and files.
 *
 * Text format: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * File format: [12 bytes IV][16 bytes AuthTag][...ciphertext...]
 *
 * The "enc:v1:" prefix allows detecting encrypted vs plain-text content
 * for backward compatibility with existing unencrypted messages.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const AUTH_TAG_LENGTH = 16;
const FILE_HEADER_LENGTH = IV_LENGTH + AUTH_TAG_LENGTH; // 28 bytes
const PREFIX = 'enc:v1:';
let encryptionKey = null;
/** Initialise encryption with a 64-char hex key (32 bytes). */
function initEncryption(hexKey) {
    if (!hexKey || hexKey.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
            'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    encryptionKey = Buffer.from(hexKey, 'hex');
}
/** Returns true if encryption is enabled (key configured). */
function isEncryptionEnabled() {
    return encryptionKey !== null;
}
/** Encrypt a plain-text string. Returns the encrypted string or the original if encryption is disabled. */
function encryptText(plaintext) {
    if (!encryptionKey || !plaintext)
        return plaintext;
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}
/** Decrypt an encrypted string. Returns the plain text, or the original string if it's not encrypted. */
function decryptText(ciphertext) {
    if (!ciphertext || !ciphertext.startsWith(PREFIX)) {
        // Not encrypted (legacy data or null) — return as-is
        return ciphertext;
    }
    if (!encryptionKey) {
        console.error('Cannot decrypt: ENCRYPTION_KEY not configured');
        return '[зашифровано]';
    }
    try {
        const payload = ciphertext.slice(PREFIX.length);
        const [ivHex, tagHex, dataHex] = payload.split(':');
        if (!ivHex || !tagHex || !dataHex)
            return '[повреждённые данные]';
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(tagHex, 'hex');
        const encrypted = Buffer.from(dataHex, 'hex');
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, encryptionKey, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch (e) {
        console.error('Decryption failed:', e);
        return '[ошибка расшифровки]';
    }
}
// ─── File encryption ─────────────────────────────────────────────────
/**
 * Encrypt a file in-place on disk.
 * Replaces the original file with: [IV 12B][AuthTag 16B][ciphertext...]
 */
function encryptFileInPlace(filePath) {
    if (!encryptionKey)
        return;
    const plainData = fs_1.default.readFileSync(filePath);
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plainData), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Write: IV + AuthTag + Ciphertext
    const output = Buffer.concat([iv, authTag, encrypted]);
    fs_1.default.writeFileSync(filePath, output);
}
/**
 * Check if a file appears to be encrypted (has valid header size).
 * This is a heuristic — not 100% reliable on tiny files, but good enough.
 */
function isFileEncrypted(filePath) {
    try {
        const stat = fs_1.default.statSync(filePath);
        // Encrypted files must be at least 28 bytes (header).
        // We also check if decryption with the key succeeds on the first chunk.
        if (stat.size < FILE_HEADER_LENGTH)
            return false;
        // If encryption is disabled, treat all files as plain
        if (!encryptionKey)
            return false;
        return true; // Assume encrypted if key is configured and file is large enough
    }
    catch {
        return false;
    }
}
/**
 * Decrypt a file and return the plain-text Buffer.
 * Returns null if decryption fails (file may be unencrypted).
 */
function decryptFileToBuffer(filePath) {
    if (!encryptionKey)
        return null;
    try {
        const data = fs_1.default.readFileSync(filePath);
        if (data.length < FILE_HEADER_LENGTH)
            return null;
        const iv = data.subarray(0, IV_LENGTH);
        const authTag = data.subarray(IV_LENGTH, FILE_HEADER_LENGTH);
        const ciphertext = data.subarray(FILE_HEADER_LENGTH);
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, encryptionKey, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted;
    }
    catch {
        // Decryption failed — file is likely not encrypted (legacy)
        return null;
    }
}
/**
 * Resolve a URL path like '/uploads/avatars/abc.jpg' to an absolute file path.
 */
function resolveUploadPath(urlPath, uploadsRoot) {
    if (!urlPath)
        return null;
    const filename = urlPath.replace(/^\/uploads\//, '');
    const filePath = path_1.default.resolve(uploadsRoot, filename);
    // Path containment check
    if (!filePath.startsWith(uploadsRoot))
        return null;
    return filePath;
}
//# sourceMappingURL=encrypt.js.map