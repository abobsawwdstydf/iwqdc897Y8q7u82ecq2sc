/**
 * Nexo Client - Advanced Encryption Library
 * Р СљР Р…Р С•Р С–Р С•РЎС“РЎР‚Р С•Р Р†Р Р…Р ВµР Р†Р С•Р Вµ РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р Т‘Р В»РЎРЏ Р СР В°Р С”РЎРѓР С‘Р СР В°Р В»РЎРЉР Р…Р С•Р в„– Р В±Р ВµР В·Р С•Р С—Р В°РЎРѓР Р…Р С•РЎРѓРЎвЂљР С‘
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
     * Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р С”Р В»РЎР‹РЎвЂЎР В° РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ Р С‘Р В· Р С—Р В°РЎР‚Р С•Р В»РЎРЏ
     * @param password - Р СџР В°РЎР‚Р С•Р В»РЎРЉ Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЏ
     * @param salt - Р РЋР С•Р В»РЎРЉ (Р С•Р С—РЎвЂ Р С‘Р С•Р Р…Р В°Р В»РЎРЉР Р…Р С•)
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
                hash: 'SHA-512' // Р Р€Р В»РЎС“РЎвЂЎРЎв‚¬Р ВµР Р…Р С• РЎРѓ SHA-256
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Р РЃР С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ РЎРѓ Р Р†РЎвЂ№Р В±Р С•РЎР‚Р С•Р С Р СР ВµРЎвЂљР С•Р Т‘Р В°
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
            
            // Р вЂќР В»РЎРЏ GCM Р С‘Р В·Р Р†Р В»Р ВµР С”Р В°Р ВµР С authTag Р С‘Р В· Р С—Р С•РЎРѓР В»Р ВµР Т‘Р Р…Р С‘РЎвЂ¦ 16 Р В±Р В°Р в„–РЎвЂљ
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
     * Р В Р В°РЎРѓРЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р С”Р В° РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ
     */
    async decryptMessage(data: EncryptedData): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set');
        }

        const iv = this.hexToArrayBuffer(data.iv);
        let encrypted = this.hexToArrayBuffer(data.encrypted);

        // Р вЂќР В»РЎРЏ GCM Р Т‘Р С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С authTag Р С•Р В±РЎР‚Р В°РЎвЂљР Р…Р С•
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
     * Р вЂќР Р†РЎС“РЎвЂ¦РЎвЂћР В°Р С”РЎвЂљР С•РЎР‚Р Р…Р С•Р Вµ РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ (Р Т‘Р В»РЎРЏ Р С—Р С•Р Р†РЎвЂ№РЎв‚¬Р ВµР Р…Р Р…Р С•Р в„– Р В±Р ВµР В·Р С•Р С—Р В°РЎРѓР Р…Р С•РЎРѓРЎвЂљР С‘)
     */
    async doubleEncrypt(content: string, secondPassword: string): Promise<EncryptedData> {
        // Р СџР ВµРЎР‚Р Р†РЎвЂ№Р в„– РЎС“РЎР‚Р С•Р Р†Р ВµР Р…РЎРЉ
        const first = await this.encryptMessage(content);
        
        // Р вЂ™РЎвЂљР С•РЎР‚Р С•Р в„– РЎС“РЎР‚Р С•Р Р†Р ВµР Р…РЎРЉ РЎРѓ Р Т‘РЎР‚РЎС“Р С–Р С‘Р С Р С—Р В°РЎР‚Р С•Р В»Р ВµР С
        await this.generateKey(secondPassword);
        const second = await this.encryptMessage(first.encrypted);
        
        return {
            ...second,
            method: `DOUBLE-${first.method}+${second.method}`
        };
    }

    /**
     * Р ТђРЎРЊРЎв‚¬Р С‘РЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ Р С—Р В°РЎР‚Р С•Р В»РЎРЏ (Р Т‘Р В»РЎРЏ РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ)
     */
    async hashPassword(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        return this.arrayBufferToHex(hashBuffer);
    }

    /**
     * Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ РЎРѓР В»РЎС“РЎвЂЎР В°Р в„–Р Р…Р С•Р С–Р С• Р С”Р В»РЎР‹РЎвЂЎР В°
     */
    generateRandomKey(length: number = 32): string {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return this.arrayBufferToHex(array.buffer);
    }

    /**
     * Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р В° РЎвЂ Р ВµР В»Р С•РЎРѓРЎвЂљР Р…Р С•РЎРѓРЎвЂљР С‘ Р Т‘Р В°Р Р…Р Р…РЎвЂ№РЎвЂ¦ (HMAC)
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
     * Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р В° HMAC
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
     * Р Р€РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†Р С”Р В° Р С—Р В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚Р С•Р Р† РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ
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
 * Nexo Client РЎРѓ РЎС“Р В»РЎС“РЎвЂЎРЎв‚¬Р ВµР Р…Р Р…РЎвЂ№Р С РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р ВµР С
 */
