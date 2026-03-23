/**
 * Nexo Client - Advanced Encryption Library
 * РњРЅРѕРіРѕСѓСЂРѕРІРЅРµРІРѕРµ С€РёС„СЂРѕРІР°РЅРёРµ РґР»СЏ РјР°РєСЃРёРјР°Р»СЊРЅРѕР№ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё
 */

export interface NexoConfig {
    serverUrl: string;
    storageUrl?: string;
}

export interface EncryptedData {
    encrypted: string;
    iv: string;
    authTag: string;
    method: string;
    timestamp: number;
}

export class NexoCrypto {
    private encryptionKey: CryptoKey | null = null;
    private keyDerivation: 'PBKDF2' | 'Argon2' = 'PBKDF2';
    private iterations: number = 100000;

    /**
     * Р“РµРЅРµСЂР°С†РёСЏ РєР»СЋС‡Р° С€РёС„СЂРѕРІР°РЅРёСЏ РёР· РїР°СЂРѕР»СЏ
     * @param password - РџР°СЂРѕР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
     * @param salt - РЎРѕР»СЊ (РѕРїС†РёРѕРЅР°Р»СЊРЅРѕ)
     */
    async generateKey(password: string, salt?: string): Promise<void> {
        const encoder = new TextEncoder();
        const saltBytes = encoder.encode(salt || 'Nexo-salt-2026-haker_one');
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        this.encryptionKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: this.iterations,
                hash: 'SHA-512' // РЈР»СѓС‡С€РµРЅРѕ СЃ SHA-256
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * РЁРёС„СЂРѕРІР°РЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ СЃ РІС‹Р±РѕСЂРѕРј РјРµС‚РѕРґР°
     */
    async encryptMessage(content: string, method: 'AES-GCM' | 'AES-CTR' | 'AES-CBC' = 'AES-GCM'): Promise<EncryptedData> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set. Call generateKey() first.');
        }

        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        let encrypted: ArrayBuffer;
        let authTag = '';

        try {
            encrypted = await crypto.subtle.encrypt(
                { name: method, iv },
                this.encryptionKey,
                encoder.encode(content)
            );
            
            // Р”Р»СЏ GCM РёР·РІР»РµРєР°РµРј authTag РёР· РїРѕСЃР»РµРґРЅРёС… 16 Р±Р°Р№С‚
            if (method === 'AES-GCM') {
                const encBytes = new Uint8Array(encrypted);
                authTag = this.arrayBufferToHex(encBytes.slice(-16));
                encrypted = encBytes.slice(0, -16);
            }
        } catch (err) {
            throw new Error(`Encryption failed: ${err}`);
        }

