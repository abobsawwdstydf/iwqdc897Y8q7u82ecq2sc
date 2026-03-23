"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const mime_types_1 = __importDefault(require("mime-types"));
const config_1 = require("./config");
const db_1 = require("./db");
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const chats_1 = __importDefault(require("./routes/chats"));
const messages_1 = __importDefault(require("./routes/messages"));
const stories_1 = __importDefault(require("./routes/stories"));
const friends_1 = __importDefault(require("./routes/friends"));
const admin_1 = __importDefault(require("./routes/admin"));
const folders_1 = __importDefault(require("./routes/folders"));
const drafts_1 = __importDefault(require("./routes/drafts"));
const bots_1 = __importDefault(require("./routes/bots"));
const stickers_1 = __importDefault(require("./routes/stickers"));
const emoji_1 = __importDefault(require("./routes/emoji"));
const secret_chats_1 = __importDefault(require("./routes/secret-chats"));
const socket_1 = require("./socket");
const auth_2 = require("./middleware/auth");
const encrypt_1 = require("./encrypt");
const shared_1 = require("./shared");
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: (origin, callback) => {
            // Allow requests with no origin (like mobile apps or Postman)
            if (!origin)
                return callback(null, true);
            // Allow any localhost on any port
            if (/^http:\/\/localhost:\d+$/.test(origin))
                return callback(null, true);
            // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/.test(origin)) {
                return callback(null, true);
            }
            // Check against allowed origins
            if (config_1.config.corsOrigins.includes(origin))
                return callback(null, true);
            // In production, allow the render domain
            if (origin?.includes('onrender.com'))
                return callback(null, true);
            // In development, allow all
            if (process.env.NODE_ENV !== 'production') {
                return callback(null, true);
            }
            callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        credentials: true,
    },
});
// Trust first proxy (Nginx) so req.ip returns real client IP from X-Forwarded-For
app.set('trust proxy', 1);
app.use((0, cors_1.default)({ origin: config_1.config.corsOrigins }));
app.use(express_1.default.json({ limit: '10mb' }));
// Serve uploads — decrypts encrypted files on the fly
app.use('/uploads', (req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    // Resolve file path safely
    const urlPath = decodeURIComponent(req.path);
    if (urlPath.includes('..')) {
        res.status(400).end();
        return;
    }
    const filePath = path_1.default.resolve(shared_1.UPLOADS_ROOT, urlPath.replace(/^\//, ''));
    if (!filePath.startsWith(shared_1.UPLOADS_ROOT) || !fs_1.default.existsSync(filePath)) {
        res.status(404).end();
        return;
    }
    // Set Content-Type from extension
    const contentType = mime_types_1.default.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    // If encryption is enabled, try to decrypt
    if ((0, encrypt_1.isEncryptionEnabled)()) {
        const decrypted = (0, encrypt_1.decryptFileToBuffer)(filePath);
        if (decrypted) {
            res.setHeader('Content-Length', decrypted.length);
            res.end(decrypted);
            return;
        }
        // Decryption failed — file is likely unencrypted (legacy), fall through to static
    }
    // Serve unencrypted file as-is
    next();
}, express_1.default.static(shared_1.UPLOADS_ROOT));
// Rate limiting for auth endpoints (prevent brute-force)
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // max 20 attempts per window
    message: { error: 'Слишком много попыток, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false,
});
// General API rate limiter (1000 req/min per IP for development)
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Increased for development
    message: { error: 'Слишком много запросов, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development', // Skip in development
});
// API маршруты — auth/me uses general limiter (called on every page load)
app.use('/api/auth/me', apiLimiter, auth_1.default);
app.use('/api/auth', authLimiter, auth_1.default);
app.use('/api/users', apiLimiter, auth_2.authenticateToken, users_1.default);
app.use('/api/chats', apiLimiter, auth_2.authenticateToken, chats_1.default);
app.use('/api/messages', apiLimiter, auth_2.authenticateToken, messages_1.default);
app.use('/api/stories', apiLimiter, auth_2.authenticateToken, stories_1.default);
app.use('/api/friends', apiLimiter, auth_2.authenticateToken, friends_1.default);
app.use('/api/folders', apiLimiter, auth_2.authenticateToken, folders_1.default);
app.use('/api/drafts', apiLimiter, auth_2.authenticateToken, drafts_1.default);
app.use('/api/bots', apiLimiter, auth_2.authenticateToken, bots_1.default);
app.use('/api/stickers', apiLimiter, auth_2.authenticateToken, stickers_1.default);
app.use('/api/emoji', apiLimiter, auth_2.authenticateToken, emoji_1.default);
app.use('/api/secret-chats', apiLimiter, auth_2.authenticateToken, secret_chats_1.default);
app.use('/api/admin', admin_1.default);
// Админ-панель
app.get('/aaddmmiinnppaanneell', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../../web/public/admin.html'));
});
// Проверка здоровья
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', name: 'Nimbus Server' });
});
// ICE серверы для WebRTC звонков
app.get('/api/ice-servers', auth_2.authenticateToken, (_req, res) => {
    const iceServers = [];
    // STUN серверы
    if (config_1.config.stunUrls.length > 0) {
        iceServers.push({ urls: config_1.config.stunUrls });
    }
    // TURN сервер с временными credentials (coturn --use-auth-secret)
    if (config_1.config.turnUrl && config_1.config.turnSecret) {
        const ttl = 24 * 3600; // 24 часа
        const timestamp = Math.floor(Date.now() / 1000) + ttl;
        const username = `${timestamp}:Nimbus`;
        const credential = crypto_1.default
            .createHmac('sha1', config_1.config.turnSecret)
            .update(username)
            .digest('base64');
        iceServers.push({
            urls: config_1.config.turnUrl,
            username,
            credential,
        });
    }
    res.json({ iceServers });
});
// Socket.io
(0, socket_1.setupSocket)(io);
// Раздача фронтенда (продакшен)
if (process.env.NODE_ENV === 'production') {
    const webDist = path_1.default.join(__dirname, '../../web/dist');
    app.use(express_1.default.static(webDist));
    // Все неизвестные маршруты → index.html (для SPA роутинга)
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(webDist, 'index.html'));
    });
}
// При старте сервера сбросить всех в offline
db_1.prisma.user.updateMany({ data: { isOnline: false, lastSeen: new Date() } })
    .then(() => console.log('  ✔ Все пользователи сброшены в offline'))
    .catch((e) => console.error('Ошибка сброса онлайн-статусов:', e));
