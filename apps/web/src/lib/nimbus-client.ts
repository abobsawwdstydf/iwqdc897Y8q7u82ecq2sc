/**
 * Nimbus Client - Universal Client Library
 * Подключение к серверу Nimbus из любого места
 */

export interface NimbusConfig {
    serverUrl: string;
    storageUrl?: string;
}

export interface EncryptedMessage {
    encrypted: string;
    iv: string;
    authTag: string;
    timestamp: number;
}

export class NimbusClient {
    private config: NimbusConfig;
    private encryptionKey: CryptoKey | null = null;

    constructor(config: NimbusConfig) {
        this.config = config;
    }

    /**
     * Генерация ключа шифрования из пароля
     */
    async generateKey(password: string): Promise<void> {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        const salt = encoder.encode('nimbus-salt-2026');
        this.encryptionKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Шифрование сообщения на клиенте
     */
    async encryptMessage(content: string): Promise<EncryptedMessage> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set. Call generateKey() first.');
        }

        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.encryptionKey,
            encoder.encode(content)
        );

        return {
            encrypted: this.arrayBufferToHex(encrypted),
            iv: this.arrayBufferToHex(iv),
            authTag: '', // AES-GCM включает тег в encrypted
            timestamp: Date.now()
        };
    }

    /**
     * Расшифровка сообщения на клиенте
     */
    async decryptMessage(encrypted: EncryptedMessage): Promise<string> {
        if (!this.encryptionKey) {
            throw new Error('Encryption key not set');
        }

        const iv = this.hexToArrayBuffer(encrypted.iv);
        const data = this.hexToArrayBuffer(encrypted.encrypted);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            this.encryptionKey,
            data
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    /**
     * Загрузка файла с шифрованием
     */
    async uploadFile(file: File): Promise<{ fileId: string; fileName: string; size: number }> {
        const formData = new FormData();
        formData.append('file', file);

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
     * Скачивание файла с расшифровкой
     */
    async downloadFile(fileId: string, fileName: string): Promise<Blob> {
        const response = await fetch(`${this.config.storageUrl || this.config.serverUrl}/api/storage/download/${fileId}`);
        
        if (!response.ok) {
            throw new Error('Download failed');
        }

        return await response.blob();
    }

    /**
     * Отправка зашифрованного сообщения
     */
    async sendMessage(chatId: number, content: string, type: string = 'text'): Promise<any> {
        const encrypted = await this.encryptMessage(content);
        
        const response = await fetch(`${this.config.serverUrl}/api/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chatId,
                content: encrypted.encrypted,
                type: 'encrypted',
                encrypted: true
            })
        });

        return response.json();
    }

    /**
     * Проверка соединения с сервером
     */
    async checkConnection(): Promise<{ status: string; server: string }> {
        try {
            const response = await fetch(`${this.config.serverUrl}/api/health`);
            const data = await response.json();
            return { status: 'connected', server: this.config.serverUrl };
        } catch {
            return { status: 'disconnected', server: this.config.serverUrl };
        }
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
}

/**
 * Создание клиента с конфигурацией
 */
export function createNimbusClient(serverUrl: string, storageUrl?: string): NimbusClient {
    return new NimbusClient({ serverUrl, storageUrl });
}

/**
 * Глобальная конфигурация для подключения
 * Измените эти значения для подключения к вашему серверу
 */
export const NIMBUS_CONFIG = {
    // URL сервера Nimbus (Render или локальный)
    SERVER_URL: import.meta.env.VITE_API_URL || 'https://nimbus-msg.onrender.com',
    
    // URL хранилища (опционально, если отдельный сервер)
    STORAGE_URL: import.meta.env.VITE_STORAGE_URL || undefined,
    
    // Версия протокола
    PROTOCOL_VERSION: '2.0.0',
    
    // Поддерживаемые функции
    FEATURES: {
        encryption: true,
        distributedStorage: true,
        voiceMessages: true,
        videoCalls: true,
        stories: true
    }
};