export class NexoClient {
    private config: NexoConfig;
    private crypto: NexoCrypto;

    constructor(config: NexoConfig) {
        this.config = config;
        this.crypto = new NexoCrypto();
    }

    /**
     * Р ВР Р…Р С‘РЎвЂ Р С‘Р В°Р В»Р С‘Р В·Р В°РЎвЂ Р С‘РЎРЏ РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘РЎРЏ
     */
    async initEncryption(password: string): Promise<void> {
        await this.crypto.generateKey(password);
    }

    /**
     * Р С›РЎвЂљР С—РЎР‚Р В°Р Р†Р С”Р В° Р В·Р В°РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р Р…Р С•Р С–Р С• РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ
     */
    async sendMessage(chatId: number, content: string, password?: string): Promise<any> {
        let encrypted: EncryptedData;
        
        if (password) {
            // Р вЂќР Р†РЎС“РЎвЂ¦РЎвЂћР В°Р С”РЎвЂљР С•РЎР‚Р Р…Р С•Р Вµ РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р Вµ
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
     * Р СџР С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘Р Вµ Р С‘ РЎР‚Р В°РЎРѓРЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р С”Р В° РЎРѓР С•Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎРЏ
     */
    async receiveMessage(encryptedData: EncryptedData): Promise<string> {
        return await this.crypto.decryptMessage(encryptedData);
    }

    /**
     * Р вЂ”Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° РЎвЂћР В°Р в„–Р В»Р В° РЎРѓ РЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р В°Р Р…Р С‘Р ВµР С
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
     * Р РЋР С”Р В°РЎвЂЎР С‘Р Р†Р В°Р Р…Р С‘Р Вµ Р С‘ РЎР‚Р В°РЎРѓРЎв‚¬Р С‘РЎвЂћРЎР‚Р С•Р Р†Р С”Р В° РЎвЂћР В°Р в„–Р В»Р В°
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
     * Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р В° РЎРѓР С•Р ВµР Т‘Р С‘Р Р…Р ВµР Р…Р С‘РЎРЏ
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
     * Р вЂњР ВµР Р…Р ВµРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р С•РЎвЂљРЎвЂЎРЎвЂРЎвЂљР В° Р С• Р В±Р ВµР В·Р С•Р С—Р В°РЎРѓР Р…Р С•РЎРѓРЎвЂљР С‘
     */
    generateSecurityReport(): {
        keySet: boolean;
        iterations: number;
        derivation: string;
        estimatedCrackTime: string;
    } {
        const iterations = this.crypto['iterations'];
        let crackTime = '';
        
        if (iterations >= 500000) crackTime = '> 1000 Р В»Р ВµРЎвЂљ';
        else if (iterations >= 100000) crackTime = '~ 100 Р В»Р ВµРЎвЂљ';
        else if (iterations >= 50000) crackTime = '~ 10 Р В»Р ВµРЎвЂљ';
        else crackTime = '< 1 Р С–Р С•Р Т‘Р В°';

        return {
            keySet: this.crypto['encryptionKey'] !== null,
            iterations,
            derivation: this.crypto['keyDerivation'],
            estimatedCrackTime: crackTime
        };
    }
}

/**
 * Р РЋР С•Р В·Р Т‘Р В°Р Р…Р С‘Р Вµ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°
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
