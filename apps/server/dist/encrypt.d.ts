/** Initialise encryption with a 64-char hex key (32 bytes). */
export declare function initEncryption(hexKey: string): void;
/** Returns true if encryption is enabled (key configured). */
export declare function isEncryptionEnabled(): boolean;
/** Encrypt a plain-text string. Returns the encrypted string or the original if encryption is disabled. */
export declare function encryptText(plaintext: string): string;
/** Decrypt an encrypted string. Returns the plain text, or the original string if it's not encrypted. */
export declare function decryptText(ciphertext: string): string;
/**
 * Encrypt a file in-place on disk.
 * Replaces the original file with: [IV 12B][AuthTag 16B][ciphertext...]
 */
export declare function encryptFileInPlace(filePath: string): void;
/**
 * Check if a file appears to be encrypted (has valid header size).
 * This is a heuristic вЂ” not 100% reliable on tiny files, but good enough.
 */
export declare function isFileEncrypted(filePath: string): boolean;
/**
 * Decrypt a file and return the plain-text Buffer.
 * Returns null if decryption fails (file may be unencrypted).
 */
export declare function decryptFileToBuffer(filePath: string): Buffer | null;
/**
 * Resolve a URL path like '/uploads/avatars/abc.jpg' to an absolute file path.
 */
export declare function resolveUploadPath(urlPath: string, uploadsRoot: string): string | null;
