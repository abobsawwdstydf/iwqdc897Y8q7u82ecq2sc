"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const bcrypt = __importStar(require("bcryptjs"));
const jwt = __importStar(require("jsonwebtoken"));
const db_1 = require("../db");
const config_1 = require("../config");
const shared_1 = require("../shared");
const auth_1 = require("../middleware/auth");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const router = (0, express_1.Router)();
// в”Ђв”Ђв”Ђ Registration rate limiter: 100 registrations per IP per hour (development friendly) в”Ђв”Ђв”Ђ
const registerLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Increased for development
    message: { error: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ СЂРµРіРёСЃС‚СЂР°С†РёР№ СЃ СЌС‚РѕРіРѕ IP. РџРѕРїСЂРѕР±СѓР№С‚Рµ С‡РµСЂРµР· С‡Р°СЃ.' },
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
        // в”Ђв”Ђ Fingerprint check в”Ђв”Ђ
        if (fingerprint) {
            const now = Date.now();
            const fpData = fingerprintAttempts.get(fingerprint);
            if (fpData && now < fpData.resetAt) {
                if (fpData.count >= MAX_FINGERPRINT_ATTEMPTS) {
                    // Require captcha after max attempts
                    if (!captchaAnswer) {
                        res.status(403).json({
                            error: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ РїРѕРїС‹С‚РѕРє. РўСЂРµР±СѓРµС‚СЃСЏ РєР°РїС‡Р°.',
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
        // в”Ђв”Ђ IP cooldown check в”Ђв”Ђ
        const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
        const lastReg = registrationCooldowns.get(clientIp);
        if (lastReg && Date.now() - lastReg < REGISTRATION_COOLDOWN_MS) {
            const waitSeconds = Math.ceil((REGISTRATION_COOLDOWN_MS - (Date.now() - lastReg)) / 1000);
            res.status(429).json({ error: `РџРѕРґРѕР¶РґРёС‚Рµ ${waitSeconds} СЃРµРє. РїРµСЂРµРґ СЃРѕР·РґР°РЅРёРµРј РЅРѕРІРѕРіРѕ Р°РєРєР°СѓРЅС‚Р°` });
            return;
        }
        // в”Ђв”Ђ Daily IP limit (soft limit, can be bypassed with fingerprint) в”Ђв”Ђ
        const accountsFromIp = await db_1.prisma.user.count({ where: { registrationIp: clientIp, createdAt: { gte: new Date(Date.now() - FINGERPRINT_WINDOW_MS) } } });
        if (accountsFromIp >= config_1.config.maxRegistrationsPerIp && !fingerprint) {
            res.status(403).json({
                error: `РњР°РєСЃРёРјСѓРј ${config_1.config.maxRegistrationsPerIp} Р°РєРєР°СѓРЅС‚РѕРІ РІ РґРµРЅСЊ СЃ РѕРґРЅРѕРіРѕ IP. РСЃРїРѕР»СЊР·СѓР№С‚Рµ fingerprint РёР»Рё РїРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.`,
                requireFingerprint: true
            });
            return;
        }
        if (!username || !password) {
            res.status(400).json({ error: 'Username Рё РїР°СЂРѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' });
            return;
        }
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            res.status(400).json({ error: 'Username: 3-20 СЃРёРјРІРѕР»РѕРІ, С‚РѕР»СЊРєРѕ Р»Р°С‚РёРЅРёС†Р°, С†РёС„СЂС‹, _' });
            return;
        }
        if (password.length < config_1.config.minPasswordLength) {
            res.status(400).json({ error: `РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ ${config_1.config.minPasswordLength} СЃРёРјРІРѕР»РѕРІ` });
            return;
        }
        // Password can contain any characters (letters, digits, special chars)
        // No specific character requirements for better UX
        // Validate optional fields
        if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 50)) {
            res.status(400).json({ error: 'РРјСЏ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 50 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        if (bio !== undefined && (typeof bio !== 'string' || bio.length > 500)) {
            res.status(400).json({ error: 'Р‘РёРѕ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 500 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        const existing = await db_1.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
        if (existing) {
            res.status(400).json({ error: 'Р­С‚РѕС‚ username СѓР¶Рµ Р·Р°РЅСЏС‚' });
            return;
        }
        const hashedPassword = await bcrypt.hash(password, 10);
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
        const token = jwt.sign({ userId: user.id }, config_1.config.jwtSecret, { expiresIn: '30d' });
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
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// Р’С…РѕРґ
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username Рё РїР°СЂРѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' });
            return;
        }
        // Validate username format
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            res.status(400).json({ error: 'Username: 3-20 СЃРёРјРІРѕР»РѕРІ, С‚РѕР»СЊРєРѕ Р»Р°С‚РёРЅРёС†Р°, С†РёС„СЂС‹, _' });
            return;
        }
        const user = await db_1.prisma.user.findUnique({
            where: { username: username.toLowerCase() },
            select: { ...shared_1.USER_SELECT, password: true },
        });
        if (!user) {
            res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ username РёР»Рё РїР°СЂРѕР»СЊ' });
            return;
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            res.status(400).json({ error: 'РќРµРІРµСЂРЅС‹Р№ username РёР»Рё РїР°СЂРѕР»СЊ' });
            return;
        }
        await db_1.prisma.user.update({
            where: { id: user.id },
            data: { isOnline: true, lastSeen: new Date() },
        });
        const token = jwt.sign({ userId: user.id }, config_1.config.jwtSecret, { expiresIn: '30d' });
        const { password: _, ...userWithoutPassword } = user;
        res.json({ token, user: { ...userWithoutPassword, isOnline: true } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РўРµРєСѓС‰РёР№ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ вЂ” uses authenticateToken middleware instead of duplicating JWT parsing
router.get('/me', auth_1.authenticateToken, async (req, res) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: req.userId },
            select: shared_1.USER_SELECT,
        });
        if (!user) {
            res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        res.json({ user });
    }
    catch {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.js.map