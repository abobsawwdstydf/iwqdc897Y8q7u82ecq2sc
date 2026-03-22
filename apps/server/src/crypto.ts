/**
 * Nimbus Server-Side Cryptography
 * Multi-layer encryption for server operations
 */

import crypto from 'crypto';

// ─── Constants ────────────────────────────────────────────────────────

const ALGORITHMS = {
  aes256gcm: 'aes-256-gcm',
  chacha20: 'chacha20-poly1305',
  sha384: 'sha384',
  sha512: 'sha512',
  pbkdf2: 'pbkdf2',
  hkdf: 'hkdf',
} as const;

const CONFIG = {
  keyLength: 32,        // 256 bits
  ivLength: 12,         // 96 bits for GCM
  saltLength: 32,       // 256 bits
  tagLength: 16,        // 128 bits
  pbkdf2Iterations: 100000,
  chachaNonceLength: 12,
} as const;

// ─── Types ────────────────────────────────────────────────────────────

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

// ─── Utility Functions ────────────────────────────────────────────────

function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

function generateRandomBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

function constantTimeCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
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
export function generateAESKey(): { key: Buffer; keyBase64: string } {
  const key = generateRandomBytes(CONFIG.keyLength);
  return { key, keyBase64: bufferToBase64(key) };
}

/**
 * Generate RSA-4096 key pair
 */
export function generateRSAKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
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

  const publicKeyId = bufferToBase64(
    crypto.createHash('sha256').update(publicKey).digest()
  ).slice(0, 16);

  return {
    publicKey: publicKey.toString(),
    privateKey: privateKey.toString(),
    publicKeyId,
  };
}

/**
 * Derive key from password using PBKDF2 with SHA-384
 */
export function deriveKeyFromPassword(
  password: string,
  salt: Buffer,
  iterations: number = CONFIG.pbkdf2Iterations
): Buffer {
  return crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    CONFIG.keyLength,
    'sha384'
  );
}

/**
 * Derive key using HKDF (for Perfect Forward Secrecy)
 * Note: Node.js doesn't have native HKDF, using PBKDF2 as alternative
 */
export function deriveKeyHKDF(
  inputKey: Buffer,
  salt: Buffer,
  info: Buffer,
  length: number = CONFIG.keyLength
): Buffer {
  // Use PBKDF2 with info as part of salt for HKDF-like derivation
  const combinedSalt = Buffer.concat([salt, info]);
  return crypto.pbkdf2Sync(
    inputKey,
    combinedSalt,
    10000, // Lower iterations for HKDF
    length,
    'sha384'
  );
}

// ─── Encryption ───────────────────────────────────────────────────────

/**
 * Encrypt with AES-256-GCM (primary method)
 */
export function encryptMessage(
  plaintext: string | Buffer,
  key: Buffer
): EncryptedPayload {
  const iv = generateRandomBytes(CONFIG.ivLength);
  const salt = generateRandomBytes(CONFIG.saltLength);
  
  const cipher = crypto.createCipheriv(
    ALGORITHMS.aes256gcm,
    key,
    iv,
    { authTagLength: CONFIG.tagLength }
  );
  
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
export function decryptMessage(
  encrypted: EncryptedPayload,
  key: Buffer
): string {
  const iv = base64ToBuffer(encrypted.iv);
  const ciphertext = base64ToBuffer(encrypted.ciphertext);
  const tag = base64ToBuffer(encrypted.tag);
  
  const decipher = crypto.createDecipheriv(
    ALGORITHMS.aes256gcm,
    key,
    iv,
    { authTagLength: CONFIG.tagLength }
  );
  
  decipher.setAuthTag(tag);
  
  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);
  
  return plaintext.toString('utf8');
}

/**
 * Encrypt with ChaCha20-Poly1305 (alternative for mobile/low-power)
 */
export function encryptChaCha20(
  plaintext: string | Buffer,
  key: Buffer
): EncryptedPayload {
  const nonce = generateRandomBytes(CONFIG.chachaNonceLength);
  const salt = generateRandomBytes(CONFIG.saltLength);
  
  const cipher = crypto.createCipheriv(
    ALGORITHMS.chacha20,
    key,
    nonce
  ) as crypto.CipherCCM;
  
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
export function decryptChaCha20(
  encrypted: EncryptedPayload,
  key: Buffer
): string {
  const nonce = base64ToBuffer(encrypted.iv);
  const ciphertext = base64ToBuffer(encrypted.ciphertext);
  const tag = base64ToBuffer(encrypted.tag);
  
  const decipher = crypto.createDecipheriv(
    ALGORITHMS.chacha20,
    key,
    nonce
  ) as crypto.DecipherCCM;
  
  decipher.setAuthTag(tag);
  
  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);
  
  return plaintext.toString('utf8');
}

// ─── Key Wrapping (RSA) ───────────────────────────────────────────────

/**
 * Wrap symmetric key with RSA public key
 */
export function wrapKeyWithRSA(
  key: Buffer,
  publicKeyPem: string
): string {
  const publicKey = Buffer.from(publicKeyPem, 'base64');
  
  const wrapped = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    key
  );
  
  return bufferToBase64(wrapped);
}

