/**
 * Nexo Storage Server - Universal
 * Хранение в Telegram/Discord - РАБОТАЕТ ВЕЗДЕ!
 * - Render
 * - VDS/VPS
 * - Локально
 * - Docker
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const Queue = require('bull');
const Redis = require('ioredis');
const crypto = require('crypto');
const cors = require('cors');

const app = express();

// ============================================
// 🔧 АВТО-КОНФИГУРАЦИЯ
// ============================================

const PORT = process.env.PORT || process.env.STORAGE_PORT || 3002;
const DB_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379';
const MASTER_KEY = getMasterKey();

function getMasterKey() {
    if (process.env.MASTER_KEY) {
        return Buffer.from(process.env.MASTER_KEY, 'hex');
    }
    // Генерируем из переменных окружения для консистентности
    const secret = process.env.JWT_SECRET || 'fallback-key';
    return crypto.createHash('sha256').update(secret).digest();
}

// ============================================
// 🗄️ БАЗА ДАННЫХ (авто-подключение)
// ============================================

function createDB() {
    if (!DB_URL) {
        console.error('❌ DATABASE_URL не указан!');
        process.exit(1);
    }
    
    return new Pool({ 
        connectionString: DB_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: DB_URL.includes('neon.tech') || DB_URL.includes('render.com') || DB_URL.includes('supabase')
            ? { rejectUnauthorized: false }
            : DB_URL.includes('ssl=true')
                ? true
                : false
    });
}

const db = createDB();

// ============================================
// 💾 REDIS (авто-подключение)
// ============================================

function createRedis() {
    const redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 200, 2000);
        }
    });
    
    redis.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
    });
    
    redis.on('connect', () => {
        console.log('✅ Redis подключён');
    });
    
    return redis;
}

const redis = createRedis();

// ============================================
// 🔐 ШИФРОВАНИЕ
// ============================================

function encryptKey(key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
    let enc = cipher.update(key, 'binary', 'hex');
    enc += cipher.final('hex');
    return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
}

function decryptKey(encrypted) {
    try {
        const [ivHex, tagHex, data] = encrypted.split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        let dec = decipher.update(data, 'hex', 'binary');
        dec += decipher.final('binary');
        return dec;
    } catch (e) {
        console.error('Decryption error:', e.message);
        return null;
    }
}

const CRYPTO_METHODS = [
    'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm',
    'aes-128-ccm', 'aes-192-ccm', 'aes-256-ccm',
    'aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc',
    'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr',
    'chacha20-poly1305',
    'aria-128-gcm', 'aria-192-gcm', 'aria-256-gcm',
    'camellia-128-gcm', 'camellia-192-gcm', 'camellia-256-gcm',
    'camellia-128-cbc'
];

function encryptChunk(data, method, key) {
    const authModes = ['gcm', 'ccm', 'poly1305'];
    const needsAuth = authModes.some(m => method.includes(m));
    const ivLength = needsAuth ? 12 : 16;
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(method, key, iv);
    let encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    if (needsAuth) {
        const authTag = cipher.getAuthTag();
        return { data: encrypted, iv, authTag };
    }
    return { data: encrypted, iv };
}

function decryptChunk(data, method, key, iv, authTag = null) {
    try {
        const needsAuth = authTag && (method.includes('gcm') || method.includes('ccm') || method.includes('poly1305'));
        const decipher = crypto.createDecipheriv(method, key, iv);
        if (needsAuth) decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch (e) {
        console.error('Decrypt error:', e.message);
        return data;
    }
}

// ============================================
// 📱 РЕСУРСЫ (авто-инициализация)
// ============================================

let tgBots = [];
let tgChannels = [];
let dcWebhooks = [];

async function initResources() {
    console.log('🔄 Инициализация ресурсов...');
    
    // Telegram боты
    if (process.env.TELEGRAM_BOT_TOKENS) {
        const tokens = process.env.TELEGRAM_BOT_TOKENS.split(',');
        for (const token of tokens) {
            try {
                const trimmed = token.trim();
                if (!trimmed) continue;
                
                // Проверяем токен
                const testBot = new TelegramBot(trimmed, { polling: false });
                const me = await testBot.getMe();
                console.log(`✅ Бот добавлен: @${me.username}`);
                
                // Сохраняем в БД
                const encrypted = encryptKey(trimmed);
                const result = await db.query(
                    'INSERT INTO telegram_bots (token) VALUES ($1) ON CONFLICT (token) DO NOTHING RETURNING id',
                    [encrypted]
                );
                
                if (result.rows.length > 0) {
                    tgBots.push({ id: result.rows[0].id, bot: testBot });
                } else {
                    testBot.destroy();
                }
            } catch (err) {
                console.error(`⚠️  Бот не добавлен: ${err.message}`);
            }
        }
    }
    
    // Telegram каналы
    if (process.env.TELEGRAM_CHANNEL_IDS) {
        const ids = process.env.TELEGRAM_CHANNEL_IDS.split(',');
        for (const id of ids) {
            try {
                const trimmed = id.trim();
                if (!trimmed) continue;
                
                await db.query(
                    'INSERT INTO telegram_channels (chat_id) VALUES ($1) ON CONFLICT (chat_id) DO NOTHING',
                    [parseInt(trimmed)]
                );
                console.log(`✅ Канал добавлен: ${trimmed}`);
            } catch (err) {
                console.error(`⚠️  Канал не добавлен: ${err.message}`);
            }
        }
        
        const chans = await db.query('SELECT id, chat_id FROM telegram_channels');
        tgChannels = chans.rows;
    }
    
    // Discord вебхуки
    if (process.env.DISCORD_WEBHOOK_URLS) {
        const urls = process.env.DISCORD_WEBHOOK_URLS.split(',');
        for (const url of urls) {
            try {
                const trimmed = url.trim();
                if (!trimmed) continue;
                
                // Проверяем вебхук
                const testWebhook = new WebhookClient({ url: trimmed });
                await testWebhook.fetchMessage('@me').catch(() => {}); // Тест
                
                const encrypted = encryptKey(trimmed);
                const result = await db.query(
                    'INSERT INTO discord_webhooks (url) VALUES ($1) ON CONFLICT (url) DO NOTHING RETURNING id',
                    [encrypted]
                );
                
                if (result.rows.length > 0) {
                    dcWebhooks.push({ id: result.rows[0].id, webhook: testWebhook });
                } else {
                    testWebhook.destroy();
                }
            } catch (err) {
                console.error(`⚠️  Вебхук не добавлен: ${err.message}`);
            }
        }
    }
    
    console.log(`📊 Ресурсы: ${tgBots.length} ботов, ${tgChannels.length} каналов, ${dcWebhooks.length} вебхуков`);
}

// ============================================
// ⚖️ БАЛАНСИРОВКА (умная)
// ============================================

async function getLeastLoaded() {
    const loads = [];
    
    for (const bot of tgBots) {
        try {
            const load = await redis.get(`load:tg:${bot.id}`).then(v => parseInt(v) || 0);
            loads.push({ type: 'telegram', id: bot.id, load });
        } catch (e) {}
    }
    
    for (const webhook of dcWebhooks) {
        try {
            const load = await redis.get(`load:dc:${webhook.id}`).then(v => parseInt(v) || 0);
            loads.push({ type: 'discord', id: webhook.id, load });
        } catch (e) {}
    }
    
    if (loads.length === 0) {
        throw new Error('No resources available - добавьте TELEGRAM_BOT_TOKENS и TELEGRAM_CHANNEL_IDS в .env');
    }
    
    loads.sort((a, b) => a.load - b.load);
    return loads[0];
}

// ============================================
// 📦 ОЧЕРЕДЬ (надёжная)
// ============================================

const sendQueue = new Queue('nexo-storage', REDIS_URL, {
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000
        },
        removeOnComplete: 100,
        removeOnFail: 1000
    }
});

sendQueue.process(async (job) => {
    const { fileId, idx, chunk, method, key, resource } = job.data;
    const { type, id } = resource;
    
    const { data: encData, iv, authTag } = encryptChunk(chunk, method, key);
    const encryptedKey = encryptKey(key);
    
    let remoteId;
    
    if (type === 'telegram') {
        const bot = tgBots.find(b => b.id === id)?.bot;
        if (!bot) throw new Error('Bot not found');
        
        const channel = tgChannels[0];
        if (!channel) throw new Error('No channels available');
        
        const msg = await bot.sendDocument(channel.chat_id, encData, { 
            caption: `${fileId}:${idx}`,
            disableNotification: true
        });
        remoteId = msg.message_id;
    } else {
        const webhook = dcWebhooks.find(w => w.id === id)?.webhook;
        if (!webhook) throw new Error('Webhook not found');
        
        const msg = await webhook.send({ 
            files: [{ attachment: encData, name: `${fileId}_${idx}.enc` }] 
        });
        remoteId = msg.id;
    }
    
    await db.query(
        `INSERT INTO chunks (file_id, chunk_index, service, bot_id, channel_id, webhook_id, remote_id, encrypted_key, encryption_method, chunk_size, iv, auth_tag)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (file_id, chunk_index) DO UPDATE SET remote_id=$7, encrypted_key=$8, encryption_method=$9, chunk_size=$10, iv=$11, auth_tag=$12`,
        [fileId, idx, type, 
         type === 'telegram' ? id : null, 
         type === 'telegram' ? tgChannels[0]?.id : null, 
         type === 'discord' ? id : null, 
         remoteId, encryptedKey, method, encData.length, 
         iv.toString('hex'), 
         authTag ? authTag.toString('hex') : null]
    );
    
    await redis.decr(`load:${type === 'telegram' ? 'tg' : 'dc'}:${id}`);
    await redis.hincrby(`file:${fileId}`, 'sent', 1);
    
    const sent = parseInt(await redis.hget(`file:${fileId}`, 'sent'));
    const total = parseInt(await redis.hget(`file:${fileId}`, 'chunks'));
    
    if (sent === total) {
        const meta = await redis.hgetall(`file:${fileId}`);
        await db.query(
            'INSERT INTO files (id, name, size, chunks) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET name=$2, size=$3, chunks=$4, updated_at=NOW()',
            [fileId, meta.name, meta.size, total]
        );
        await redis.del(`file:${fileId}`);
        console.log(`✅ Файл ${fileId} загружен (${total} чанков)`);
    }
});

// ============================================
// 🌐 API
// ============================================

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Memory storage - НИКАКИХ ФАЙЛОВ!
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 * 1024 // 50GB
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        uptime: process.uptime(),
        resources: {
            telegram_bots: tgBots.length,
            telegram_channels: tgChannels.length,
            discord_webhooks: dcWebhooks.length
        },
        queue: {
            waiting: sendQueue.count ? 'unknown' : 0
        }
    });
});

// Загрузка файла
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        const fileId = crypto.randomUUID();
        const chunkSize = parseInt(process.env.CHUNK_SIZE) || 19 * 1024 * 1024;
        
        await redis.hmset(`file:${fileId}`, {
            name: req.file.originalname,
            size: req.file.size,
            chunks: 0,
            sent: 0
        });
        await redis.expire(`file:${fileId}`, 86400);
        
        const totalChunks = Math.ceil(req.file.size / chunkSize);
        await redis.hset(`file:${fileId}`, 'chunks', totalChunks);
        
        const buffer = req.file.buffer;
        const jobs = [];
        
        for (let i = 0; i < buffer.length; i += chunkSize) {
            const chunk = buffer.slice(i, i + chunkSize);
            const resource = await getLeastLoaded();
            await redis.incr(`load:${resource.type === 'telegram' ? 'tg' : 'dc'}:${resource.id}`);
            
            const method = CRYPTO_METHODS[Math.floor(Math.random() * CRYPTO_METHODS.length)];
            const key = crypto.randomBytes(32);
            
            jobs.push(sendQueue.add({ 
                fileId, 
                idx: jobs.length, 
                chunk, 
                method, 
                key, 
                resource 
            }, {
                jobId: `${fileId}:${jobs.length}`
            }));
        }
        
        await Promise.all(jobs);
        
        console.log(`📤 ${req.file.originalname} → ${fileId} (${totalChunks} чанков)`);
        
        res.json({ 
            fileId, 
            chunks: totalChunks,
            status: 'uploading',
            message: 'Файл поставлен в очередь'
        });
    } catch (err) {
        console.error('❌ Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Скачивание файла
app.get('/download/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        const cached = await redis.exists(`file:${fileId}`);
        if (cached) {
            return res.status(409).json({ error: 'Файл ещё загружается' });
        }
        
        const file = (await db.query('SELECT * FROM files WHERE id=$1', [fileId])).rows[0];
        if (!file) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        const chunks = (await db.query(
            'SELECT * FROM chunks WHERE file_id=$1 ORDER BY chunk_index', 
            [fileId]
        )).rows;
        
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-File-Size', file.size);
        res.setHeader('X-File-Chunks', file.chunks);
        
        for (const c of chunks) {
            let encData;
            
            if (c.service === 'telegram') {
                const bot = tgBots.find(b => b.id === c.bot_id)?.bot;
                if (!bot) throw new Error('Bot not found');
                
                const channel = tgChannels.find(ch => ch.id === c.channel_id);
                if (!channel) throw new Error('Channel not found');
                
                const msg = await bot.getDocument(channel.chat_id, c.remote_id);
                const fileLink = await bot.getFileLink(msg.document.file_id);
                const resp = await fetch(fileLink);
                encData = Buffer.from(await resp.arrayBuffer());
            } else {
                const webhook = dcWebhooks.find(w => w.id === c.webhook_id)?.webhook;
                if (!webhook) throw new Error('Webhook not found');
                
                const msg = await webhook.fetchMessage(c.remote_id);
                const attach = msg.attachments.first();
                const resp = await fetch(attach.url);
                encData = Buffer.from(await resp.arrayBuffer());
            }
            
            const key = decryptKey(c.encrypted_key);
            const iv = Buffer.from(c.iv, 'hex');
            const authTag = c.auth_tag ? Buffer.from(c.auth_tag, 'hex') : null;
            
            const decrypted = decryptChunk(encData, c.encryption_method, key, iv, authTag);
            res.write(decrypted);
        }
        
        res.end();
        console.log(`📥 ${fileId} скачан`);
    } catch (err) {
        console.error('❌ Download error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
});

// Статус файла
app.get('/status/:fileId', async (req, res) => {
    try {
        const fileId = req.params.fileId;
        
        const cached = await redis.exists(`file:${fileId}`);
        if (cached) {
            const meta = await redis.hgetall(`file:${fileId}`);
            const sent = parseInt(meta.sent) || 0;
            const total = parseInt(meta.chunks) || 0;
            return res.json({ 
                fileId, 
                status: 'uploading',
                progress: total > 0 ? Math.round((sent / total) * 100) : 0,
                chunks: { sent, total }
            });
        }
        
        const file = (await db.query('SELECT * FROM files WHERE id=$1', [fileId])).rows[0];
        if (!file) {
            return res.status(404).json({ error: 'Файл не найден' });
        }
        
        res.json({ 
            fileId, 
            status: 'ready',
            name: file.name,
            size: file.size,
            chunks: file.chunks,
            created_at: file.created_at
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// 🚀 ЗАПУСК (универсальный)
// ============================================

async function createTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS files (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            size BIGINT NOT NULL,
            chunks INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    `);
    
    await db.query(`
        CREATE TABLE IF NOT EXISTS chunks (
            file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            service TEXT NOT NULL,
            bot_id INTEGER,
            channel_id BIGINT,
            webhook_id INTEGER,
            remote_id TEXT NOT NULL,
            encrypted_key TEXT NOT NULL,
            encryption_method TEXT NOT NULL,
            chunk_size INTEGER NOT NULL,
            iv TEXT NOT NULL,
            auth_tag TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (file_id, chunk_index)
        )
    `);
    
    await db.query(`
        CREATE TABLE IF NOT EXISTS telegram_bots (
            id SERIAL PRIMARY KEY,
            token TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    
    await db.query(`
        CREATE TABLE IF NOT EXISTS telegram_channels (
            id SERIAL PRIMARY KEY,
            chat_id BIGINT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    
    await db.query(`
        CREATE TABLE IF NOT EXISTS discord_webhooks (
            id SERIAL PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
    
    console.log('✅ Таблицы созданы/проверены');
}

async function start() {
    try {
        // Проверка БД
        await db.query('SELECT NOW()');
        console.log('✅ База данных подключена');
        
        // Создание таблиц
        await createTables();
        
        // Инициализация ресурсов
        await initResources();
        
        // Проверка ресурсов
        if (tgBots.length === 0 || tgChannels.length === 0) {
            console.warn('⚠️  ВНИМАНИЕ: Нет Telegram ботов или каналов!');
            console.warn('⚠️  Добавьте TELEGRAM_BOT_TOKENS и TELEGRAM_CHANNEL_IDS в .env');
        }
        
        // Запуск сервера
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║         NEXO STORAGE - UNIVERSAL (ВСЕГДА И ВЕЗДЕ)         ║
╠═══════════════════════════════════════════════════════════╣
║  Порт: ${PORT.toString().padEnd(52)}║
║  Режим: ${process.env.NODE_ENV || 'development'} ${''.padEnd(44)}║
║  Telegram ботов: ${tgBots.length.toString().padEnd(42)}║
║  Telegram каналов: ${tgChannels.length.toString().padEnd(39)}║
║  Discord вебхуков: ${dcWebhooks.length.toString().padEnd(38)}║
╠═══════════════════════════════════════════════════════════╣
║  📍 РАБОТАЕТ: Render, VDS, Docker, Local                 ║
║  💾 ХРАНЕНИЕ: Telegram + Discord (без локальных файлов)  ║
║  🔐 ШИФРОВАНИЕ: 20 методов AES/ChaCha/Aria/Camellia      ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('❌ Ошибка запуска:', err);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Остановка...');
    await redis.quit();
    await db.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Остановка (Ctrl+C)...');
    await redis.quit();
    await db.end();
    process.exit(0);
});

// Запуск
start();
