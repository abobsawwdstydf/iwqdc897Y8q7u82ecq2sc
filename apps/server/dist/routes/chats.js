"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const client_1 = require("@prisma/client");
const db_1 = require("../db");
const shared_1 = require("../shared");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
// Compact user select for chat member lists (no bio/birthday)
const CHAT_USER_SELECT = {
    id: true,
    username: true,
    displayName: true,
    avatar: true,
    isOnline: true,
    lastSeen: true,
};
// РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ С‡Р°С‚С‹ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
router.get('/', async (req, res) => {
    try {
        const chats = await db_1.prisma.chat.findMany({
            where: {
                members: { some: { userId: req.userId } },
            },
            include: {
                members: {
                    include: { user: { select: CHAT_USER_SELECT } },
                },
                messages: {
                    where: {
                        isDeleted: false,
                        OR: [
                            { scheduledAt: null },
                            { senderId: req.userId },
                        ],
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
                pinnedMessages: {
                    orderBy: { pinnedAt: 'desc' },
                    take: 1,
                    include: {
                        message: {
                            include: {
                                sender: { select: shared_1.SENDER_SELECT },
                                media: true,
                            },
                        },
                    },
                },
            },
        });
        // Batch unread counts in a single query to avoid N+1
        const chatIds = chats.map(c => c.id);
        let unreadCounts = [];
        if (chatIds.length > 0) {
            unreadCounts = await db_1.prisma.$queryRaw(client_1.Prisma.sql `SELECT m."chatId", COUNT(m.id) as count FROM "Message" m
         LEFT JOIN "ReadReceipt" rr ON rr."messageId" = m.id AND rr."userId" = ${req.userId}
         WHERE m."chatId" IN (${client_1.Prisma.join(chatIds)})
         AND m."senderId" != ${req.userId} AND m."isDeleted" = false AND rr.id IS NULL
         AND m."scheduledAt" IS NULL
         GROUP BY m."chatId"`).catch(() => []);
        }
        const unreadMap = new Map(unreadCounts.map(r => [r.chatId, Number(r.count)]));
        // Filter last message by clearedAt per user
        const chatsFiltered = chats.map((chat) => {
            const member = chat.members.find((m) => m.userId === req.userId);
            const clearedAt = member?.clearedAt;
            if (clearedAt && chat.messages.length > 0) {
                const filtered = chat.messages.filter((msg) => new Date(msg.createdAt) > new Date(clearedAt));
                return { ...chat, messages: filtered };
            }
            return chat;
        });
        const sortedChats = chatsFiltered.sort((a, b) => {
            const aPinned = a.members.find((m) => m.userId === req.userId)?.isPinned || false;
            const bPinned = b.members.find((m) => m.userId === req.userId)?.isPinned || false;
            if (aPinned && !bPinned)
                return -1;
            if (!aPinned && bPinned)
                return 1;
            const aDate = a.messages[0]?.createdAt || a.createdAt;
            const bDate = b.messages[0]?.createdAt || b.createdAt;
            return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
        const chatsWithUnread = sortedChats.map((chat) => ({
            ...chat,
            unreadCount: unreadMap.get(Number(chat.id)) || 0,
        }));
        res.json(chatsWithUnread);
    }
    catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РЎРѕР·РґР°С‚СЊ Р»РёС‡РЅС‹Р№ С‡Р°С‚
router.post('/personal', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            res.status(400).json({ error: 'ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕР±СЏР·Р°С‚РµР»РµРЅ' });
            return;
        }
        const existingChat = await db_1.prisma.chat.findFirst({
            where: {
                type: 'personal',
                AND: [
                    { members: { some: { userId: req.userId } } },
                    { members: { some: { userId } } },
                ],
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        if (existingChat) {
            res.json({ ...existingChat, unreadCount: 0 });
            return;
        }
        const chat = await db_1.prisma.chat.create({
            data: {
                type: 'personal',
                members: {
                    create: [{ userId: req.userId }, { userId }],
                },
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
                messages: true,
            },
        });
        res.json({ ...chat, unreadCount: 0 });
    }
    catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РЎРѕР·РґР°С‚СЊ РёР»Рё РїРѕР»СѓС‡РёС‚СЊ С‡Р°С‚ "РР·Р±СЂР°РЅРЅРѕРµ" (saved messages)
router.post('/favorites', async (req, res) => {
    try {
        const userId = req.userId;
        // Check if favorites chat already exists
        const existing = await db_1.prisma.chat.findFirst({
            where: {
                type: 'favorites',
                members: { some: { userId } },
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        if (existing) {
            res.json({ ...existing, unreadCount: 0 });
            return;
        }
        const chat = await db_1.prisma.chat.create({
            data: {
                type: 'favorites',
                name: null,
                members: {
                    create: [{ userId, role: 'admin' }],
                },
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
                messages: true,
            },
        });
        res.json({ ...chat, unreadCount: 0 });
    }
    catch (error) {
        console.error('Create favorites chat error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїРѕРІРѕР№ С‡Р°С‚
router.post('/group', async (req, res) => {
    try {
        const { name, memberIds } = req.body;
        if (!name || !memberIds || !Array.isArray(memberIds)) {
            res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ Рё СѓС‡Р°СЃС‚РЅРёРєРё РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' });
            return;
        }
        // Validate group name length
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
            res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РіСЂСѓРїРїС‹ РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚ 1 РґРѕ 100 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        // Limit max members
        if (memberIds.length > 256) {
            res.status(400).json({ error: 'РњР°РєСЃРёРјСѓРј 256 СѓС‡Р°СЃС‚РЅРёРєРѕРІ РІ РіСЂСѓРїРїРµ' });
            return;
        }
        const allMemberIds = [...new Set([req.userId, ...memberIds])];
        const chat = await db_1.prisma.chat.create({
            data: {
                type: 'group',
                name,
                members: {
                    create: allMemberIds.map((uid) => ({
                        userId: uid,
                        role: uid === req.userId ? 'admin' : 'member',
                    })),
                },
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
                messages: true,
            },
        });
        res.json({ ...chat, unreadCount: 0 });
    }
    catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РЎРѕР·РґР°С‚СЊ РєР°РЅР°Р»
router.post('/channel', async (req, res) => {
    try {
        const { name, username, description, memberIds } = req.body;
        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
            res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РєР°РЅР°Р»Р° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚ 1 РґРѕ 100 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        // Validate username (required for channels)
        if (!username || typeof username !== 'string' || username.length < 3 || username.length > 32) {
            res.status(400).json({ error: 'Р®Р·РµСЂРЅРµР№Рј РєР°РЅР°Р»Р° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РѕС‚ 3 РґРѕ 32 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        // Validate username format (alphanumeric + underscore)
        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            res.status(400).json({ error: 'Р®Р·РµСЂРЅРµР№Рј РјРѕР¶РµС‚ СЃРѕРґРµСЂР¶Р°С‚СЊ С‚РѕР»СЊРєРѕ Р±СѓРєРІС‹, С†РёС„СЂС‹ Рё РїРѕРґС‡С‘СЂРєРёРІР°РЅРёСЏ' });
            return;
        }
        // Validate optional description
        if (description !== undefined && (typeof description !== 'string' || description.length > 255)) {
            res.status(400).json({ error: 'РћРїРёСЃР°РЅРёРµ РєР°РЅР°Р»Р° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 255 СЃРёРјРІРѕР»РѕРІ' });
            return;
        }
        // Check if username is taken
        const existingChannel = await db_1.prisma.chat.findUnique({
            where: { username },
        });
        if (existingChannel) {
            res.status(400).json({ error: 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј СѓР¶Рµ Р·Р°РЅСЏС‚' });
            return;
        }
        // Optional: validate memberIds if provided
        let members = [];
        if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
            if (memberIds.length > 1000) {
                res.status(400).json({ error: 'РњР°РєСЃРёРјСѓРј 1000 СѓС‡Р°СЃС‚РЅРёРєРѕРІ РїСЂРё СЃРѕР·РґР°РЅРёРё' });
                return;
            }
            const allMemberIds = [...new Set([req.userId, ...memberIds])];
            members = allMemberIds.map((uid) => ({
                userId: uid,
                role: uid === req.userId ? 'admin' : 'member',
            }));
        }
        else {
            // Creator only (can add members later)
            members = [{ userId: req.userId, role: 'admin' }];
        }
        const chat = await db_1.prisma.chat.create({
            data: {
                type: 'channel',
                name,
                username: username.toLowerCase(),
                description: description ? description.slice(0, 255) : null,
                members: {
                    create: members,
                },
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
                messages: true,
            },
        });
        res.json({ ...chat, unreadCount: 0 });
    }
    catch (error) {
        console.error('Create channel error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РџРѕР»СѓС‡РёС‚СЊ С‡Р°С‚ РїРѕ ID
router.get('/:id', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const chat = await db_1.prisma.chat.findFirst({
            where: {
                id: chatId,
                members: { some: { userId: req.userId } },
            },
            include: {
                members: { include: { user: { select: CHAT_USER_SELECT } } },
            },
        });
        if (!chat) {
            res.status(404).json({ error: 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        res.json(chat);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// РћР±РЅРѕРІРёС‚СЊ РіСЂСѓРїРїСѓ (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅ)
router.put('/:id', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const { name } = req.body;
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || member.role !== 'admin') {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РіСЂСѓРїРїСѓ' });
            return;
        }
        const chat = await db_1.prisma.chat.update({
            where: { id: chatId },
            data: { name },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json(chat);
    }
    catch (error) {
        console.error('Update group error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
});
// Р—Р°РіСЂСѓР·РёС‚СЊ Р°РІР°С‚Р°СЂ РіСЂСѓРїРїС‹ (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅ)
router.post('/:id/avatar', shared_1.uploadGroupAvatar.single('avatar'), shared_1.encryptUploadedFile, async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || member.role !== 'admin') {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РјРµРЅСЏС‚СЊ Р°РІР°С‚Р°СЂ РіСЂСѓРїРїС‹' });
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });
            return;
        }
        // Delete old avatar file
        const currentChat = await db_1.prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
        if (currentChat?.avatar)
            (0, shared_1.deleteUploadedFile)(currentChat.avatar);
        const avatarUrl = `/uploads/avatars/${req.file.filename}`;
        const chat = await db_1.prisma.chat.update({
            where: { id: chatId },
            data: { avatar: avatarUrl },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json(chat);
    }
    catch (error) {
        console.error('Upload group avatar error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р°РІР°С‚Р°СЂР°' });
    }
});
// РЈРґР°Р»РёС‚СЊ Р°РІР°С‚Р°СЂ РіСЂСѓРїРїС‹ (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅ)
router.delete('/:id/avatar', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || member.role !== 'admin') {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РјРµРЅСЏС‚СЊ Р°РІР°С‚Р°СЂ РіСЂСѓРїРїС‹' });
            return;
        }
        // Delete file from disk
        const currentChat = await db_1.prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
        if (currentChat?.avatar)
            (0, shared_1.deleteUploadedFile)(currentChat.avatar);
        const chat = await db_1.prisma.chat.update({
            where: { id: chatId },
            data: { avatar: null },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json(chat);
    }
    catch (error) {
        res.status(500).json({ error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ Р°РІР°С‚Р°СЂР°' });
    }
});
// в”Ђв”Ђв”Ђ Multiple Avatars Management (for channels/groups) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const uploadMultipleAvatars = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, path_1.default.join(__dirname, '../uploads/avatars')),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname).toLowerCase();
            cb(null, `avatar-${(0, uuid_1.v4)()}${ext}`);
        },
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 100 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (file.mimetype.startsWith('image/') && shared_1.ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
            cb(null, true);
        }
        else {
            cb(new Error('РўРѕР»СЊРєРѕ РёР·РѕР±СЂР°Р¶РµРЅРёСЏ (jpg, png, gif, webp, avif)'));
        }
    },
});
// Р—Р°РіСЂСѓР·РёС‚СЊ РЅРµСЃРєРѕР»СЊРєРѕ Р°РІР°С‚Р°СЂРѕРІ (РґРѕ 100)
router.post('/:id/avatars', uploadMultipleAvatars.array('avatars', 100), shared_1.encryptUploadedFile, async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СѓРїСЂР°РІР»СЏС‚СЊ Р°РІР°С‚Р°СЂР°РјРё' });
            return;
        }
        if (!req.files || req.files.length === 0) {
            res.status(400).json({ error: 'Р¤Р°Р№Р»С‹ РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹' });
            return;
        }
        const files = req.files;
        // Get current max position
        const existingAvatars = await db_1.prisma.chatAvatar.findMany({
            where: { chatId },
            orderBy: { position: 'desc' },
            take: 1,
        });
        const startPosition = existingAvatars.length > 0 ? existingAvatars[0].position + 1 : 0;
        // Create avatar records
        const avatars = await Promise.all(files.map((file, index) => db_1.prisma.chatAvatar.create({
            data: {
                chatId,
                url: `/uploads/avatars/${file.filename}`,
                position: startPosition + index,
                isMain: index === 0 && existingAvatars.length === 0, // First avatar is main if none exist
            },
        })));
        // Update main avatar if this is the first one
        if (existingAvatars.length === 0 && avatars.length > 0) {
            await db_1.prisma.chat.update({
                where: { id: chatId },
                data: { avatar: avatars[0].url },
            });
        }
        res.json(avatars);
    }
    catch (error) {
        console.error('Upload multiple avatars error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р°РІР°С‚Р°СЂРѕРІ' });
    }
});
// РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ Р°РІР°С‚Р°СЂС‹ С‡Р°С‚Р°
router.get('/:id/avatars', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member) {
            res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' });
            return;
        }
        const avatars = await db_1.prisma.chatAvatar.findMany({
            where: { chatId },
            orderBy: { position: 'asc' },
        });
        res.json(avatars);
    }
    catch (error) {
        console.error('Get avatars error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р°РІР°С‚Р°СЂРѕРІ' });
    }
});
// РћР±РЅРѕРІРёС‚СЊ РїРѕСЂСЏРґРѕРє Р°РІР°С‚Р°СЂРѕРІ
router.put('/:id/avatars/reorder', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const { avatarIds } = req.body;
        if (!avatarIds || !Array.isArray(avatarIds)) {
            res.status(400).json({ error: 'РќРµРѕР±С…РѕРґРёРјРѕ СѓРєР°Р·Р°С‚СЊ РјР°СЃСЃРёРІ ID' });
            return;
        }
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СѓРїСЂР°РІР»СЏС‚СЊ Р°РІР°С‚Р°СЂР°РјРё' });
            return;
        }
        // Update positions
        await Promise.all(avatarIds.map((id, index) => db_1.prisma.chatAvatar.update({
            where: { id },
            data: { position: index },
        })));
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Reorder avatars error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РёР·РјРµРЅРµРЅРёСЏ РїРѕСЂСЏРґРєР°' });
    }
});
// РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РіР»Р°РІРЅС‹Р№ Р°РІР°С‚Р°СЂ
router.put('/:id/avatars/:avatarId/main', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const avatarId = parseInt(req.params.avatarId, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СѓРїСЂР°РІР»СЏС‚СЊ Р°РІР°С‚Р°СЂР°РјРё' });
            return;
        }
        const avatar = await db_1.prisma.chatAvatar.findUnique({
            where: { id: avatarId },
        });
        if (!avatar || avatar.chatId !== chatId) {
            res.status(404).json({ error: 'РђРІР°С‚Р°СЂ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        // Set all to not main
        await db_1.prisma.chatAvatar.updateMany({
            where: { chatId },
            data: { isMain: false },
        });
        // Set selected as main
        await db_1.prisma.chatAvatar.update({
            where: { id: avatarId },
            data: { isMain: true },
        });
        // Update chat main avatar
        await db_1.prisma.chat.update({
            where: { id: chatId },
            data: { avatar: avatar.url },
        });
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Set main avatar error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СѓСЃС‚Р°РЅРѕРІРєРё РіР»Р°РІРЅРѕРіРѕ Р°РІР°С‚Р°СЂР°' });
    }
});
// РЈРґР°Р»РёС‚СЊ Р°РІР°С‚Р°СЂ
router.delete('/:id/avatars/:avatarId', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const avatarId = parseInt(req.params.avatarId, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СѓРїСЂР°РІР»СЏС‚СЊ Р°РІР°С‚Р°СЂР°РјРё' });
            return;
        }
        const avatar = await db_1.prisma.chatAvatar.findUnique({
            where: { id: avatarId },
        });
        if (!avatar || avatar.chatId !== chatId) {
            res.status(404).json({ error: 'РђРІР°С‚Р°СЂ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        // Delete file
        (0, shared_1.deleteUploadedFile)(avatar.url);
        // Delete record
        await db_1.prisma.chatAvatar.delete({
            where: { id: avatarId },
        });
        // If this was main avatar, set first available as main
        if (avatar.isMain) {
            const firstAvatar = await db_1.prisma.chatAvatar.findFirst({
                where: { chatId },
                orderBy: { position: 'asc' },
            });
            if (firstAvatar) {
                await db_1.prisma.chatAvatar.update({
                    where: { id: firstAvatar.id },
                    data: { isMain: true },
                });
                await db_1.prisma.chat.update({
                    where: { id: chatId },
                    data: { avatar: firstAvatar.url },
                });
            }
            else {
                await db_1.prisma.chat.update({
                    where: { id: chatId },
                    data: { avatar: null },
                });
            }
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Delete avatar error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ Р°РІР°С‚Р°СЂР°' });
    }
});
// Р”РѕР±Р°РІРёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РІ РіСЂСѓРїРїСѓ (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅ)
router.post('/:id/members', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            res.status(400).json({ error: 'РќРµРѕР±С…РѕРґРёРјРѕ СѓРєР°Р·Р°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№' });
            return;
        }
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || member.role !== 'admin') {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РґРѕР±Р°РІР»СЏС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ' });
            return;
        }
        const chat = await db_1.prisma.chat.findUnique({ where: { id: chatId } });
        if (!chat || chat.type !== 'group') {
            res.status(400).json({ error: 'Р§Р°С‚ РЅРµ СЏРІР»СЏРµС‚СЃСЏ РіСЂСѓРїРїРѕР№' });
            return;
        }
        for (const uid of userIds) {
            await db_1.prisma.chatMember.upsert({
                where: { chatId_userId: { chatId, userId: uid } },
                create: { chatId, userId: uid, role: 'member' },
                update: {},
            });
        }
        const updatedChat = await db_1.prisma.chat.findUnique({
            where: { id: chatId },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json(updatedChat);
    }
    catch (error) {
        console.error('Add members error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РґРѕР±Р°РІР»РµРЅРёСЏ СѓС‡Р°СЃС‚РЅРёРєРѕРІ' });
    }
});
// РЈРґР°Р»РёС‚СЊ СѓС‡Р°СЃС‚РЅРёРєР° РёР· РіСЂСѓРїРїС‹ (С‚РѕР»СЊРєРѕ Р°РґРјРёРЅ)
router.delete('/:id/members/:userId', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const targetUserId = parseInt(req.params.userId, 10);
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || member.role !== 'admin') {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СѓРґР°Р»СЏС‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ' });
            return;
        }
        if (targetUserId === req.userId) {
            res.status(400).json({ error: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ СЃРµР±СЏ РёР· РіСЂСѓРїРїС‹' });
            return;
        }
        await db_1.prisma.chatMember.delete({
            where: { chatId_userId: { chatId, userId: targetUserId } },
        });
        const updatedChat = await db_1.prisma.chat.findUnique({
            where: { id: chatId },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json(updatedChat);
    }
    catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ СѓС‡Р°СЃС‚РЅРёРєР°' });
    }
});
// РћС‡РёСЃС‚РёС‚СЊ С‡Р°С‚ РґР»СЏ СЃРµР±СЏ
router.post('/:id/clear', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const userId = req.userId;
        const chat = await db_1.prisma.chat.findUnique({
            where: { id: chatId },
            include: { members: true },
        });
        if (!chat) {
            res.status(404).json({ error: 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        // Cannot clear favorites chat
        if (chat.type === 'favorites') {
            res.status(400).json({ error: 'РќРµР»СЊР·СЏ РѕС‡РёСЃС‚РёС‚СЊ С‡Р°С‚ "РР·Р±СЂР°РЅРЅРѕРµ"' });
            return;
        }
        // For channels, only owner/co-owner/admin can clear
        if (chat.type === 'channel') {
            const member = await db_1.prisma.chatMember.findUnique({
                where: { chatId_userId: { chatId, userId } },
                select: { role: true },
            });
            if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
                res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РѕС‡РёС‰Р°С‚СЊ РєР°РЅР°Р»' });
                return;
            }
        }
        await db_1.prisma.chatMember.update({
            where: { chatId_userId: { chatId, userId } },
            data: { clearedAt: new Date() },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Clear chat error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РѕС‡РёСЃС‚РєРё С‡Р°С‚Р°' });
    }
});
// РЈРґР°Р»РёС‚СЊ С‡Р°С‚ (РґР»СЏ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ вЂ” РІС‹Р№С‚Рё РёР· С‡Р°С‚Р°)
router.delete('/:id', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const userId = req.userId;
        const chat = await db_1.prisma.chat.findUnique({
            where: { id: chatId },
            include: { members: true },
        });
        if (!chat) {
            res.status(404).json({ error: 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        // Membership check
        const isMember = chat.members.some(m => m.userId === userId);
        if (!isMember) {
            res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕРјСѓ С‡Р°С‚Сѓ' });
            return;
        }
        // Cannot delete favorites chat
        if (chat.type === 'favorites') {
            res.status(400).json({ error: 'РќРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ С‡Р°С‚ "РР·Р±СЂР°РЅРЅРѕРµ"' });
            return;
        }
        if (chat.type === 'personal') {
            // For personal chats, just remove the member (soft leave) instead of destroying for both
            await db_1.prisma.chatMember.delete({
                where: { chatId_userId: { chatId, userId } },
            });
            // If both members have left, clean up the chat
            const remaining = await db_1.prisma.chatMember.count({ where: { chatId } });
            if (remaining === 0) {
                await db_1.prisma.chat.delete({ where: { id: chatId } });
            }
        }
        else if (chat.members.length <= 1) {
            // Last member вЂ” delete the group entirely
            await db_1.prisma.chat.delete({ where: { id: chatId } });
        }
        else {
            // For groups, just remove the member
            await db_1.prisma.chatMember.delete({
                where: { chatId_userId: { chatId, userId } },
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ С‡Р°С‚Р°' });
    }
});
// Р—Р°РєСЂРµРїРёС‚СЊ / РѕС‚РєСЂРµРїРёС‚СЊ С‡Р°С‚
router.post('/:id/pin', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const userId = req.userId;
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId } },
        });
        if (!member) {
            res.status(404).json({ error: 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        await db_1.prisma.chatMember.update({
            where: { chatId_userId: { chatId, userId } },
            data: { isPinned: !member.isPinned },
        });
        res.json({ isPinned: !member.isPinned });
    }
    catch (error) {
        console.error('Pin chat error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РєСЂРµРїР»РµРЅРёСЏ С‡Р°С‚Р°' });
    }
});
// РџСЂРёРіР»Р°СЃРёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ РІ РєР°РЅР°Р» (С‚РѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†/Р°РґРјРёРЅ)
router.post('/:id/invite', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            res.status(400).json({ error: 'РќРµРѕР±С…РѕРґРёРјРѕ СѓРєР°Р·Р°С‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№' });
            return;
        }
        const inviterMember = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!inviterMember || !['owner', 'co-owner', 'admin'].includes(inviterMember.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РїСЂРёРіР»Р°С€Р°С‚СЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ' });
            return;
        }
        const chat = await db_1.prisma.chat.findUnique({ where: { id: chatId } });
        if (!chat || chat.type !== 'channel') {
            res.status(400).json({ error: 'Р§Р°С‚ РЅРµ СЏРІР»СЏРµС‚СЃСЏ РєР°РЅР°Р»РѕРј' });
            return;
        }
        const addedUsers = [];
        for (const uid of userIds) {
            const existing = await db_1.prisma.chatMember.findUnique({
                where: { chatId_userId: { chatId, userId: uid } },
            });
            if (!existing) {
                await db_1.prisma.chatMember.create({
                    data: { chatId, userId: uid, role: 'member' },
                });
                addedUsers.push(uid);
            }
        }
        const updatedChat = await db_1.prisma.chat.findUnique({
            where: { id: chatId },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json({ ...updatedChat, addedUsers });
    }
    catch (error) {
        console.error('Invite to channel error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РїСЂРёРіР»Р°С€РµРЅРёСЏ РІ РєР°РЅР°Р»' });
    }
});
// ============================================
// рџ“ў РљРђРќРђР›Р« - РџРѕРґРїРёСЃРєР°/РћС‚РїРёСЃРєР°
// ============================================
// РџРѕРґРїРёСЃР°С‚СЊСЃСЏ РЅР° РєР°РЅР°Р»
router.post('/:id/subscribe', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const chat = await db_1.prisma.chat.findUnique({
            where: { id: chatId },
        });
        if (!chat || chat.type !== 'channel') {
            res.status(400).json({ error: 'РњРѕР¶РЅРѕ РїРѕРґРїРёСЃР°С‚СЊСЃСЏ С‚РѕР»СЊРєРѕ РЅР° РєР°РЅР°Р»' });
            return;
        }
        // Check if already subscribed
        const existing = await db_1.prisma.channelSubscriber.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (existing) {
            res.status(400).json({ error: 'Р’С‹ СѓР¶Рµ РїРѕРґРїРёСЃР°РЅС‹ РЅР° СЌС‚РѕС‚ РєР°РЅР°Р»' });
            return;
        }
        await db_1.prisma.channelSubscriber.create({
            data: {
                chatId,
                userId: req.userId,
            },
        });
        // Also add to chat members if not already
        const existingMember = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!existingMember) {
            await db_1.prisma.chatMember.create({
                data: {
                    chatId,
                    userId: req.userId,
                    role: 'member',
                },
            });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Subscribe to channel error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕРґРїРёСЃРєРё РЅР° РєР°РЅР°Р»' });
    }
});
// РћС‚РїРёСЃР°С‚СЊСЃСЏ РѕС‚ РєР°РЅР°Р»Р°
router.delete('/:id/subscribe', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        await db_1.prisma.channelSubscriber.delete({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        // Also remove from chat members
        await db_1.prisma.chatMember.delete({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Unsubscribe from channel error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РѕС‚РїРёСЃРєРё РѕС‚ РєР°РЅР°Р»Р°' });
    }
});
// ============================================
// рџ”— РЎРЎР«Р›РљР-РџР РР“Р›РђРЁР•РќРРЇ
// ============================================
// РЎРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ СЃСЃС‹Р»РєСѓ-РїСЂРёРіР»Р°С€РµРЅРёРµ
router.post('/:id/invite-link', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const { name } = req.body;
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ СЃРѕР·РґР°РІР°С‚СЊ СЃСЃС‹Р»РєРё' });
            return;
        }
        const chat = await db_1.prisma.chat.findUnique({ where: { id: chatId } });
        if (!chat) {
            res.status(404).json({ error: 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
            return;
        }
        // Generate unique invite link
        const inviteLink = `invite_${chatId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        await db_1.prisma.chat.update({
            where: { id: chatId },
            data: { inviteLink },
        });
        res.json({ inviteLink, chatId: chat.id, chatName: chat.name || chat.username });
    }
    catch (error) {
        console.error('Generate invite link error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё СЃСЃС‹Р»РєРё' });
    }
});
// Р’СЃС‚СѓРїРёС‚СЊ РїРѕ СЃСЃС‹Р»РєРµ-РїСЂРёРіР»Р°С€РµРЅРёСЋ
router.post('/join/:inviteLink', async (req, res) => {
    try {
        const { inviteLink } = req.params;
        const chat = await db_1.prisma.chat.findFirst({
            where: { inviteLink },
        });
        if (!chat) {
            res.status(404).json({ error: 'РЎСЃС‹Р»РєР° РЅРµ РЅР°Р№РґРµРЅР°' });
            return;
        }
        // Check if already member
        const existingMember = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId: chat.id, userId: req.userId } },
        });
        if (existingMember) {
            res.status(400).json({ error: 'Р’С‹ СѓР¶Рµ СЏРІР»СЏРµС‚РµСЃСЊ СѓС‡Р°СЃС‚РЅРёРєРѕРј' });
            return;
        }
        // Add to chat members
        await db_1.prisma.chatMember.create({
            data: {
                chatId: chat.id,
                userId: req.userId,
                role: chat.type === 'channel' ? 'member' : 'member',
            },
        });
        // For channels, also add to subscribers
        if (chat.type === 'channel') {
            await db_1.prisma.channelSubscriber.create({
                data: {
                    chatId: chat.id,
                    userId: req.userId,
                },
            });
        }
        res.json({ success: true, chat: { id: chat.id, name: chat.name, username: chat.username, type: chat.type } });
    }
    catch (error) {
        console.error('Join by invite link error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РІСЃС‚СѓРїР»РµРЅРёСЏ РїРѕ СЃСЃС‹Р»РєРµ' });
    }
});
// ============================================
// вљ™пёЏ РќРђРЎРўР РћР™РљР РљРђРќРђР›Рђ
// ============================================
// РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё РєР°РЅР°Р»Р° (РїСѓР±Р»РёС‡РЅС‹Р№/РїСЂРёРІР°С‚РЅС‹Р№)
router.put('/:id/settings', async (req, res) => {
    try {
        const chatId = parseInt(req.params.id, 10);
        const { isPublic, username, description } = req.body;
        const member = await db_1.prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId, userId: req.userId } },
        });
        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            res.status(403).json({ error: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РёР·РјРµРЅСЏС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё' });
            return;
        }
        const chat = await db_1.prisma.chat.findUnique({ where: { id: chatId } });
        if (!chat || chat.type !== 'channel') {
            res.status(400).json({ error: 'Р§Р°С‚ РЅРµ СЏРІР»СЏРµС‚СЃСЏ РєР°РЅР°Р»РѕРј' });
            return;
        }
        // Validate username if provided
        if (username !== undefined) {
            if (username && (username.length < 3 || username.length > 32)) {
                res.status(400).json({ error: 'Р®Р·РµСЂРЅРµР№Рј РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РѕС‚ 3 РґРѕ 32 СЃРёРјРІРѕР»РѕРІ' });
                return;
            }
            if (username && !/^[a-zA-Z0-9_]+$/.test(username)) {
                res.status(400).json({ error: 'Р®Р·РµСЂРЅРµР№Рј РјРѕР¶РµС‚ СЃРѕРґРµСЂР¶Р°С‚СЊ С‚РѕР»СЊРєРѕ Р±СѓРєРІС‹, С†РёС„СЂС‹ Рё РїРѕРґС‡С‘СЂРєРёРІР°РЅРёСЏ' });
                return;
            }
            // Check if username is taken by another channel
            if (username) {
                const existing = await db_1.prisma.chat.findFirst({
                    where: {
                        username: username.toLowerCase(),
                        NOT: { id: chatId },
                    },
                });
                if (existing) {
                    res.status(400).json({ error: 'Р­С‚РѕС‚ СЋР·РµСЂРЅРµР№Рј СѓР¶Рµ Р·Р°РЅСЏС‚' });
                    return;
                }
            }
        }
        const updated = await db_1.prisma.chat.update({
            where: { id: chatId },
            data: {
                isPublic: isPublic !== undefined ? isPublic : undefined,
                username: username ? username.toLowerCase() : null,
                description: description !== undefined ? description?.slice(0, 255) : undefined,
            },
            include: {
                members: { include: { user: { select: shared_1.USER_SELECT } } },
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: { select: { id: true, username: true, displayName: true } },
                        readBy: { select: { userId: true } },
                    },
                },
            },
        });
        res.json(updated);
    }
    catch (error) {
        console.error('Update channel settings error:', error);
        res.status(500).json({ error: 'РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє РєР°РЅР°Р»Р°' });
    }
});
exports.default = router;
//# sourceMappingURL=chats.js.map