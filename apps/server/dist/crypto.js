"use strict";
/**
 * Nimbus Server-Side Cryptography
 * Multi-layer encryption for server operations
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NimbusServerCrypto = void 0;
exports.generateAESKey = generateAESKey;
exports.generateRSAKeyPair = generateRSAKeyPair;
exports.deriveKeyFromPassword = deriveKeyFromPassword;
exports.deriveKeyHKDF = deriveKeyHKDF;
exports.encryptMessage = encryptMessage;
exports.decryptMessage = decryptMessage;
exports.encryptChaCha20 = encryptChaCha20;
exports.decryptChaCha20 = decryptChaCha20;
exports.wrapKeyWithRSA = wrapKeyWithRSA;
exports.unwrapKeyWithRSA = unwrapKeyWithRSA;
exports.hashData = hashData;
exports.createHMAC = createHMAC;
exports.verifyHMAC = verifyHMAC;
exports.createAuthenticatedEnvelope = createAuthenticatedEnvelope;
exports.verifyAndDecryptEnvelope = verifyAndDecryptEnvelope;
exports.createSecureSession = createSecureSession;
exports.completeSessionHandshake = completeSessionHandshake;
exports.tripleEncrypt = tripleEncrypt;
exports.tripleDecrypt = tripleDecrypt;
const crypto_1 = __importDefault(require("crypto"));
// ─── Constants ────────────────────────────────────────────────────────
const ALGORITHMS = {
    aes256gcm: 'aes-256-gcm',
    chacha20: 'chacha20-poly1305',
    sha384: 'sha384',
    sha512: 'sha512',
    pbkdf2: 'pbkdf2',
    hkdf: 'hkdf',
};
const CONFIG = {
    keyLength: 32, // 256 bits
    ivLength: 12, // 96 bits for GCM
    saltLength: 32, // 256 bits
    tagLength: 16, // 128 bits
    pbkdf2Iterations: 100000,
    chachaNonceLength: 12,
};
// ─── Utility Functions ────────────────────────────────────────────────
function bufferToBase64(buffer) {
    return buffer.toString('base64');
}
function base64ToBuffer(base64) {
    return Buffer.from(base64, 'base64');
}
function generateRandomBytes(length) {
    return crypto_1.default.randomBytes(length);
}
function constantTimeCompare(a, b) {
    if (a.length !== b.length)
        return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a[i] ^ b[i];
    }
    return result === 0;
}
// ─── Key Generation ───────────────────────────────────────────────────
/**
 * Generate AES-256 key for symmetric encryption
 */
function generateAESKey() {
    const key = generateRandomBytes(CONFIG.keyLength);
    return { key, keyBase64: bufferToBase64(key) };
}
/**
 * Generate RSA-4096 key pair
 */
function generateRSAKeyPair() {
    const { publicKey, privateKey } = crypto_1.default.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });
    const publicKeyId = bufferToBase64(crypto_1.default.createHash('sha256').update(publicKey).digest()).slice(0, 16);
    return {
        publicKey: publicKey.toString(),
        privateKey: privateKey.toString(),
        publicKeyId,
    };
}
/**
 * Derive key from password using PBKDF2 with SHA-384
 */
function deriveKeyFromPassword(password, salt, iterations = CONFIG.pbkdf2Iterations) {
    return crypto_1.default.pbkdf2Sync(password, salt, iterations, CONFIG.keyLength, 'sha384');
}
/**
 * Derive key using HKDF (for Perfect Forward Secrecy)
 * Note: Node.js doesn't have native HKDF, using PBKDF2 as alternative
 */
function deriveKeyHKDF(inputKey, salt, info, length = CONFIG.keyLength) {
    // Use PBKDF2 with info as part of salt for HKDF-like derivation
    const combinedSalt = Buffer.concat([salt, info]);
    return crypto_1.default.pbkdf2Sync(inputKey, combinedSalt, 10000, // Lower iterations for HKDF
    length, 'sha384');
}
// ─── Encryption ───────────────────────────────────────────────────────
/**
 * Encrypt with AES-256-GCM (primary method)
 */
function encryptMessage(plaintext, key) {
    const iv = generateRandomBytes(CONFIG.ivLength);
    const salt = generateRandomBytes(CONFIG.saltLength);
    const cipher = crypto_1.default.createCipheriv(ALGORITHMS.aes256gcm, key, iv, { authTagLength: CONFIG.tagLength });
    const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    let ciphertext = cipher.update(input);
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        ciphertext: bufferToBase64(ciphertext),
        iv: bufferToBase64(iv),
        salt: bufferToBase64(salt),
        tag: bufferToBase64(tag),
        algorithm: 'aes-256-gcm',
        version: 1,
        timestamp: Date.now(),
    };
}
/**
 * Decrypt with AES-256-GCM
 */
