"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const config_1 = require("../config");
const shared_1 = require("../shared");
const auth_1 = require("../middleware/auth");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const router = (0, express_1.Router)();
// ─── Registration rate limiter: 100 registrations per IP per hour (development friendly) ───
const registerLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Increased for development
    message: { error: 'Слишком много регистраций с этого IP. Попробуйте через час.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
    skip: (req) => process.env.NODE_ENV === 'development', // Skip in development
});
// In-memory cooldown: track last registration timestamp per IP (prevents rapid-fire even within rate limit)
const registrationCooldowns = new Map();
const REGISTRATION_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between registrations from same IP
// Fingerprint-based rate limiting (more accurate than IP)
const fingerprintAttempts = new Map();
const FINGERPRINT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FINGERPRINT_ATTEMPTS = 3; // Max 3 registrations per fingerprint per day
// Registration endpoint
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, displayName, password, bio, fingerprint, captchaAnswer } = req.body;
        // ── Fingerprint check ──
        if (fingerprint) {
            const now = Date.now();
            const fpData = fingerprintAttempts.get(fingerprint);
            if (fpData && now < fpData.resetAt) {
                if (fpData.count >= MAX_FINGERPRINT_ATTEMPTS) {
                    // Require captcha after max attempts
                    if (!captchaAnswer) {
                        res.status(403).json({
                            error: 'Слишком много попыток. Требуется капча.',
                            requireCaptcha: true
                        });
                        return;
                    }
                    // Verify captcha (simple math check stored in session)
                    // For now, just check if answer is provided (you can enhance with real captcha)
                }
            }
            else {
                fingerprintAttempts.set(fingerprint, { count: 0, resetAt: now + FINGERPRINT_WINDOW_MS });
            }
        }
        // ── IP cooldown check ──
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const lastReg = registrationCooldowns.get(clientIp);
        if (lastReg && Date.now() - lastReg < REGISTRATION_COOLDOWN_MS) {
            const waitSeconds = Math.ceil((REGISTRATION_COOLDOWN_MS - (Date.now() - lastReg)) / 1000);
            res.status(429).json({ error: `Подождите ${waitSeconds} сек. перед созданием нового аккаунта` });
            return;
        }
        // ── Daily IP limit (soft limit, can be bypassed with fingerprint) ──
        const accountsFromIp = await db_1.prisma.user.count({ where: { registrationIp: clientIp, createdAt: { gte: new Date(Date.now() - FINGERPRINT_WINDOW_MS) } } });
        if (accountsFromIp >= config_1.config.maxRegistrationsPerIp && !fingerprint) {
            res.status(403).json({
                error: `Максимум ${config_1.config.maxRegistrationsPerIp} аккаунтов в день с одного IP. Используйте fingerprint или попробуйте позже.`,
                requireFingerprint: true
            });
            return;
        }
        if (!username || !password) {
            res.status(400).json({ error: 'Username и пароль обязательны' });
            return;
        }
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            res.status(400).json({ error: 'Username: 3-20 символов, только латиница, цифры, _' });
            return;
        }
        if (password.length < config_1.config.minPasswordLength) {
            res.status(400).json({ error: `Пароль должен быть не менее ${config_1.config.minPasswordLength} символов` });
            return;
        }
        // Password can contain any characters (letters, digits, special chars)
        // No specific character requirements for better UX
        // Validate optional fields
        if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 50)) {
            res.status(400).json({ error: 'Имя должно быть не длиннее 50 символов' });
            return;
        }
        if (bio !== undefined && (typeof bio !== 'string' || bio.length > 500)) {
            res.status(400).json({ error: 'Био должно быть не длиннее 500 символов' });
            return;
        }
        const existing = await db_1.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
        if (existing) {
            res.status(400).json({ error: 'Этот username уже занят' });
            return;
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const user = await db_1.prisma.user.create({
            data: {
                username: username.toLowerCase(),
                displayName: (displayName || username).slice(0, 50),
                password: hashedPassword,
                bio: bio ? bio.slice(0, 500) : null,
                registrationIp: clientIp,
            },
            select: shared_1.USER_SELECT,
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, config_1.config.jwtSecret, { expiresIn: '30d' });
        // Track registration for cooldown
        registrationCooldowns.set(clientIp, Date.now());
        // Update fingerprint counter
        if (fingerprint) {
            const fpData = fingerprintAttempts.get(fingerprint);
            if (fpData) {
                fpData.count++;
            }
        }
        res.json({ token, user: { ...user, isOnline: true } });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// Вход
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username и пароль обязательны' });
            return;
        }
        // Validate username format
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            res.status(400).json({ error: 'Username: 3-20 символов, только латиница, цифры, _' });
            return;
        }
        const user = await db_1.prisma.user.findUnique({
            where: { username: username.toLowerCase() },
            select: { ...shared_1.USER_SELECT, password: true },
        });
        if (!user) {
            res.status(400).json({ error: 'Неверный username или пароль' });
            return;
        }
        const validPassword = await bcryptjs_1.default.compare(password, user.password);
        if (!validPassword) {
            res.status(400).json({ error: 'Неверный username или пароль' });
            return;
        }
        await db_1.prisma.user.update({
            where: { id: user.id },
            data: { isOnline: true, lastSeen: new Date() },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, config_1.config.jwtSecret, { expiresIn: '30d' });
        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: { ...userWithoutPassword, isOnline: true } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// Текущий пользователь — uses authenticateToken middleware instead of duplicating JWT parsing
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            select: shared_1.USER_SELECT,
        });
        if (!user) {
            res.status(404).json({ error: 'Пользователь не найден' });
            return;
        }
        res.json({ user });
    }
    catch {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map