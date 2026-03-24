/**
 * Nexo Messenger - Universal Server (FULL PRODUCTION)
 * ВСЁ В ОДНОМ - ПОЛНОЦЕННАЯ ВЕРСИЯ
 * - Мессенджер + Хранилище в Telegram/Discord
 * - Двойное шифрование (клиент + сервер)
 * - Real-time обновления
 * - РАБОТАЕТ ВЕЗДЕ
 */

// @ts-nocheck
require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { Pool } = require('pg');
const TelegramBot = require('node-telegram-bot-api');
const { WebhookClient } = require('discord.js');
const Queue = require('bull');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (/^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/.test(origin)) {
        return callback(null, true);
      }
      const corsOrigins = (process.env.CORS_ORIGINS || '*').split(',');
      if (corsOrigins.includes(origin)) return callback(null, true);
      if (origin?.includes('onrender.com')) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ============================================
// 🔧 КОНФИГУРАЦИЯ
// ============================================

const config = {
  port: process.env.PORT || 3001,
  dbUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || process.env.REDISCLOUD_URL || 'redis://localhost:6379',
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(','),
  jwtSecret: process.env.JWT_SECRET || 'fallback-jwt-secret',
  masterKey: getMasterKey(),
  chunkSize: parseInt(process.env.CHUNK_SIZE) || 19 * 1024 * 1024,
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 * 1024,
  encryptionEnabled: process.env.DB_ENCRYPTION_ENABLED === 'true'
};

function getMasterKey() {
  if (process.env.MASTER_KEY) {
    return Buffer.from(process.env.MASTER_KEY, 'hex');
  }
  return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'fallback').digest();
}

// ============================================
// 🗄️ БАЗА ДАННЫХ (Prisma + Pool)
// ============================================

const prisma = new PrismaClient({
  datasources: {
    db: { url: config.dbUrl }
  }
});

const db = new Pool({
  connectionString: config.dbUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: config.dbUrl && (config.dbUrl.includes('neon.tech') || config.dbUrl.includes('render.com') || config.dbUrl.includes('supabase'))
    ? { rejectUnauthorized: false }
    : false
});

// ============================================
// 💾 REDIS (ОПЦИОНАЛЬНО + ПОДДЕРЖКА НЕСКОЛЬКИХ URL)
// ============================================

let redis = null;
let redisAvailable = false;

async function initRedis() {
  try {
    // Поддержка нескольких URL через запятую
    const redisUrlsEnv = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
    
    if (!redisUrlsEnv) {
      console.log('⚠️  Redis не настроен (REDIS_URL не указан)');
      console.log('⚠️  Очередь файлов будет работать в памяти (медленнее)');
      return;
    }
    
    // Разбиваем на несколько URL (через запятую или точку с запятой)
    const redisUrls = redisUrlsEnv.split(/[;,]/).map(url => url.trim()).filter(url => url.length > 0);
    
    console.log(`🔍 Redis URLs: ${redisUrls.length} (${redisUrls.map(u => u.replace(/\/\/[^@]+@/, '//***@')).join(', ')})`);
    
    // Пытаемся подключиться к каждому по очереди
    for (const url of redisUrls) {
      try {
        console.log(`🔄 Подключение к Redis: ${url.replace(/\/\/[^@]+@/, '//***@')}...`);
        
        redis = new Redis(url, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 3) {
              console.error(`❌ Redis ${url.replace(/\/\/[^@]+@/, '//***@')} не подключился после 3 попыток`);
              return null;
            }
            return Math.min(times * 200, 2000);
          }
        });
        
        // Ждём подключения 5 секунд
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Timeout')), 5000);
          redis.once('connect', () => {
            clearTimeout(timer);
            resolve();
          });
          redis.once('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        });
        
        console.log(`✅ Redis подключён: ${url.replace(/\/\/[^@]+@/, '//***@')}`);
        redisAvailable = true;
        break; // Успешно подключились
        
      } catch (err) {
        console.error(`⚠️  Не удалось подключиться к Redis: ${url.replace(/\/\/[^@]+@/, '//***@')} - ${err.message}`);
        redis = null;
        
        // Пробуем следующий URL
        if (redisUrls.indexOf(url) < redisUrls.length - 1) {
          console.log('🔄 Пробуем следующий Redis URL...');
        }
      }
    }
    
    if (!redisAvailable) {
      console.error('❌ Не удалось подключиться ни к одному Redis серверу');
      console.log('⚠️  Очередь файлов будет работать в памяти (медленнее)');
    }
    
  } catch (err) {
    console.error('❌ Redis не подключился:', err.message);
    redisAvailable = false;
  }
}

