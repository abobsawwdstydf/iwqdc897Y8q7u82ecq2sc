/**
 * Nimbus Client - Advanced Encryption Library
 * Многоуровневое шифрование для максимальной безопасности
 */

export interface NimbusConfig {
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

export class NimbusCrypto {
    private encryptionKey: CryptoKey | null = null;
    private keyDerivation: 'PBKDF2' | 'Argon2' = 'PBKDF2';
    private iterations: number = 100000;

    /**
     * Генерация ключа шифрования из пароля
     * @param password - Пароль пользователя
     * @param salt - Соль (опционально)
     */
    async generateKey(password: string, salt?: string): Promise<void> {
        const encoder = new TextEncoder();
        const saltBytes = encoder.encode(salt || 'nimbus-salt-2026-haker_one');
        
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
                hash: 'SHA-512' // Улучшено с SHA-256
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Шифрование сообщения с выбором метода
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
            
            // Для GCM извлекаем authTag из последних 16 байт
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
     * Расшифровка сообщения
     */
    async decryptMessage(data: EncryptedData): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set');
        }

        const iv = this.hexToArrayBuffer(data.iv);
        let encrypted = this.hexToArrayBuffer(data.encrypted);

        // Для GCM добавляем authTag обратно
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
     * Двухфакторное шифрование (для повышенной безопасности)
     */
    async doubleEncrypt(content: string, secondPassword: string): Promise<EncryptedData> {
        // Первый уровень
        const first = await this.encryptMessage(content);
        
        // Второй уровень с другим паролем
        await this.generateKey(secondPassword);
        const second = await this.encryptMessage(first.encrypted);
        
        return {
            ...second,
            method: `DOUBLE-${first.method}+${second.method}`
        };
    }

    /**
     * Хэширование пароля (для хранения)
     */
    async hashPassword(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-512', data);
        return this.arrayBufferToHex(hashBuffer);
    }

    /**
     * Генерация случайного ключа
     */
    generateRandomKey(length: number = 32): string {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return this.arrayBufferToHex(array.buffer);
    }

    /**
     * Проверка целостности данных (HMAC)
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
     * Проверка HMAC
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
     * Установка параметров шифрования
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
 * Nimbus Client с улучшенным шифрованием
 */
export class NimbusClient {
    private config: NimbusConfig;
    private crypto: NimbusCrypto;

    constructor(config: NimbusConfig) {
        this.config = config;
        this.crypto = new NimbusCrypto();
    }

    /**
     * Инициализация шифрования
     */
    async initEncryption(password: string): Promise<void> {
        await this.crypto.generateKey(password);
    }

    /**
     * Отправка зашифрованного сообщения
     */
    async sendMessage(chatId: number, content: string, password?: string): Promise<any> {
        let encrypted: EncryptedData;
        
        if (password) {
            // Двухфакторное шифрование
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
     * Получение и расшифровка сообщения
     */
    async receiveMessage(encryptedData: EncryptedData): Promise<string> {
        return await this.crypto.decryptMessage(encryptedData);
    }

    /**
     * Загрузка файла с шифрованием
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
     * Скачивание и расшифровка файла
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
     * Проверка соединения
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
     * Генерация отчёта о безопасности
     */
    generateSecurityReport(): {
        keySet: boolean;
        iterations: number;
        derivation: string;
        estimatedCrackTime: string;
    } {
        const iterations = this.crypto['iterations'];
        let crackTime = '';
        
        if (iterations >= 500000) crackTime = '> 1000 лет';
        else if (iterations >= 100000) crackTime = '~ 100 лет';
        else if (iterations >= 50000) crackTime = '~ 10 лет';
        else crackTime = '< 1 года';

        return {
            keySet: this.crypto['encryptionKey'] !== null,
            iterations,
            derivation: this.crypto['keyDerivation'],
            estimatedCrackTime: crackTime
        };
    }
}

/**
 * Создание клиента
 */
export function createNimbusClient(serverUrl: string, storageUrl?: string): NimbusClient {
    return new NimbusClient({ serverUrl, storageUrl });
}

/**
 * Глобальная конфигурация
 */
export const NIMBUS_CONFIG = {
    SERVER_URL: import.meta.env.VITE_API_URL || 'https://nimbus-msg.onrender.com',
    STORAGE_URL: import.meta.env.VITE_STORAGE_URL || undefined,
    PROTOCOL_VERSION: '3.0.0',
    AUTHOR: 'haker_one',
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
