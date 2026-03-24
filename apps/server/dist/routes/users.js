"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const db_1 = require("../db");
const shared_1 = require("../shared");
const router = (0, express_1.Router)();
// РџРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string' || q.trim().length < 3) {
            res.json([]);
            return;
        }
        const users = await db_1.prisma.user.findMany({
            where: {
                OR: [
                    { username: { contains: q } },
                    { displayName: { contains: q } },
                ],
                NOT: { id: req.userId },
            },
            select: shared_1.USER_SELECT,
            take: 20,
        });
        res.json(users);
    }
    catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РџСЂРѕС„РёР»СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
router.get('/:id', async (req, res) => {
    try {
        const user = await db_1.prisma.user.findUnique({
            where: { id: parseInt(req.params.id, 10) },
            select: shared_1.USER_SELECT,
        });
        if (!user) {
            res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// Р—Р°РіСЂСѓР·РёС‚СЊ Р°РІР°С‚Р°СЂ
router.post('/avatar', shared_1.uploadUserAvatar.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });
            return;
        }
        // Delete old avatar file if exists
        const currentUser = await db_1.prisma.user.findUnique({ where: { id: req.userId }, select: { avatar: true } });
        if (currentUser?.avatar)
            (0, shared_1.deleteUploadedFile)(currentUser.avatar);
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const user = await db_1.prisma.user.update({
            where: { id: req.userId },
            data: { avatar: avatarUrl },
            select: shared_1.USER_SELECT,
        });
        res.json(user);
    }
    catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: error?.message || 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р°РІР°С‚Р°СЂР°' });
    }
});
// РЈРґР°Р»РёС‚СЊ Р°РІР°С‚Р°СЂ
router.delete('/avatar', async (req, res) => {
    try {
        // Delete file from disk
        const currentUser = await db_1.prisma.user.findUnique({ where: { id: req.userId }, select: { avatar: true } });
        if (currentUser?.avatar)
            (0, shared_1.deleteUploadedFile)(currentUser.avatar);
        const user = await db_1.prisma.user.update({
            where: { id: req.userId },
            data: { avatar: null },
            select: shared_1.USER_SELECT,
        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ Р°РІР°С‚Р°СЂР°' });
    }
});
// РћР±РЅРѕРІРёС‚СЊ РїСЂРѕС„РёР»СЊ (username РќР• РјРµРЅСЏРµС‚СЃСЏ!)
router.put('/profile', async (req, res) => {
    try {
        const { displayName, bio, birthday } = req.body;
        // Validate field lengths
        if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length === 0 || displayName.length > 50)) {
            res.status(400).json({ error: 'РРјСЏ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚ 1 РґРѕ 50 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        if (bio !== undefined && bio !== null && (typeof bio !== 'string' || bio.length > 500)) {
            res.status(400).json({ error: 'Р‘РёРѕ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 500 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        if (birthday !== undefined && birthday !== null) {
            if (typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || isNaN(Date.parse(birthday))) {
                res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ С„РѕСЂРјР°С‚ РґР°С‚С‹ СЂРѕР¶РґРµРЅРёСЏ (YYYY-MM-DD)' });
                return;
            }
        }
        const updateData = {};
        if (displayName !== undefined)
            updateData.displayName = displayName;
        if (bio !== undefined)
            updateData.bio = bio;
        if (birthday !== undefined)
            updateData.birthday = birthday;
        const user = await db_1.prisma.user.update({
            where: { id: req.userId },
            data: updateData,
            select: shared_1.USER_SELECT,
        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РџРѕРёСЃРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ Рё РєР°РЅР°Р»РѕРІ (РіР»РѕР±Р°Р»СЊРЅС‹Р№ РїРѕРёСЃРє)
router.get('/search-global', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string' || q.length < 2) {
            res.json({ users: [], channels: [] });
            return;
        }
        // Search users by username or displayName (case-insensitive via ILIKE in Postgres)
        const users = await db_1.prisma.user.findMany({
            where: {
                OR: [
                    { username: { contains: q } },
                    { displayName: { contains: q } },
                ],
            },
            select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                isOnline: true,
            },
            take: 20,
        });
        // Search channels by name or username (ALL channels, not just member of)
        const channels = await db_1.prisma.chat.findMany({
            where: {
                type: 'channel',
                OR: [
                    { name: { contains: q } },
                    { username: { contains: q } },
                ],
            },
            select: {
                id: true,
                name: true,
                username: true,
                avatar: true,
                description: true,
                members: {
                    select: {
                        userId: true,
                    },
                },
            },
            take: 20,
        });
        res.json({ users, channels });
    }
    catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕРёСЃРєР°' });
    }
});
// РџРѕРёСЃРє СЃРѕРѕР±С‰РµРЅРёР№
router.get('/messages/search', async (req, res) => {
    try {
        const { q, chatId } = req.query;
        if (!q || typeof q !== 'string') {
            res.json([]);
            return;
        }
        const where = {
            content: { contains: q },
            isDeleted: false,
        };
        if (chatId) {
            const chatIdNum = parseInt(chatId, 10);
            where.chatId = chatIdNum;
            const member = await db_1.prisma.chatMember.findUnique({
                where: { chatId_userId: { chatId: chatIdNum, userId: req.userId } },
            });
            if (member?.clearedAt) {
                where.createdAt = { gt: member.clearedAt };
            }
        }
        else {
            where.chat = {
                members: { some: { userId: req.userId } },
            };
        }
        const messages = await db_1.prisma.message.findMany({
            where,
            include: {
                sender: { select: shared_1.SENDER_SELECT },
                chat: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                        members: {
                            include: {
                                user: { select: { id: true, username: true, displayName: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        // For global search (no chatId filter), filter out messages before clearedAt per chat
        let filtered = messages;
        if (!chatId) {
            const memberships = await db_1.prisma.chatMember.findMany({
                where: { userId: req.userId },
                select: { chatId: true, clearedAt: true },
            });
            const clearedMap = new Map();
            for (const m of memberships) {
                if (m.clearedAt)
                    clearedMap.set(m.chatId, m.clearedAt);
            }
            if (clearedMap.size > 0) {
                filtered = messages.filter((msg) => {
                    const cleared = clearedMap.get(msg.chatId);
                    if (!cleared)
                        return true;
                    return new Date(msg.createdAt) > new Date(cleared);
                });
            }
        }
        res.json(filtered);
    }
    catch (error) {
        console.error('Search messages error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё РїСЂРёРІР°С‚РЅРѕСЃС‚Рё
router.put('/settings', async (req, res) => {
    try {
        const { hideStoryViews } = req.body;
        const updateData = {};
        if (typeof hideStoryViews === 'boolean')
            updateData.hideStoryViews = hideStoryViews;
        const user = await db_1.prisma.user.update({
            where: { id: req.userId },
            data: updateData,
            select: shared_1.USER_SELECT,
        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map