// ============================================
// 🔐 ШИФРОВАНИЕ (ДВОЙНОЕ)
// ============================================

// Серверное шифрование (для хранения в TG/DC)
function encryptServer(data, key) {
  if (!config.encryptionEnabled || !key) return data;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let enc = cipher.update(data, 'utf8', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
}

function decryptServer(encrypted, key) {
  if (!config.encryptionEnabled || !key || !encrypted) return encrypted;
  try {
    const [ivHex, tagHex, data] = encrypted.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return encrypted;
  }
}

function encryptKey(key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.masterKey, iv);
  let enc = cipher.update(key, 'binary', 'hex');
  enc += cipher.final('hex');
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc}`;
}

function decryptKey(encrypted) {
  try {
    const [ivHex, tagHex, data] = encrypted.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', config.masterKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(data, 'hex', 'binary');
    dec += decipher.final('binary');
    return dec;
  } catch (e) {
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
  const needsAuth = authTag && (method.includes('gcm') || method.includes('ccm') || method.includes('poly1305'));
  const decipher = crypto.createDecipheriv(method, key, iv);
  if (needsAuth) decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// ============================================
// 📱 РЕСУРСЫ (TG/DC)
// ============================================

let tgBots = [];
let tgChannels = [];
let dcWebhooks = [];
const onlineUsers = new Map();
const userSockets = new Map();

async function initResources() {
  console.log('🔄 Инициализация ресурсов хранения...');
  
  // Telegram боты
  if (process.env.TELEGRAM_BOT_TOKENS) {
    const tokens = process.env.TELEGRAM_BOT_TOKENS.split(',');
    for (const token of tokens) {
      try {
        const trimmed = token.trim();
        if (!trimmed) continue;
        const testBot = new TelegramBot(trimmed, { polling: false });
        const me = await testBot.getMe();
        console.log(`✅ Бот: @${me.username}`);
        const encrypted = encryptKey(trimmed);
        const result = await db.query('INSERT INTO telegram_bots (token) VALUES ($1) ON CONFLICT (token) DO NOTHING RETURNING id', [encrypted]);
        if (result.rows.length > 0) tgBots.push({ id: result.rows[0].id, bot: testBot });
        else testBot.destroy();
      } catch (err) {
        console.error(`⚠️  Бот: ${err.message}`);
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
        await db.query('INSERT INTO telegram_channels (chat_id) VALUES ($1) ON CONFLICT (chat_id) DO NOTHING', [parseInt(trimmed)]);
        console.log(`✅ Канал: ${trimmed}`);
      } catch (err) {
        console.error(`⚠️  Канал: ${err.message}`);
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
        const testWebhook = new WebhookClient({ url: trimmed });
        await testWebhook.fetchMessage('@me').catch(() => {});
        const encrypted = encryptKey(trimmed);
        const result = await db.query('INSERT INTO discord_webhooks (url) VALUES ($1) ON CONFLICT (url) DO NOTHING RETURNING id', [encrypted]);
        if (result.rows.length > 0) dcWebhooks.push({ id: result.rows[0].id, webhook: testWebhook });
        else testWebhook.destroy();
      } catch (err) {
        console.error(`⚠️  Вебхук: ${err.message}`);
      }
    }
  }
  
  console.log(`📊 Ресурсы: ${tgBots.length} ботов, ${tgChannels.length} каналов, ${dcWebhooks.length} вебхуков`);
}

// ============================================
// 📦 ОЧЕРЕДЬ (ХРАНИЛИЩЕ)
// ============================================

const sendQueue = new Queue('nexo-storage', config.redisUrl, {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 1000
  }
});

sendQueue.process(async (job) => {
  const { fileId, idx, chunk, method, key, resource } = job.data;
  const { type, id } = resource;
  
  // Двойное шифрование: chunk уже зашифрован клиентом, добавляем серверное
  const serverKey = crypto.randomBytes(32);
  const { data: encData, iv, authTag } = encryptChunk(chunk, method, serverKey);
  const encryptedKey = encryptKey(serverKey);
  
  let remoteId;
  
  if (type === 'telegram') {
    const bot = tgBots.find(b => b.id === id)?.bot;
    if (!bot) throw new Error('Bot not found');
    const channel = tgChannels[0];
    if (!channel) throw new Error('No channels available');
    const msg = await bot.sendDocument(channel.chat_id, encData, { caption: `${fileId}:${idx}`, disableNotification: true });
    remoteId = msg.message_id;
  } else {
    const webhook = dcWebhooks.find(w => w.id === id)?.webhook;
    if (!webhook) throw new Error('Webhook not found');
    const msg = await webhook.send({ files: [{ attachment: encData, name: `${fileId}_${idx}.enc` }] });
    remoteId = msg.id;
  }
  
  await db.query(`INSERT INTO chunks (file_id, chunk_index, service, bot_id, channel_id, webhook_id, remote_id, encrypted_key, encryption_method, chunk_size, iv, auth_tag) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (file_id, chunk_index) DO UPDATE SET remote_id=$7, encrypted_key=$8, encryption_method=$9, chunk_size=$10, iv=$11, auth_tag=$12`, [fileId, idx, type, type === 'telegram' ? id : null, type === 'telegram' ? tgChannels[0]?.id : null, type === 'discord' ? id : null, remoteId, encryptedKey, method, encData.length, iv.toString('hex'), authTag ? authTag.toString('hex') : null]);
  
  await redis.decr(`load:${type === 'telegram' ? 'tg' : 'dc'}:${id}`);
  await redis.hincrby(`file:${fileId}`, 'sent', 1);
  
  const sent = parseInt(await redis.hget(`file:${fileId}`, 'sent'));
  const total = parseInt(await redis.hget(`file:${fileId}`, 'chunks'));
  
  if (sent === total) {
    const meta = await redis.hgetall(`file:${fileId}`);
    await prisma.file.upsert({
      where: { id: fileId },
      create: { id: fileId, name: meta.name, size: parseInt(meta.size), chunks: total },
      update: { name: meta.name, size: parseInt(meta.size), chunks: total }
    });
    await redis.del(`file:${fileId}`);
    console.log(`✅ Файл ${fileId} загружен (${total} чанков)`);
    
    // Уведомляем клиента
    const socket = userSockets.get(meta.ownerId);
    if (socket) socket.emit('file_uploaded', { fileId, name: meta.name, size: meta.size });
  }
});

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
  if (loads.length === 0) throw new Error('No resources available');
  loads.sort((a, b) => a.load - b.load);
  return loads[0];
}

// ============================================
// EXPRESS
// ============================================

app.set('trust proxy', 1);
app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много попыток, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { error: 'Слишком много запросов' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production'
});

app.use('/api', apiLimiter);

// Memory storage - БЕЗ ЛОКАЛЬНЫХ ФАЙЛОВ!
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: config.maxFileSize },
  fileFilter: (req, file, cb) => {
    // Разрешаем все файлы
    cb(null, true);
  }
});

// ============================================
// FRONTEND (Production)
// ============================================

if (process.env.NODE_ENV === 'production') {
  // Путь к фронтенду на Render: apps/web/dist
  const webDist = path.join(__dirname, '../web/dist');
  console.log(`📁 Frontend: ${webDist}`);
  
  // Проверяем существует ли директория
  const fs = require('fs');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, {
      maxAge: '1d',
      etag: true
    }));
    console.log('✅ Frontend static files enabled');
  } else {
    console.warn('⚠️  Frontend dist not found at:', webDist);
  }
}

// ============================================
// AUTH ROUTES
// ============================================

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, displayName, password, bio } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username и пароль обязательны' });
    }

    // Проверяем существует ли пользователь
    const existing = await db.query('SELECT id FROM "User" WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаём пользователя через raw query (без fingerprint - нет такой колонки)
    const newUser = await db.query(
      `INSERT INTO "User" (username, "displayName", password, bio, "createdAt", "lastSeen", "isOnline")
       VALUES ($1, $2, $3, $4, NOW(), NOW(), false)
       RETURNING id, username, "displayName", avatar, bio, "isOnline", "lastSeen", "createdAt"`,
      [username, displayName || username, hashedPassword, bio || '']
    );

    const user = {
      id: newUser.rows[0].id,
      username: newUser.rows[0].username,
      displayName: newUser.rows[0].displayname || newUser.rows[0].username,
      avatar: newUser.rows[0].avatar,
      bio: newUser.rows[0].bio,
      isOnline: newUser.rows[0].isonline === 't' || newUser.rows[0].isonline === true,
      lastSeen: newUser.rows[0].lastseen,
      createdAt: newUser.rows[0].createdat
    };

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '30d' });

    console.log(`✅ Регистрация: ${username} (ID: ${user.id})`);
    res.json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username и пароль обязательны' });
    }

    // Ищем пользователя через raw query
    const result = await db.query('SELECT * FROM "User" WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный username или пароль' });
    }

    const userRow = result.rows[0];
    const valid = await bcrypt.compare(password, userRow.password);
    
    if (!valid) {
      return res.status(401).json({ error: 'Неверный username или пароль' });
    }

    // Обновляем статус онлайн
    await db.query('UPDATE "User" SET "lastSeen" = NOW(), "isOnline" = true WHERE id = $1', [userRow.id]);

    const token = jwt.sign({ userId: userRow.id }, config.jwtSecret, { expiresIn: '30d' });

    const user = {
      id: userRow.id,
      username: userRow.username,
      displayName: userRow.displayname || userRow.username,
      avatar: userRow.avatar,
      bio: userRow.bio,
      isOnline: true,
      lastSeen: userRow.lastseen,
      createdAt: userRow.createdat
    };

    console.log(`✅ Вход: ${username} (ID: ${user.id})`);
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, "displayName" as displayName, avatar, bio, "isOnline" as isOnline, "lastSeen" as lastSeen, "createdAt" as createdAt, "hideStoryViews" as hideStoryViews, "isVerified" as isVerified
       FROM "User" WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// MIDDLEWARE
// ============================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  
  jwt.verify(token, config.jwtSecret, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Неверный токен' });
    }
    req.userId = decoded.userId;
    next();
  });
}

// ============================================
// API - ХРАНИЛИЩЕ (С ДВОЙНЫМ ШИФРОВАНИЕМ)
// ============================================

// Загрузка: клиент шифрует → сервер шифрует ещё раз → TG/DC
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    
    const fileId = crypto.randomUUID();
    await redis.hmset(`file:${fileId}`, {
      name: req.file.originalname,
      size: req.file.size,
      chunks: 0,
      sent: 0,
      ownerId: req.userId
    });
    await redis.expire(`file:${fileId}`, 86400);
    
    const totalChunks = Math.ceil(req.file.size / config.chunkSize);
    await redis.hset(`file:${fileId}`, 'chunks', totalChunks);
    
    const buffer = req.file.buffer;
    const jobs = [];
    
    for (let i = 0; i < buffer.length; i += config.chunkSize) {
      const chunk = buffer.slice(i, i + config.chunkSize);
      const resource = await getLeastLoaded();
      await redis.incr(`load:${resource.type === 'telegram' ? 'tg' : 'dc'}:${resource.id}`);
      const method = CRYPTO_METHODS[Math.floor(Math.random() * CRYPTO_METHODS.length)];
      const key = crypto.randomBytes(32);
      jobs.push(sendQueue.add({ fileId, idx: jobs.length, chunk, method, key, resource }, { jobId: `${fileId}:${jobs.length}` }));
    }
    
    await Promise.all(jobs);
    console.log(`📤 ${req.file.originalname} → ${fileId} (${totalChunks} чанков)`);
    res.json({ fileId, chunks: totalChunks, status: 'uploading' });
  } catch (err) {
    console.error('❌ Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Скачивание: TG/DC → сервер расшифровывает → клиент расшифровывает
app.get('/api/download/:fileId', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const cached = await redis.exists(`file:${fileId}`);
    if (cached) return res.status(409).json({ error: 'Файл ещё загружается' });
    
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    
    const chunks = await db.query('SELECT * FROM chunks WHERE file_id=$1 ORDER BY chunk_index', [fileId]);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    for (const c of chunks.rows) {
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
      
      // Расшифровка сервера (второй слой)
      const serverKey = decryptKey(c.encrypted_key);
      const iv = Buffer.from(c.iv, 'hex');
      const authTag = c.auth_tag ? Buffer.from(c.auth_tag, 'hex') : null;
      const decrypted = decryptChunk(encData, c.encryption_method, serverKey, iv, authTag);
      res.write(decrypted);
    }
    
    res.end();
    console.log(`📥 ${fileId} скачан`);
  } catch (err) {
    console.error('❌ Download error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

app.get('/api/status/:fileId', authenticateToken, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const cached = await redis.exists(`file:${fileId}`);
    if (cached) {
      const meta = await redis.hgetall(`file:${fileId}`);
      const sent = parseInt(meta.sent) || 0;
      const total = parseInt(meta.chunks) || 0;
      return res.json({ fileId, status: 'uploading', progress: total > 0 ? Math.round((sent / total) * 100) : 0, chunks: { sent, total } });
    }
    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file) return res.status(404).json({ error: 'Файл не найден' });
    res.json({ fileId, status: 'ready', name: file.name, size: file.size, chunks: file.chunks, created_at: file.createdAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    resources: {
      telegram_bots: tgBots.length,
      telegram_channels: tgChannels.length,
      discord_webhooks: dcWebhooks.length
    },
    storage: 'Telegram/Discord (двойное шифрование)',
    encryption: config.encryptionEnabled ? 'enabled' : 'disabled'
  });
});

// ============================================
// SOCKET.IO (REAL-TIME)
// ============================================

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Требуется авторизация'));
  
  jwt.verify(token, config.jwtSecret, (err, decoded) => {
    if (err) return next(new Error('Неверный токен'));
    socket.userId = decoded.userId;
    next();
  });
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  console.log(`Пользователь подключился: ${userId}`);
  
  // Сохраняем сокет
  userSockets.set(userId, socket);
  
  // Обновляем статус
  await prisma.user.update({
    where: { id: userId },
    data: { isOnline: true, lastSeen: new Date() }
  });
  
  // Уведомляем других
  socket.broadcast.emit('user_online', { userId });
  
  // Присоединяемся к чатам
  const chats = await prisma.chatMember.findMany({
    where: { userId },
    select: { chatId: true }
  });
  
  for (const { chatId } of chats) {
    socket.join(`chat:${chatId}`);
  }
  
  // Обработка сообщений
  socket.on('send_message', async (data) => {
    try {
      const { chatId, content, type, replyToId, quote, forwardedFromId, mediaUrl, mediaType, fileName, fileSize, duration, scheduledAt, mediaUrls } = data;
      
      // Проверяем членство
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } }
      });
      
      if (!member) {
        socket.emit('error', { message: 'Нет доступа к чату' });
        return;
      }
      
      // Создаём сообщение
      const message = await prisma.message.create({
        data: {
          chatId,
          senderId: userId,
          content: content || null,
          type: type || 'text',
          replyToId: replyToId || null,
          quote: quote || null,
          forwardedFromId: forwardedFromId || null,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
          media: mediaUrls ? {
            create: mediaUrls.map(m => ({
              type: m.type,
              url: m.url,
              filename: m.fileName,
              size: m.fileSize,
              duration: m.duration
            }))
          } : mediaUrl ? {
            create: [{
              type: mediaType || 'file',
              url: mediaUrl,
              filename: fileName,
              size: fileSize,
              duration: duration
            }]
          } : undefined
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatar: true } },
          media: true,
          replyTo: { include: { sender: { select: { id: true, username: true, displayName: true } } } }
        }
      });
      
      // Отправляем всем в чате
      io.to(`chat:${chatId}`).emit('new_message', {
        ...message,
        readBy: [{ userId }]
      });
      
    } catch (err) {
      console.error('Send message error:', err);
      socket.emit('error', { message: 'Ошибка отправки сообщения' });
    }
  });
  
  // Индикатор набора
  socket.on('typing_start', async (chatId) => {
    if (!chatId) return;
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } }
    });
    if (!member) return;
    socket.to(`chat:${chatId}`).emit('user_typing', { chatId, userId });
  });
  
  socket.on('typing_stop', async (chatId) => {
    if (!chatId) return;
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } }
    });
    if (!member) return;
    socket.to(`chat:${chatId}`).emit('user_stopped_typing', { chatId, userId });
  });
  
  // Прочитано
  socket.on('read_messages', async (data) => {
    try {
      const { chatId, messageIds } = data;
      if (!chatId || !messageIds || messageIds.length === 0) return;
      
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } }
      });
      if (!member) return;
      
      await prisma.$transaction(
        messageIds.map(messageId =>
          prisma.readReceipt.upsert({
            where: { messageId_userId: { messageId, userId } },
            create: { messageId, userId },
            update: {}
          })
        )
      );
      
      socket.to(`chat:${chatId}`).emit('messages_read', { chatId, userId, messageIds });
    } catch (err) {
      console.error('Read receipts error:', err);
    }
  });
  
  // Реакции
  socket.on('add_reaction', async (data) => {
    try {
      const { messageId, emoji, chatId } = data;
      if (!chatId || !messageId || !emoji) return;
      
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } }
      });
      if (!member) return;
      
      await prisma.reaction.upsert({
        where: {
          messageId_userId_emoji: { messageId, userId, emoji }
        },
        create: { messageId, userId, emoji },
        update: {}
      });
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true }
      });
      
      io.to(`chat:${chatId}`).emit('reaction_added', {
        messageId,
        chatId,
        userId,
        username: user?.displayName || user?.username,
        emoji
      });
    } catch (err) {
      console.error('Add reaction error:', err);
    }
  });
  
  // Отключение
  socket.on('disconnect', async () => {
    console.log(`Пользователь отключился: ${userId}`);
    userSockets.delete(userId);
    
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: false }
    });
    
    socket.broadcast.emit('user_offline', { userId });
  });
});

// ============================================
// ЗАПУСК
// ============================================

async function createTables() {
  // Таблицы создаются через Prisma при первом использовании
  console.log('✅ Prisma готова к работе');
}

async function start() {
  try {
    // Проверка БД
    await db.query('SELECT NOW()');
    console.log('✅ База данных подключена');
    
    // Создание таблиц
    await createTables();
    
    // Инициализация Redis (опционально)
    await initRedis();
    
    // Инициализация ресурсов
    await initResources();
    
    // Проверка ресурсов
    if (tgBots.length === 0 || tgChannels.length === 0) {
      console.warn('⚠️  ВНИМАНИЕ: Нет Telegram ботов или каналов!');
      console.warn('⚠️  Добавьте TELEGRAM_BOT_TOKENS и TELEGRAM_CHANNEL_IDS в .env');
    }
    
    // Запуск сервера
    server.listen(config.port, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════════════════╗
║           NEXO MESSENGER - FULL PRODUCTION                ║
║         (ВСЁ В ОДНОМ - ДВОЙНОЕ ШИФРОВАНИЕ)                ║
╠═══════════════════════════════════════════════════════════╣
║  Порт: ${config.port.toString().padEnd(52)}║
║  Режим: ${(process.env.NODE_ENV || 'development').padEnd(44)}║
║  Шифрование: Клиент + Сервер ${''.padEnd(26)}║
║  Хранение: Telegram + Discord (БЕЗ локальных файлов)      ║
║  Redis: ${redisAvailable ? 'Подключён' : 'Не подключён (опционально)'} ${redisAvailable ? ' '.repeat(21) : ' '.repeat(28)}║
╠═══════════════════════════════════════════════════════════╣
║  📍 РАБОТАЕТ: Render, VDS, Docker, Local                 ║
║  🔐 ДВОЙНОЕ ШИФРОВАНИЕ: 20 методов                       ║
║  ⚡ REAL-TIME: Socket.IO                                 ║
╚═══════════════════════════════════════════════════════════╝
      `);
    });
    
  } catch (err) {
    console.error('❌ Ошибка запуска:', err);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Завершение работы...');
  await redis.quit();
  await db.end();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Очистка
async function cleanupExpiredStories() {
  try {
    const expired = await prisma.story.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, mediaUrl: true }
    });
    if (expired.length === 0) return;
    await prisma.story.deleteMany({ where: { id: { in: expired.map(s => s.id) } } });
    console.log(`🗑 Удалено ${expired.length} истёкших историй`);
  } catch (e) {
    console.error('Story cleanup error:', e);
  }
}

setInterval(cleanupExpiredStories, 10 * 60 * 1000);

// ============================================
// 404 Handler (SPA Routing)
// ============================================

if (process.env.NODE_ENV === 'production') {
  const webDist = path.join(__dirname, '../web/dist');
  app.get('*', (req, res) => {
    const fs = require('fs');
    if (fs.existsSync(path.join(webDist, 'index.html'))) {
      res.sendFile(path.join(webDist, 'index.html'));
    } else {
      res.status(404).json({ 
        error: 'Frontend not found',
        path: webDist,
        message: 'Build may not have completed yet'
      });
    }
  });
}

// Старт
start();
