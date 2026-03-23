/**
 * Nexo Database Manager
 * Поддержка нескольких баз данных с шифрованием
 */

const { Pool } = require('pg');
const crypto = require('crypto');

class DatabaseManager {
    constructor() {
        this.pools = new Map();
        this.primaryPool = null;
        this.encryptionKey = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') : null;
        this.encryptionEnabled = process.env.DB_ENCRYPTION_ENABLED === 'true';
    }

    /**
     * Инициализация всех баз данных
     */
    async initialize() {
        console.log('🗄️  Инициализация баз данных...');

        // Основная база
        const primaryUrl = process.env.DATABASE_URL;
        if (!primaryUrl) {
            throw new Error('DATABASE_URL не указан в .env');
        }

        this.primaryPool = this.createPool(primaryUrl, 'primary');
        this.pools.set('primary', this.primaryPool);

        // Проверяем подключение
        try {
            await this.primaryPool.query('SELECT NOW()');
            console.log('✅ Основная база данных подключена');
        } catch (err) {
            console.error('❌ Ошибка подключения к основной базе:', err.message);
            throw err;
        }

        // Дополнительные базы
        const secondaryUrls = process.env.SECONDARY_DATABASES;
        if (secondaryUrls) {
            const urls = secondaryUrls.split(',');
            for (let i = 0; i < urls.length; i++) {
                const url = urls[i].trim();
                if (url) {
                    const name = `secondary_${i}`;
                    const pool = this.createPool(url, name);
                    this.pools.set(name, pool);
                    try {
                        await pool.query('SELECT NOW()');
                        console.log(`✅ Дополнительная база ${name} подключена`);
                    } catch (err) {
                        console.warn(`⚠️  База ${name} недоступна:`, err.message);
                    }
                }
            }
        }

        console.log(`📊 Всего баз данных: ${this.pools.size}`);
    }

    /**
     * Создание пула подключений
     */
    createPool(url, name) {
        const pool = new Pool({
            connectionString: url,
            ssl: url.includes('neon.tech') || url.includes('render.com') 
                ? { rejectUnauthorized: false } 
                : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        pool.on('error', (err) => {
            console.error(`[DB ${name}] Unexpected error:`, err);
        });

        return pool;
    }

    /**
     * Получить пул по имени
     */
    getPool(name = 'primary') {
        return this.pools.get(name) || this.primaryPool;
    }

    /**
     * Получить основную базу
     */
    getPrimary() {
        return this.primaryPool;
    }

    /**
     * Получить все пулы
     */
    getAllPools() {
        return Array.from(this.pools.entries());
    }

    /**
     * Шифрование текста
     */
    encrypt(text) {
        if (!this.encryptionEnabled || !this.encryptionKey || !text) return text;
        
        try {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
            let enc = cipher.update(text, 'utf8', 'hex');
            enc += cipher.final('hex');
            const authTag = cipher.getAuthTag().toString('hex');
            return `${iv.toString('hex')}:${authTag}:${enc}`;
        } catch (err) {
            console.error('Encryption error:', err);
            return text;
        }
    }

    /**
     * Расшифровка текста
     */
    decrypt(encrypted) {
        if (!this.encryptionEnabled || !this.encryptionKey || !encrypted) return encrypted;
        
        try {
            const [ivHex, tagHex, data] = encrypted.split(':');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivHex, 'hex'));
            decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
            let dec = decipher.update(data, 'hex', 'utf8');
            dec += decipher.final('utf8');
            return dec;
        } catch (err) {
            console.error('Decryption error:', err);
            return encrypted;
        }
    }

    /**
     * Шифрование объекта
     */
    encryptObject(obj, fields = ['content', 'quote', 'message']) {
        if (!obj || typeof obj !== 'object') return obj;
        
        const encrypted = { ...obj };
        for (const field of fields) {
            if (encrypted[field] && typeof encrypted[field] === 'string') {
                encrypted[field] = this.encrypt(encrypted[field]);
            }
        }
        return encrypted;
    }

    /**
     * Расшифровка объекта
     */
    decryptObject(obj, fields = ['content', 'quote', 'message']) {
        if (!obj || typeof obj !== 'object') return obj;
        
        const decrypted = { ...obj };
        for (const field of fields) {
            if (decrypted[field] && typeof decrypted[field] === 'string') {
                decrypted[field] = this.decrypt(decrypted[field]);
            }
        }
        return decrypted;
    }

    /**
     * Закрыть все подключения
     */
    async close() {
        console.log('🛑 Закрытие подключений к базам данных...');
        for (const [name, pool] of this.pools.entries()) {
            await pool.end();
            console.log(`✅ База ${name} закрыта`);
        }
        this.pools.clear();
        this.primaryPool = null;
    }
}

// Экспорт единственного экземпляра
const dbManager = new DatabaseManager();
module.exports = { dbManager };
