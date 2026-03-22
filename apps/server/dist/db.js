"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const encrypt_1 = require("./encrypt");
const basePrisma = new client_1.PrismaClient();
// ─── Prisma extension: transparent message encryption ───────────────
// Encrypts `content` and `quote` before writing to DB,
// decrypts them after reading. This way the DB never stores plaintext.
exports.prisma = basePrisma.$extends({
    query: {
        message: {
            async create({ args, query }) {
                if (args.data.content && typeof args.data.content === 'string') {
                    args.data.content = (0, encrypt_1.encryptText)(args.data.content);
                }
                if (args.data.quote && typeof args.data.quote === 'string') {
                    args.data.quote = (0, encrypt_1.encryptText)(args.data.quote);
                }
                const result = await query(args);
                decryptMessageFields(result);
                return result;
            },
            async update({ args, query }) {
                if (args.data.content && typeof args.data.content === 'string') {
                    args.data.content = (0, encrypt_1.encryptText)(args.data.content);
                }
                if (args.data.quote && typeof args.data.quote === 'string') {
                    args.data.quote = (0, encrypt_1.encryptText)(args.data.quote);
                }
                const result = await query(args);
                decryptMessageFields(result);
                return result;
            },
            async upsert({ args, query }) {
                if (args.create.content && typeof args.create.content === 'string') {
                    args.create.content = (0, encrypt_1.encryptText)(args.create.content);
                }
                if (args.create.quote && typeof args.create.quote === 'string') {
                    args.create.quote = (0, encrypt_1.encryptText)(args.create.quote);
                }
                if (args.update.content && typeof args.update.content === 'string') {
                    args.update.content = (0, encrypt_1.encryptText)(args.update.content);
                }
                if (args.update.quote && typeof args.update.quote === 'string') {
                    args.update.quote = (0, encrypt_1.encryptText)(args.update.quote);
                }
                const result = await query(args);
                decryptMessageFields(result);
                return result;
            },
            async findUnique({ args, query }) {
                const result = await query(args);
                if (result)
                    decryptMessageFields(result);
                return result;
            },
            async findFirst({ args, query }) {
                const result = await query(args);
                if (result)
                    decryptMessageFields(result);
                return result;
            },
            async findMany({ args, query }) {
                const results = await query(args);
                for (const item of results) {
                    decryptMessageFields(item);
                }
                return results;
            },
        },
        // Also decrypt messages nested inside Chat queries
        chat: {
            async findMany({ args, query }) {
                const results = await query(args);
                for (const chat of results) {
                    decryptChatMessages(chat);
                }
                return results;
            },
            async findFirst({ args, query }) {
                const result = await query(args);
                if (result)
                    decryptChatMessages(result);
                return result;
            },
            async findUnique({ args, query }) {
                const result = await query(args);
                if (result)
                    decryptChatMessages(result);
                return result;
            },
            async create({ args, query }) {
                const result = await query(args);
                decryptChatMessages(result);
                return result;
            },
        },
        // Decrypt message inside PinnedMessage queries
        pinnedMessage: {
            async findFirst({ args, query }) {
                const result = await query(args);
                if (result)
                    decryptNested(result);
                return result;
            },
            async findMany({ args, query }) {
                const results = await query(args);
                for (const item of results)
                    decryptNested(item);
                return results;
            },
        },
    },
});
/** Decrypt content/quote on a message-shaped object. */
function decryptMessageFields(obj) {
    if (!obj || typeof obj !== 'object' || !(0, encrypt_1.isEncryptionEnabled)())
        return;
    if (typeof obj.content === 'string') {
        obj.content = (0, encrypt_1.decryptText)(obj.content);
    }
    if (typeof obj.quote === 'string') {
        obj.quote = (0, encrypt_1.decryptText)(obj.quote);
    }
    // Nested replyTo
    if (obj.replyTo && typeof obj.replyTo === 'object') {
        decryptMessageFields(obj.replyTo);
    }
}
/** Decrypt messages nested inside a chat object. */
function decryptChatMessages(chat) {
    if (!chat || !(0, encrypt_1.isEncryptionEnabled)())
        return;
    if (Array.isArray(chat.messages)) {
        for (const msg of chat.messages) {
            decryptMessageFields(msg);
        }
    }
    // pinnedMessages[].message
    if (Array.isArray(chat.pinnedMessages)) {
        for (const pm of chat.pinnedMessages) {
            const pmo = pm;
            if (pmo.message && typeof pmo.message === 'object') {
                decryptMessageFields(pmo.message);
            }
        }
    }
}
/** Decrypt nested message field on any object (e.g. PinnedMessage.message). */
function decryptNested(obj) {
    if (!obj || !(0, encrypt_1.isEncryptionEnabled)())
        return;
    if (obj.message && typeof obj.message === 'object') {
        decryptMessageFields(obj.message);
    }
}
//# sourceMappingURL=db.js.map