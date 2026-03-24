"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const db_1 = require("../db");
const shared_1 = require("../shared");
const router = (0, express_1.Router)();
// РџРѕР»СѓС‡РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ С‡Р°С‚Р°
router.get('/chat/:chatId', async (req, res) => {
    try {
        const chatId = parseInt(req.params.chatId, 10);
        const { cursor, limit = '50' } = req.query;
        const take = Math.min(Math.max(1, parseInt(limit) || 50), 200);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member) {
            res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕРјСѓ С‡Р°С‚Сѓ' });
            return;
        }
        const createdAtFilter = {};
        if (cursor)
            createdAtFilter.lt = new Date(cursor);
        if (member.clearedAt)
            createdAtFilter.gt = member.clearedAt;
        const messages = await db_1.prisma.message.findMany({
            where: {
                chatId,
                isDeleted: false,
                hiddenBy: { none: { userId: req.userId } },
                // Scheduled messages: only visible to the sender until delivered
                OR: [
                    { scheduledAt: null },
                    { senderId: req.userId },
                ],
                ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
            },
            include: shared_1.MESSAGE_INCLUDE,
            orderBy: { createdAt: 'desc' },
            take,
        });
        res.json(messages.reverse());
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// Р—Р°РіСЂСѓР·РєР° РѕРґРЅРѕРіРѕ С„Р°Р№Р»Р°
router.post('/upload', shared_1.uploadFile.single('file'), shared_1.encryptUploadedFile, async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });
            return;
        }
        const fileUrl = `/uploads/${req.file.filename}`;
        // multer decodes multipart filenames as latin1 вЂ” re-decode as UTF-8
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        res.json({
            url: fileUrl,
            filename: originalName,
            size: req.file.size,
            mimetype: req.file.mimetype,
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё' });
    }
});
// Р—Р°РіСЂСѓР·РєР° РЅРµСЃРєРѕР»СЊРєРёС… С„Р°Р№Р»РѕРІ
router.post('/upload-multiple', shared_1.uploadFile.array('files', 20), shared_1.encryptUploadedFile, async (req, res) => {
    try {
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            res.status(400).json({ error: 'Р¤Р°Р№Р»С‹ РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹' });
            return;
        }
        const results = req.files.map((file) => {
            const fileUrl = `/uploads/${file.filename}`;
            const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
            return {
                url: fileUrl,
                filename: originalName,
                size: file.size,
                mimetype: file.mimetype,
            };
        });
        res.json({ files: results });
    }
    catch (error) {
        console.error('Upload multiple error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё' });
    }
});
// Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ
router.put('/:id', async (req, res) => {
    try {
        const { content } = req.body;
        const id = parseInt(req.params.id, 10);
        if (!content || typeof content !== 'string' || content.length > 10000) {
            res.status(400).json({ error: 'РЎРѕРґРµСЂР¶РёРјРѕРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ Рё РЅРµ РґРѕР»Р¶РЅРѕ РїСЂРµРІС‹С€Р°С‚СЊ 10000 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        const message = await db_1.prisma.message.findUnique({ where: { id } });
        if (!message || message.senderId !== req.userId) {
            res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ' });
            return;
        }
        const updated = await db_1.prisma.message.update({
            where: { id },
            data: { content, isEdited: true },
            include: shared_1.MESSAGE_INCLUDE,
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РЈРґР°Р»РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const message = await db_1.prisma.message.findUnique({
            where: { id },
            include: { media: true },
        });
        if (!message || message.senderId !== req.userId) {
            res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ' });
            return;
        }
        // Delete media files from disk
        if (message.media && message.media.length > 0) {
            for (const m of message.media) {
                if (m.url)
                    (0, shared_1.deleteUploadedFile)(m.url);
            }
            await db_1.prisma.media.deleteMany({ where: { messageId: id } });
        }
        await db_1.prisma.message.update({
            where: { id },
            data: { isDeleted: true, content: null },
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РџРѕР»СѓС‡РёС‚СЊ РѕР±С‰РёРµ РјРµРґРёР°/С„Р°Р№Р»С‹/СЃСЃС‹Р»РєРё С‡Р°С‚Р°
router.get('/chat/:chatId/shared', async (req, res) => {
    try {
        const chatId = parseInt(req.params.chatId, 10);
        const { type } = req.query;
        // Check membership
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member) {
            res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' });
            return;
        }
        const baseWhere = {
            chatId,
            isDeleted: false,
            hiddenBy: { none: { userId: req.userId } },
            ...(member.clearedAt ? { createdAt: { gt: member.clearedAt } } : {}),
        };
        if (type === 'media') {
            // Images and videos
            const messages = await db_1.prisma.message.findMany({
                where: {
                    ...baseWhere,
                    media: { some: { type: { in: ['image', 'video'] } } },
                },
                include: {
                    media: { where: { type: { in: ['image', 'video'] } } },
                    sender: { select: shared_1.SENDER_SELECT },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            res.json(messages);
        }
        else if (type === 'files') {
            // Files (documents, archives, audio, etc.)
            const messages = await db_1.prisma.message.findMany({
                where: {
                    ...baseWhere,
                    media: { some: { type: { notIn: ['image', 'video'] } } },
                },
                include: {
                    media: { where: { type: { notIn: ['image', 'video'] } } },
                    sender: { select: shared_1.SENDER_SELECT },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            res.json(messages);
        }
        else if (type === 'links') {
            // Messages containing URLs
            const messages = await db_1.prisma.message.findMany({
                where: {
                    ...baseWhere,
                    content: { contains: 'http' },
                },
                include: {
                    sender: { select: shared_1.SENDER_SELECT },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            // Filter to only messages with actual URLs
            const withLinks = messages
                .filter((m) => m.content && /https?:\/\/[^\s]+/i.test(m.content))
                .map((m) => {
                const links = m.content.match(/https?:\/\/[^\s]+/gi) || [];
                return { ...m, links };
            });
            res.json(withLinks);
        }
        else {
            res.status(400).json({ error: 'Invalid type. Use: media, files, or links' });
        }
    }
    catch (error) {
        console.error('Shared media error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
exports.default = router;
//# sourceMappingURL=messages.js.map