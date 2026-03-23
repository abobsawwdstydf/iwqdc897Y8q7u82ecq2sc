"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const db_1 = require("../db");
const shared_1 = require("../shared");
const router = (0, express_1.Router)();
const STORY_EXPIRY_HOURS = 48;
// Get all active stories (grouped by user) - only stories from last 48 hours
router.get('/', async (req, res) => {
    try {
        const userId = req.userId;
        const now = new Date();
        const expiryDate = new Date(now.getTime() - (STORY_EXPIRY_HOURS * 60 * 60 * 1000));
        // Get accepted friends
        const friendships = await db_1.prisma.friendship.findMany({
            where: {
                status: 'accepted',
                OR: [{ userId }, { friendId: userId }],
            },
            select: { userId: true, friendId: true },
        });
        const friendIds = friendships.map(f => f.userId === userId ? f.friendId : f.userId);
        friendIds.push(userId);
        const stories = await db_1.prisma.story.findMany({
            where: {
                userId: { in: friendIds },
                createdAt: { gte: expiryDate },
                expiresAt: { gt: now },
            },
            include: {
                user: {
                    select: { id: true, username: true, displayName: true, avatar: true },
                },
                views: {
                    select: { userId: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        const grouped = {};
        for (const story of stories) {
            if (!grouped[story.userId]) {
                grouped[story.userId] = {
                    user: story.user,
                    stories: [],
                    hasUnviewed: false,
                };
            }
            const viewed = story.views.some(v => v.userId === userId);
            grouped[story.userId].stories.push({
                id: story.id,
                type: story.type,
                mediaUrl: story.mediaUrl,
                content: story.content,
                bgColor: story.bgColor,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt,
                viewCount: story.views.length,
                viewed,
            });
            if (!viewed && story.userId !== userId) {
                grouped[story.userId].hasUnviewed = true;
            }
        }
        const result = Object.values(grouped).sort((a, b) => {
            if (a.user.id === userId)
                return -1;
            if (b.user.id === userId)
                return 1;
            if (a.hasUnviewed && !b.hasUnviewed)
                return -1;
            if (!a.hasUnviewed && b.hasUnviewed)
                return 1;
            return 0;
        });
        res.json(result);
    }
    catch (error) {
        console.error('Get stories error:', error);
        res.status(500).json({ error: 'Ошибка получения историй' });
    }
});
// Create a story
router.post('/', async (req, res) => {
    try {
        const userId = req.userId;
        const { type, mediaUrl, content, bgColor } = req.body;
        // Validate mediaUrl to prevent path traversal
        if (mediaUrl) {
            if (typeof mediaUrl !== 'string' || !mediaUrl.startsWith('/uploads/') || mediaUrl.includes('..')) {
                res.status(400).json({ error: 'Недопустимый URL медиафайла' });
                return;
            }
        }
        const story = await db_1.prisma.story.create({
            data: {
                userId,
                type: type || 'text',
                mediaUrl,
                content,
                bgColor: bgColor || '#6366f1',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
            include: {
                user: {
                    select: { id: true, username: true, displayName: true, avatar: true },
                },
                views: true,
            },
        });
        res.json(story);
    }
    catch (error) {
        console.error('Create story error:', error);
        res.status(500).json({ error: 'Ошибка создания истории' });
    }
});
// View a story - 1 view per person per day
router.post('/:storyId/view', async (req, res) => {
    try {
        const userId = req.userId;
        const storyId = parseInt(req.params.storyId, 10);
        // Verify story exists and viewer is the owner or a friend
        const story = await db_1.prisma.story.findUnique({
            where: { id: storyId },
            select: { userId: true, createdAt: true }
        });
        if (!story) {
            res.status(404).json({ error: 'История не найдена' });
            return;
        }
        if (story.userId !== userId) {
            const friendship = await db_1.prisma.friendship.findFirst({
                where: {
                    status: 'accepted',
                    OR: [
                        { userId, friendId: story.userId },
                        { userId: story.userId, friendId: userId },
                    ],
                },
            });
            if (!friendship) {
                res.status(403).json({ error: 'Нет доступа' });
                return;
            }
        }
        // Check if user already viewed this story today (1 view per day)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const existingView = await db_1.prisma.storyView.findFirst({
            where: {
                storyId,
                userId,
                viewedAt: { gte: startOfDay },
            },
        });
        if (!existingView) {
            // Add view only if not viewed today
            await db_1.prisma.storyView.create({
                data: { storyId, userId },
            });
        }
        res.json({ success: true, viewed: !existingView });
    }
    catch (error) {
        console.error('View story error:', error);
        res.status(500).json({ error: 'Ошибка просмотра истории' });
    }
});
// Get story viewers
router.get('/:storyId/viewers', async (req, res) => {
    try {
        const userId = req.userId;
        const storyId = parseInt(req.params.storyId, 10);
        const story = await db_1.prisma.story.findUnique({ where: { id: storyId }, select: { userId: true } });
        if (!story || story.userId !== userId) {
            res.status(403).json({ error: 'Только автор может просматривать аудиторию' });
            return;
        }
        const views = await db_1.prisma.storyView.findMany({
            where: {
                storyId,
                user: { hideStoryViews: false },
            },
            include: {
                user: {
                    select: { id: true, username: true, displayName: true, avatar: true },
                },
            },
            orderBy: { viewedAt: 'desc' },
        });
        res.json(views.map(v => ({
            userId: v.userId,
            username: v.user.username,
            displayName: v.user.displayName,
            avatar: v.user.avatar,
            viewedAt: v.viewedAt,
        })));
    }
    catch (error) {
        console.error('Get story viewers error:', error);
        res.status(500).json({ error: 'Ошибка получения просмотров' });
    }
});
// Get all user stories (for profile tab) - includes expired stories
router.get('/user/:userId/all', async (req, res) => {
    try {
        const targetUserId = parseInt(req.params.userId, 10);
        const requestingUserId = req.userId;
        // Check if users are friends or viewing own stories
        if (targetUserId !== requestingUserId) {
            const friendship = await db_1.prisma.friendship.findFirst({
                where: {
                    status: 'accepted',
                    OR: [
                        { userId: requestingUserId, friendId: targetUserId },
                        { userId: targetUserId, friendId: requestingUserId },
                    ],
                },
            });
            if (!friendship) {
                res.status(403).json({ error: 'Нет доступа' });
                return;
            }
        }
        const stories = await db_1.prisma.story.findMany({
            where: {
                userId: targetUserId,
            },
            include: {
                user: {
                    select: { id: true, username: true, displayName: true, avatar: true },
                },
                views: {
                    where: { userId: requestingUserId },
                    select: { viewedAt: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(stories.map(s => ({
            id: s.id,
            type: s.type,
            mediaUrl: s.mediaUrl,
            content: s.content,
            bgColor: s.bgColor,
            createdAt: s.createdAt,
            expiresAt: s.expiresAt,
            isExpired: s.expiresAt < new Date(),
            viewed: s.views.length > 0,
            viewedAt: s.views[0]?.viewedAt,
        })));
    }
    catch (error) {
        console.error('Get user stories error:', error);
        res.status(500).json({ error: 'Ошибка получения историй' });
    }
});
// Delete own story
router.delete('/:storyId', async (req, res) => {
    try {
        const userId = req.userId;
        const storyId = parseInt(req.params.storyId, 10);
        const story = await db_1.prisma.story.findUnique({ where: { id: storyId } });
        if (!story || story.userId !== userId) {
            res.status(403).json({ error: 'Нет прав' });
            return;
        }
        // Delete media file if present
        if (story.mediaUrl)
            (0, shared_1.deleteUploadedFile)(story.mediaUrl);
        await db_1.prisma.story.delete({ where: { id: storyId } });
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Delete story error:', error);
        res.status(500).json({ error: 'Ошибка удаления истории' });
    }
});
exports.default = router;
//# sourceMappingURL=stories.js.map