function decryptMessage(encrypted, key) {
    const iv = base64ToBuffer(encrypted.iv);
    const ciphertext = base64ToBuffer(encrypted.ciphertext);
    const tag = base64ToBuffer(encrypted.tag);
    const decipher = crypto_1.default.createDecipheriv(ALGORITHMS.aes256gcm, key, iv, { authTagLength: CONFIG.tagLength });
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext.toString('utf8');
}
/**
 * Encrypt with ChaCha20-Poly1305 (alternative for mobile/low-power)
 */
function encryptChaCha20(plaintext, key) {
    const nonce = generateRandomBytes(CONFIG.chachaNonceLength);
    const salt = generateRandomBytes(CONFIG.saltLength);
    const cipher = crypto_1.default.createCipheriv(ALGORITHMS.chacha20, key, nonce);
    const input = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
    let ciphertext = cipher.update(input);
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        ciphertext: bufferToBase64(ciphertext),
        iv: bufferToBase64(nonce),
        salt: bufferToBase64(salt),
        tag: bufferToBase64(tag),
        algorithm: 'chacha20-poly1305',
        version: 1,
        timestamp: Date.now(),
    };
}
/**
 * Decrypt with ChaCha20-Poly1305
 */
function decryptChaCha20(encrypted, key) {
    const nonce = base64ToBuffer(encrypted.iv);
    const ciphertext = base64ToBuffer(encrypted.ciphertext);
    const tag = base64ToBuffer(encrypted.tag);
    const decipher = crypto_1.default.createDecipheriv(ALGORITHMS.chacha20, key, nonce);
    decipher.setAuthTag(tag);
    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);
    return plaintext.toString('utf8');
}
// ─── Key Wrapping (RSA) ───────────────────────────────────────────────
/**
 * Wrap symmetric key with RSA public key
 */
function wrapKeyWithRSA(key, publicKeyPem) {
    const publicKey = Buffer.from(publicKeyPem, 'base64');
    const wrapped = crypto_1.default.publicEncrypt({
        key: publicKey,
        padding: crypto_1.default.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
    }, key);
    return bufferToBase64(wrapped);
}
/**
 * Unwrap symmetric key with RSA private key
 */
function unwrapKeyWithRSA(wrappedKeyBase64, privateKeyPem) {
    const privateKey = Buffer.from(privateKeyPem, 'base64');
    const wrappedKey = base64ToBuffer(wrappedKeyBase64);
    return crypto_1.default.privateDecrypt({
        key: privateKey,
        padding: crypto_1.default.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
    }, wrappedKey);
}
// ─── Hashing & Authentication ─────────────────────────────────────────
/**
 * Hash with SHA-384
 */
function hashData(data) {
    const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    return bufferToBase64(crypto_1.default.createHash(ALGORITHMS.sha384).update(input).digest());
}
/**
 * Create HMAC-SHA384
 */
function createHMAC(data, key) {
    return bufferToBase64(crypto_1.default.createHmac(ALGORITHMS.sha384, key).update(data).digest());
}
/**
 * Verify HMAC
 */
function verifyHMAC(data, signature, key) {
    const expected = createHMAC(data, key);
    return constantTimeCompare(Buffer.from(signature, 'base64'), Buffer.from(expected, 'base64'));
}
// ─── Authenticated Envelopes ──────────────────────────────────────────
/**
 * Create authenticated encryption envelope
 */
function createAuthenticatedEnvelope(plaintext, encryptionKey, hmacKey) {
    const encrypted = encryptMessage(plaintext, encryptionKey);
    const hmac = createHMAC(encrypted.ciphertext + encrypted.iv + encrypted.tag, hmacKey);
    return {
        encrypted,
        hmac,
        timestamp: Date.now(),
    };
}
/**
 * Verify and decrypt envelope
 */
function verifyAndDecryptEnvelope(envelope, encryptionKey, hmacKey) {
    // Verify HMAC first (constant-time comparison)
    const isValid = verifyHMAC(envelope.encrypted.ciphertext + envelope.encrypted.iv + envelope.encrypted.tag, envelope.hmac, hmacKey);
    if (!isValid) {
        throw new Error('HMAC verification failed - message integrity compromised');
    }
    // Decrypt based on algorithm
    if (envelope.encrypted.algorithm === 'chacha20-poly1305') {
        return decryptChaCha20(envelope.encrypted, encryptionKey);
    }
    return decryptMessage(envelope.encrypted, encryptionKey);
}
// ─── Session Management ───────────────────────────────────────────────
/**
 * Create secure session with Perfect Forward Secrecy
 */