// Cleanup expired stories (every 10 minutes)
const shared_2 = require("./shared");
async function cleanupExpiredStories() {
    try {
        const expired = await db_1.prisma.story.findMany({
            where: { expiresAt: { lte: new Date() } },
            select: { id: true, mediaUrl: true },
        });
        if (expired.length === 0)
            return;
        for (const story of expired) {
            if (story.mediaUrl)
                (0, shared_2.deleteUploadedFile)(story.mediaUrl);
        }
        const ids = expired.map(s => s.id);
        // Cascade handles StoryView deletion via schema onDelete: Cascade
        await db_1.prisma.story.deleteMany({ where: { id: { in: ids } } });
        console.log(`  🗑 Удалено ${expired.length} истёкших историй`);
    }
    catch (e) {
        console.error('Story cleanup error:', e);
    }
}
cleanupExpiredStories();
setInterval(cleanupExpiredStories, 10 * 60 * 1000);
// Cleanup expired secret messages (every 5 minutes)
async function cleanupExpiredSecretMessages() {
    try {
        const expired = await db_1.prisma.secretMessage.findMany({
            where: {
                expiresAt: { lte: new Date() },
                deletedAt: null,
            },
            select: { id: true, chatId: true },
        });
        if (expired.length === 0)
            return;
        await db_1.prisma.secretMessage.updateMany({
            where: { id: { in: expired.map(e => e.id) } },
            data: { deletedAt: new Date() },
        });
        console.log(`  🔒 Удалено ${expired.length} истёкших секретных сообщений`);
    }
    catch (e) {
        console.error('Secret message cleanup error:', e);
    }
}
cleanupExpiredSecretMessages();
setInterval(cleanupExpiredSecretMessages, 5 * 60 * 1000);
server.listen(config_1.config.port, () => {
    console.log(`\n  ⚡ Nimbus Server запущен на порту ${config_1.config.port}\n`);
});
// 404 handler
app.use((_req, res) => {
    res.status(404).sendFile(path_1.default.join(__dirname, '../../web/public/404.html'));
});
// Error handler
app.use((err, _req, res, _next) => {
    console.error('Server error:', err);
    res.status(500).sendFile(path_1.default.join(__dirname, '../../web/public/500.html'));
});
// Graceful shutdown
const shutdown = async () => {
    console.log('\n  Завершение работы...');
    await db_1.prisma.$disconnect();
    server.close(() => {
        process.exit(0);
    });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
//# sourceMappingURL=index.js.map