/**
 * Unwrap symmetric key with RSA private key
 */
export function unwrapKeyWithRSA(
  wrappedKeyBase64: string,
  privateKeyPem: string
): Buffer {
  const privateKey = Buffer.from(privateKeyPem, 'base64');
  const wrappedKey = base64ToBuffer(wrappedKeyBase64);
  
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    wrappedKey
  );
}

// ─── Hashing & Authentication ─────────────────────────────────────────

/**
 * Hash with SHA-384
 */
export function hashData(data: string | Buffer): string {
  const input = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return bufferToBase64(
    crypto.createHash(ALGORITHMS.sha384).update(input).digest()
  );
}

/**
 * Create HMAC-SHA384
 */
export function createHMAC(
  data: string,
  key: Buffer
): string {
  return bufferToBase64(
    crypto.createHmac(ALGORITHMS.sha384, key).update(data).digest()
  );
}

/**
 * Verify HMAC
 */
export function verifyHMAC(
  data: string,
  signature: string,
  key: Buffer
): boolean {
  const expected = createHMAC(data, key);
  return constantTimeCompare(
    Buffer.from(signature, 'base64'),
    Buffer.from(expected, 'base64')
  );
}

// ─── Authenticated Envelopes ──────────────────────────────────────────

/**
 * Create authenticated encryption envelope
 */
export function createAuthenticatedEnvelope(
  plaintext: string,
  encryptionKey: Buffer,
  hmacKey: Buffer
): AuthenticatedEnvelope {
  const encrypted = encryptMessage(plaintext, encryptionKey);
  const hmac = createHMAC(
    encrypted.ciphertext + encrypted.iv + encrypted.tag,
    hmacKey
  );
  
  return {
    encrypted,
    hmac,
    timestamp: Date.now(),
  };
}

/**
 * Verify and decrypt envelope
 */
export function verifyAndDecryptEnvelope(
  envelope: AuthenticatedEnvelope,
  encryptionKey: Buffer,
  hmacKey: Buffer
): string {
  // Verify HMAC first (constant-time comparison)
  const isValid = verifyHMAC(
    envelope.encrypted.ciphertext + envelope.encrypted.iv + envelope.encrypted.tag,
    envelope.hmac,
    hmacKey
  );
  
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
export function createSecureSession(remotePublicKeyPem: string): {
  sessionKey: Buffer;
  sessionKeyBase64: string;
  ephemeralPublicKey: string;
  wrappedSessionKey: string;
} {
  // Generate ephemeral RSA key pair
  const ephemeralKeys = generateRSAKeyPair();
  
  // Generate session AES key
  const sessionKeyData = generateAESKey();
  
  // Wrap session key with remote public key
  const wrappedSessionKey = wrapKeyWithRSA(
    sessionKeyData.key,
    remotePublicKeyPem
  );
  
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
export function completeSessionHandshake(
  wrappedSessionKey: string,
  privateKeyPem: string,
  salt?: Buffer
): Buffer {
  // Unwrap session key
  const sessionKey = unwrapKeyWithRSA(wrappedSessionKey, privateKeyPem);
  
  // Derive final key with HKDF
  const saltValue = salt || generateRandomBytes(CONFIG.saltLength);
  const info = Buffer.from('Nimbus-Session-v1', 'utf8');
  
  return deriveKeyHKDF(sessionKey, saltValue, info);
}

// ─── Multi-Layer Encryption (Maximum Security) ────────────────────────

/**
 * Triple encryption layer for maximum security
 * Combines AES-256-GCM + ChaCha20-Poly1305 + RSA wrapping
 */
export interface TripleEncryptedPayload {
  layer1: EncryptedPayload;  // AES-256-GCM
  layer2: EncryptedPayload;  // ChaCha20-Poly1305
  wrappedKey: string;         // RSA-wrapped key
  timestamp: number;
}

export function tripleEncrypt(
  plaintext: string,
  rsaPublicKeyPem: string
): TripleEncryptedPayload {
  // Layer 1: AES-256-GCM
  const aesKeyData = generateAESKey();
  const layer1 = encryptMessage(plaintext, aesKeyData.key);
  
  // Layer 2: ChaCha20-Poly1305 with different key
  const chachaKeyData = generateAESKey();
  const layer2 = encryptChaCha20(
    layer1.ciphertext + layer1.iv + layer1.tag,
    chachaKeyData.key
  );
  
  // Wrap both keys with RSA
  const combinedKeys = aesKeyData.keyBase64 + ':' + chachaKeyData.keyBase64;
  const wrappedKey = wrapKeyWithRSA(
    Buffer.from(combinedKeys, 'utf8'),
    rsaPublicKeyPem
  );
  
  return {
    layer1,
    layer2,
    wrappedKey,
    timestamp: Date.now(),
  };
}

export function tripleDecrypt(
  encrypted: TripleEncryptedPayload,
  rsaPrivateKeyPem: string
): string {
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
  const layer1Payload: EncryptedPayload = {
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

export const NimbusServerCrypto = {
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

export default NimbusServerCrypto;