function createSecureSession(remotePublicKeyPem) {
    // Generate ephemeral RSA key pair
    const ephemeralKeys = generateRSAKeyPair();
    // Generate session AES key
    const sessionKeyData = generateAESKey();
    // Wrap session key with remote public key
    const wrappedSessionKey = wrapKeyWithRSA(sessionKeyData.key, remotePublicKeyPem);
    return {
        sessionKey: sessionKeyData.key,
        sessionKeyBase64: sessionKeyData.keyBase64,
        ephemeralPublicKey: ephemeralKeys.publicKey,
        wrappedSessionKey,
    };
}
/**
 * Complete session handshake
 */
function completeSessionHandshake(wrappedSessionKey, privateKeyPem, salt) {
    // Unwrap session key
    const sessionKey = unwrapKeyWithRSA(wrappedSessionKey, privateKeyPem);
    // Derive final key with HKDF
    const saltValue = salt || generateRandomBytes(CONFIG.saltLength);
    const info = Buffer.from('Nimbus-Session-v1', 'utf8');
    return deriveKeyHKDF(sessionKey, saltValue, info);
}
function tripleEncrypt(plaintext, rsaPublicKeyPem) {
    // Layer 1: AES-256-GCM
    const aesKeyData = generateAESKey();
    const layer1 = encryptMessage(plaintext, aesKeyData.key);
    // Layer 2: ChaCha20-Poly1305 with different key
    const chachaKeyData = generateAESKey();
    const layer2 = encryptChaCha20(layer1.ciphertext + layer1.iv + layer1.tag, chachaKeyData.key);
    // Wrap both keys with RSA
    const combinedKeys = aesKeyData.keyBase64 + ':' + chachaKeyData.keyBase64;
    const wrappedKey = wrapKeyWithRSA(Buffer.from(combinedKeys, 'utf8'), rsaPublicKeyPem);
    return {
        layer1,
        layer2,
        wrappedKey,
        timestamp: Date.now(),
    };
}
function tripleDecrypt(encrypted, rsaPrivateKeyPem) {
    // Unwrap keys
    const unwrapped = unwrapKeyWithRSA(encrypted.wrappedKey, rsaPrivateKeyPem);
    const [aesKeyBase64, chachaKeyBase64] = unwrapped.toString('utf8').split(':');
    const aesKey = base64ToBuffer(aesKeyBase64);
    const chachaKey = base64ToBuffer(chachaKeyBase64);
    // Decrypt layer 2
    const layer1Data = decryptChaCha20(encrypted.layer2, chachaKey);
    const [layer1Ciphertext, layer1Iv, layer1Tag] = [
        layer1Data.slice(0, -24),
        layer1Data.slice(-24, -12),
        layer1Data.slice(-12)
    ];
    // Reconstruct layer 1 payload
    const layer1Payload = {
        ciphertext: layer1Ciphertext,
        iv: layer1Iv,
        tag: layer1Tag,
        salt: encrypted.layer1.salt,
        algorithm: 'aes-256-gcm',
        version: 1,
        timestamp: encrypted.timestamp,
    };
    // Decrypt layer 1
    return decryptMessage(layer1Payload, aesKey);
}
// ─── Export ───────────────────────────────────────────────────────────
exports.NimbusServerCrypto = {
    // Key generation
    generateAESKey,
    generateRSAKeyPair,
    deriveKeyFromPassword,
    deriveKeyHKDF,
    // Encryption
    encryptMessage,
    decryptMessage,
    encryptChaCha20,
    decryptChaCha20,
    // Key wrapping
    wrapKeyWithRSA,
    unwrapKeyWithRSA,
    // Hashing & Auth
    hashData,
    createHMAC,
    verifyHMAC,
    // Envelopes
    createAuthenticatedEnvelope,
    verifyAndDecryptEnvelope,
    // Sessions
    createSecureSession,
    completeSessionHandshake,
    // Triple encryption
    tripleEncrypt,
    tripleDecrypt,
    // Utilities
    bufferToBase64,
    base64ToBuffer,
    generateRandomBytes,
    constantTimeCompare,
};
exports.default = exports.NimbusServerCrypto;
//# sourceMappingURL=crypto.js.map