        return {
            encrypted: this.arrayBufferToHex(encrypted),
            iv: this.arrayBufferToHex(iv),
            authTag,
            method,
            timestamp: Date.now()
        };
    }

    /**
     * Р Р°СЃС€РёС„СЂРѕРІРєР° СЃРѕРѕР±С‰РµРЅРёСЏ
     */
    async decryptMessage(data: EncryptedData): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set');
        }

        const iv = this.hexToArrayBuffer(data.iv);
        let encrypted = this.hexToArrayBuffer(data.encrypted);

        // Р”Р»СЏ GCM РґРѕР±Р°РІР»СЏРµРј authTag РѕР±СЂР°С‚РЅРѕ
        if (data.authTag && data.method === 'AES-GCM') {
            const encBytes = new Uint8Array(encrypted);
            const tagBytes = this.hexToArrayBuffer(data.authTag);
            const combined = new Uint8Array(encBytes.length + tagBytes.byteLength);
            combined.set(encBytes);
            combined.set(new Uint8Array(tagBytes), encBytes.length);
            encrypted = combined.buffer;
        }

        try {
            const decrypted = await crypto.subtle.decrypt(
                { name: data.method, iv: new Uint8Array(iv) },
                this.encryptionKey,
                encrypted
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (err) {
            throw new Error(`Decryption failed: ${err}`);
        }
    }

    /**
     * Р”РІСѓС…С„Р°РєС‚РѕСЂРЅРѕРµ С€РёС„СЂРѕРІР°РЅРёРµ (РґР»СЏ РїРѕРІС‹С€РµРЅРЅРѕР№ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё)
     */
    async doubleEncrypt(content: string, secondPassword: string): Promise<EncryptedData> {
        // РџРµСЂРІС‹Р№ СѓСЂРѕРІРµРЅСЊ
        const first = await this.encryptMessage(content);
        
        // Р’С‚РѕСЂРѕР№ СѓСЂРѕРІРµРЅСЊ СЃ РґСЂСѓРіРёРј РїР°СЂРѕР»РµРј
        await this.generateKey(secondPassword);
        const second = await this.encryptMessage(first.encrypted);
        
        return {
            ...second,
            method: `DOUBLE-${first.method}+${second.method}`
        };
    }

    /**
     * РҐСЌС€РёСЂРѕРІР°РЅРёРµ РїР°СЂРѕР»СЏ (РґР»СЏ С…СЂР°РЅРµРЅРёСЏ)
     */
    async hashPassword(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        return this.arrayBufferToHex(hashBuffer);
    }

    /**
     * Р“РµРЅРµСЂР°С†РёСЏ СЃР»СѓС‡Р°Р№РЅРѕРіРѕ РєР»СЋС‡Р°
     */
    generateRandomKey(length: number = 32): string {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return this.arrayBufferToHex(array.buffer);
    }

    /**
     * РџСЂРѕРІРµСЂРєР° С†РµР»РѕСЃС‚РЅРѕСЃС‚Рё РґР°РЅРЅС‹С… (HMAC)
     */
    async generateHMAC(data: string, key: string): Promise<string> {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-512' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            cryptoKey,
            encoder.encode(data)
        );

        return this.arrayBufferToHex(signature);
    }

    /**
     * РџСЂРѕРІРµСЂРєР° HMAC
     */
    async verifyHMAC(data: string, signature: string, key: string): Promise<boolean> {
        const expected = await this.generateHMAC(data, key);
        return expected === signature;
    }

    // Utilities
    private arrayBufferToHex(buffer: ArrayBuffer): string {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    private hexToArrayBuffer(hex: string): ArrayBuffer {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes.buffer;
    }

    /**
     * РЈСЃС‚Р°РЅРѕРІРєР° РїР°СЂР°РјРµС‚СЂРѕРІ С€РёС„СЂРѕРІР°РЅРёСЏ
     */
    setSecurityLevel(level: 'low' | 'medium' | 'high' | 'maximum'): void {
        switch (level) {
            case 'low':
                this.iterations = 10000;
                this.keyDerivation = 'PBKDF2';
                break;
            case 'medium':
                this.iterations = 50000;
                this.keyDerivation = 'PBKDF2';
                break;
            case 'high':
                this.iterations = 100000;
                this.keyDerivation = 'PBKDF2';
                break;
            case 'maximum':
                this.iterations = 500000;
                this.keyDerivation = 'PBKDF2';
                break;
        }
    }
}

/**
 * Nexo Client СЃ СѓР»СѓС‡С€РµРЅРЅС‹Рј С€РёС„СЂРѕРІР°РЅРёРµРј
 */
export class NexoClient {
    private config: NexoConfig;
    private crypto: NexoCrypto;

    constructor(config: NexoConfig) {
        this.config = config;
        this.crypto = new NexoCrypto();
    }

    /**
     * РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ С€РёС„СЂРѕРІР°РЅРёСЏ
     */
    async initEncryption(password: string): Promise<void> {
        await this.crypto.generateKey(password);
    }

