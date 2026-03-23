/**
 * Nexo Server-Side Cryptography
 * Multi-layer encryption for server operations
 */
export interface EncryptedPayload {
    ciphertext: string;
    iv: string;
    salt: string;
    tag: string;
    algorithm: 'aes-256-gcm' | 'chacha20-poly1305';
    version: number;
    timestamp: number;
}
export interface KeyPair {
    publicKey: string;
    privateKey: string;
    publicKeyId: string;
}
export interface AuthenticatedEnvelope {
    encrypted: EncryptedPayload;
    hmac: string;
    timestamp: number;
}
declare function bufferToBase64(buffer: Buffer): string;
declare function base64ToBuffer(base64: string): Buffer;
declare function generateRandomBytes(length: number): Buffer;
declare function constantTimeCompare(a: Buffer, b: Buffer): boolean;
/**
 * Generate AES-256 key for symmetric encryption
 */
export declare function generateAESKey(): {
    key: Buffer;
    keyBase64: string;
};
/**
 * Generate RSA-4096 key pair
 */
export declare function generateRSAKeyPair(): KeyPair;
/**
 * Derive key from password using PBKDF2 with SHA-384
 */
export declare function deriveKeyFromPassword(password: string, salt: Buffer, iterations?: number): Buffer;
/**
 * Derive key using HKDF (for Perfect Forward Secrecy)
 * Note: Node.js doesn't have native HKDF, using PBKDF2 as alternative
 */
export declare function deriveKeyHKDF(inputKey: Buffer, salt: Buffer, info: Buffer, length?: number): Buffer;
/**
 * Encrypt with AES-256-GCM (primary method)
 */
export declare function encryptMessage(plaintext: string | Buffer, key: Buffer): EncryptedPayload;
/**
 * Decrypt with AES-256-GCM
 */
export declare function decryptMessage(encrypted: EncryptedPayload, key: Buffer): string;
/**
 * Encrypt with ChaCha20-Poly1305 (alternative for mobile/low-power)
 */
export declare function encryptChaCha20(plaintext: string | Buffer, key: Buffer): EncryptedPayload;
/**
 * Decrypt with ChaCha20-Poly1305
 */
export declare function decryptChaCha20(encrypted: EncryptedPayload, key: Buffer): string;
/**
 * Wrap symmetric key with RSA public key
 */
export declare function wrapKeyWithRSA(key: Buffer, publicKeyPem: string): string;
/**
 * Unwrap symmetric key with RSA private key
 */
export declare function unwrapKeyWithRSA(wrappedKeyBase64: string, privateKeyPem: string): Buffer;
/**
 * Hash with SHA-384
 */
export declare function hashData(data: string | Buffer): string;
/**
 * Create HMAC-SHA384
 */
export declare function createHMAC(data: string, key: Buffer): string;
/**
 * Verify HMAC
 */
export declare function verifyHMAC(data: string, signature: string, key: Buffer): boolean;
/**
 * Create authenticated encryption envelope
 */
export declare function createAuthenticatedEnvelope(plaintext: string, encryptionKey: Buffer, hmacKey: Buffer): AuthenticatedEnvelope;
/**
 * Verify and decrypt envelope
 */
export declare function verifyAndDecryptEnvelope(envelope: AuthenticatedEnvelope, encryptionKey: Buffer, hmacKey: Buffer): string;
/**
 * Create secure session with Perfect Forward Secrecy
 */
export declare function createSecureSession(remotePublicKeyPem: string): {
    sessionKey: Buffer;
    sessionKeyBase64: string;
    ephemeralPublicKey: string;
    wrappedSessionKey: string;
};
/**
 * Complete session handshake
 */
export declare function completeSessionHandshake(wrappedSessionKey: string, privateKeyPem: string, salt?: Buffer): Buffer;
/**
 * Triple encryption layer for maximum security
 * Combines AES-256-GCM + ChaCha20-Poly1305 + RSA wrapping
 */
export interface TripleEncryptedPayload {
    layer1: EncryptedPayload;
    layer2: EncryptedPayload;
    wrappedKey: string;
    timestamp: number;
}
export declare function tripleEncrypt(plaintext: string, rsaPublicKeyPem: string): TripleEncryptedPayload;
export declare function tripleDecrypt(encrypted: TripleEncryptedPayload, rsaPrivateKeyPem: string): string;
export declare const NexoServerCrypto: {
    generateAESKey: typeof generateAESKey;
    generateRSAKeyPair: typeof generateRSAKeyPair;
    deriveKeyFromPassword: typeof deriveKeyFromPassword;
    deriveKeyHKDF: typeof deriveKeyHKDF;
    encryptMessage: typeof encryptMessage;
    decryptMessage: typeof decryptMessage;
    encryptChaCha20: typeof encryptChaCha20;
    decryptChaCha20: typeof decryptChaCha20;
    wrapKeyWithRSA: typeof wrapKeyWithRSA;
    unwrapKeyWithRSA: typeof unwrapKeyWithRSA;
    hashData: typeof hashData;
    createHMAC: typeof createHMAC;
    verifyHMAC: typeof verifyHMAC;
    createAuthenticatedEnvelope: typeof createAuthenticatedEnvelope;
    verifyAndDecryptEnvelope: typeof verifyAndDecryptEnvelope;
    createSecureSession: typeof createSecureSession;
    completeSessionHandshake: typeof completeSessionHandshake;
    tripleEncrypt: typeof tripleEncrypt;
    tripleDecrypt: typeof tripleDecrypt;
    bufferToBase64: typeof bufferToBase64;
    base64ToBuffer: typeof base64ToBuffer;
    generateRandomBytes: typeof generateRandomBytes;
    constantTimeCompare: typeof constantTimeCompare;
};
export default NexoServerCrypto;
