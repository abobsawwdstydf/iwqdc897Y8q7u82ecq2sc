"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const encrypt_1 = require("./encrypt");
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET не задан в .env — нельзя запускать в production без секрета!');
    }
    console.error('  ⚠ JWT_SECRET не задан в .env — используется dev-значение. Укажите безопасный секрет в продакшене!');
}
// Initialise message encryption (AES-256-GCM)
if (process.env.ENCRYPTION_KEY) {
    (0, encrypt_1.initEncryption)(process.env.ENCRYPTION_KEY);
    console.log('  🔒 Шифрование сообщений включено (AES-256-GCM)');
}
else {
    console.warn('  ⚠ ENCRYPTION_KEY не задан — сообщения хранятся без шифрования. Для продакшена задайте 64-символьный hex-ключ.');
}
exports.config = {
    port: Number(process.env.PORT) || 3001,
    jwtSecret: process.env.JWT_SECRET || 'Nimbus-dev-fallback-not-for-production',
    corsOrigins: process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
        : ['http://localhost:5173', 'http://localhost:3000'],
    uploadsDir: 'uploads',
    /** Minimum password length */
    minPasswordLength: 8,
    /** Maximum registrations allowed from the same IP per day (0 = unlimited) */
    maxRegistrationsPerIp: Number(process.env.MAX_REGISTRATIONS_PER_IP) || 5,
    /** Require email verification */
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    /** Captcha after N failed attempts */
    captchaAfterFailures: Number(process.env.CAPTCHA_AFTER_FAILURES) || 3,
    /** TURN server URL for WebRTC calls (e.g. turn:your-domain.com:3478) */
    turnUrl: process.env.TURN_URL || '',
    /** Shared secret for TURN server (coturn static-auth-secret) */
    turnSecret: process.env.TURN_SECRET || '',
    /** STUN server URLs */
    stunUrls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
        .split(',').map(s => s.trim()).filter(Boolean),
};
//# sourceMappingURL=config.js.map