    /**
     * РћС‚РїСЂР°РІРєР° Р·Р°С€РёС„СЂРѕРІР°РЅРЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ
     */
    async sendMessage(chatId: number, content: string, password?: string): Promise<any> {
        let encrypted: EncryptedData;
        
        if (password) {
            // Р”РІСѓС…С„Р°РєС‚РѕСЂРЅРѕРµ С€РёС„СЂРѕРІР°РЅРёРµ
            encrypted = await this.crypto.doubleEncrypt(content, password);
        } else {
            encrypted = await this.crypto.encryptMessage(content);
        }

        const response = await fetch(`${this.config.serverUrl}/api/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                content: encrypted.encrypted,
                type: 'encrypted',
                encrypted: true,
                encryptionData: encrypted
            })
        });

        return response.json();
    }

    /**
     * РџРѕР»СѓС‡РµРЅРёРµ Рё СЂР°СЃС€РёС„СЂРѕРІРєР° СЃРѕРѕР±С‰РµРЅРёСЏ
     */
    async receiveMessage(encryptedData: EncryptedData): Promise<string> {
        return await this.crypto.decryptMessage(encryptedData);
    }

    /**
     * Р—Р°РіСЂСѓР·РєР° С„Р°Р№Р»Р° СЃ С€РёС„СЂРѕРІР°РЅРёРµРј
     */
    async uploadFile(file: File, encrypt: boolean = true): Promise<{ fileId: string; fileName: string; size: number }> {
        let fileToUpload: File | Blob = file;
        
        if (encrypt && file.type.startsWith('text/') || file.type.startsWith('application/')) {
            const text = await file.text();
            const encrypted = await this.crypto.encryptMessage(text);
            fileToUpload = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);

        const response = await fetch(`${this.config.storageUrl || this.config.serverUrl}/api/storage/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        return response.json();
    }

    /**
     * РЎРєР°С‡РёРІР°РЅРёРµ Рё СЂР°СЃС€РёС„СЂРѕРІРєР° С„Р°Р№Р»Р°
     */
    async downloadFile(fileId: string, fileName: string, encrypted: boolean = false): Promise<Blob> {
        const response = await fetch(`${this.config.storageUrl || this.config.serverUrl}/api/storage/download/${fileId}`);
        
        if (!response.ok) {
            throw new Error('Download failed');
        }

        const blob = await response.blob();
        
        if (encrypted && fileName.endsWith('.enc')) {
            const text = await blob.text();
            const decrypted = await this.crypto.decryptMessage(JSON.parse(text));
            return new Blob([decrypted], { type: 'text/plain' });
        }

        return blob;
    }

    /**
     * РџСЂРѕРІРµСЂРєР° СЃРѕРµРґРёРЅРµРЅРёСЏ
     */
    async checkConnection(): Promise<{ status: string; server: string; latency: number }> {
        const start = Date.now();
        try {
            const response = await fetch(`${this.config.serverUrl}/api/health`);
            const data = await response.json();
            return { 
                status: 'connected', 
                server: this.config.serverUrl,
                latency: Date.now() - start
            };
        } catch {
            return { status: 'disconnected', server: this.config.serverUrl, latency: 0 };
        }
    }

    /**
     * Р“РµРЅРµСЂР°С†РёСЏ РѕС‚С‡С‘С‚Р° Рѕ Р±РµР·РѕРїР°СЃРЅРѕСЃС‚Рё
     */
    generateSecurityReport(): {
        keySet: boolean;
        iterations: number;
        derivation: string;
        estimatedCrackTime: string;
    } {
        const iterations = this.crypto['iterations'];
        let crackTime = '';
        
        if (iterations >= 500000) crackTime = '> 1000 Р»РµС‚';
        else if (iterations >= 100000) crackTime = '~ 100 Р»РµС‚';
        else if (iterations >= 50000) crackTime = '~ 10 Р»РµС‚';
        else crackTime = '< 1 РіРѕРґР°';

        return {
            keySet: this.crypto['encryptionKey'] !== null,
            iterations,
            derivation: this.crypto['keyDerivation'],
            estimatedCrackTime: crackTime
        };
    }
}

/**
 * РЎРѕР·РґР°РЅРёРµ РєР»РёРµРЅС‚Р°
 */
export function createNexoClient(serverUrl: string, storageUrl?: string): NexoClient {
    return new NexoClient({ serverUrl, storageUrl });
}

/**
 * Р“Р»РѕР±Р°Р»СЊРЅР°СЏ РєРѕРЅС„РёРіСѓСЂР°С†РёСЏ
 */
export const Nexo_CONFIG = {
    SERVER_URL: import.meta.env.VITE_API_URL || 'https://Nexo-msg.onrender.com',
    STORAGE_URL: import.meta.env.VITE_STORAGE_URL || undefined,
    PROTOCOL_VERSION: '3.0.0',
    AUTHOR: 'Dark Heavens',
    FEATURES: {
        encryption: true,
        doubleEncryption: true,
        hmac: true,
        distributedStorage: true,
        voiceMessages: true,
        videoCalls: true,
        stories: true,
        maxSecurityLevel: 'maximum'
    }
};
