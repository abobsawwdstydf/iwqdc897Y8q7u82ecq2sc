/**
 * Nexo Cryptographic System - Simplified for Browser
 * AES-256-GCM + RSA-OAEP + PBKDF2 + SHA-384
 */

// в”Ђв”Ђв”Ђ Constants в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const NONCE_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 128;

// в”Ђв”Ђв”Ђ Types в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  tag?: string;
  algorithm: 'aes-gcm';
  version: number;
  timestamp: number;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyExported: string;
}

// в”Ђв”Ђв”Ђ Utilities в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// в”Ђв”Ђв”Ђ Key Generation в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function generateRSAKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  const publicKeyExported = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyExported: arrayBufferToBase64(publicKeyExported),
  };
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = 100000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    } as Pbkdf2Params,
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// в”Ђв”Ђв”Ђ Encryption в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export async function encryptMessage(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const iv = generateRandomBytes(NONCE_LENGTH);
  const salt = generateRandomBytes(SALT_LENGTH);
  
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: TAG_LENGTH,
    } as AesGcmParams,
    key,
    data
  );

  const ciphertext = new Uint8Array(encrypted);
  
  return {
    ciphertext: arrayBufferToBase64(ciphertext.slice(0, -16).buffer as ArrayBuffer),
    iv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    tag: arrayBufferToBase64(ciphertext.slice(-16).buffer as ArrayBuffer),
    algorithm: 'aes-gcm',
    version: 1,
    timestamp: Date.now(),
  };
}

export async function decryptMessage(
  encryptedData: EncryptedData,
  key: CryptoKey
): Promise<string> {
  const ciphertext = base64ToArrayBuffer(encryptedData.ciphertext);
  const iv = base64ToArrayBuffer(encryptedData.iv);
  const tag = encryptedData.tag ? base64ToArrayBuffer(encryptedData.tag) : null;

  const fullCiphertext = new Uint8Array(
    ciphertext.byteLength + (tag?.byteLength || 16)
  );
  fullCiphertext.set(new Uint8Array(ciphertext), 0);
  if (tag) {
    fullCiphertext.set(new Uint8Array(tag), ciphertext.byteLength);
  }

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv),
      tagLength: TAG_LENGTH,
    },
    key,
    fullCiphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// в”Ђв”Ђв”Ђ Key Exchange в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export async function wrapKeyWithRSA(
  key: CryptoKey,
  publicKey: CryptoKey
): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', key, publicKey, {
    name: 'RSA-OAEP',
  } as RsaOaepParams);
  return arrayBufferToBase64(wrapped);
}

export async function unwrapKeyWithRSA(
  wrappedKeyBase64: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  const wrappedKey = base64ToArrayBuffer(wrappedKeyBase64);
  
  return await crypto.subtle.unwrapKey(
    'raw',
    wrappedKey,
    privateKey,
    {
      name: 'RSA-OAEP',
    } as RsaOaepParams,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(exported);
}

export async function importPublicKey(base64Spki: string): Promise<CryptoKey> {
  const spkiBuffer = base64ToArrayBuffer(base64Spki);
  
  return await crypto.subtle.importKey(
    'spki',
    spkiBuffer,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'wrapKey']
  );
}

// в”Ђв”Ђв”Ђ Hashing в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export async function hashData(data: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const inputData = typeof data === 'string' ? encoder.encode(data) : new Uint8Array(data);
  
  const hash = await crypto.subtle.digest('SHA-384', inputData);
  return arrayBufferToBase64(hash);
}

// в”Ђв”Ђв”Ђ Session Management в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export async function createSecureSession(
  remotePublicKey: string
): Promise<{
  sessionKey: CryptoKey;
  ephemeralPublicKey: string;
  encryptedSessionKey: string;
}> {
  const ephemeralKeys = await generateRSAKeyPair();
  const remotePubKey = await importPublicKey(remotePublicKey);
  const sessionKey = await generateAESKey();
  
  const encryptedSessionKey = await wrapKeyWithRSA(
    sessionKey,
    remotePubKey
  );
  
  return {
    sessionKey,
    ephemeralPublicKey: ephemeralKeys.publicKeyExported,
    encryptedSessionKey,
  };
}

export async function completeSessionHandshake(
  encryptedSessionKey: string,
  privateKey: CryptoKey
): Promise<CryptoKey> {
  return await unwrapKeyWithRSA(encryptedSessionKey, privateKey);
}

// в”Ђв”Ђв”Ђ Export в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export const NexoCrypto = {
  generateAESKey,
  generateRSAKeyPair,
  deriveKeyFromPassword,
  encryptMessage,
  decryptMessage,
  wrapKeyWithRSA,
  unwrapKeyWithRSA,
  exportPublicKey,
  importPublicKey,
  hashData,
  createSecureSession,
  completeSessionHandshake,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomBytes,
};

export default NexoCrypto;
