"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = require("express");
const db_1 = require("../db");
const shared_1 = require("../shared");
const router = (0, express_1.Router)();
// ─── Get accepted friends list ───────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const userId = req.userId;
        const friendships = await db_1.prisma.friendship.findMany({
            where: {
                status: 'accepted',
                OR: [{ userId }, { friendId: userId }],
            },
            include: {
                user: { select: shared_1.USER_SELECT },
                friend: { select: shared_1.USER_SELECT },
            },
        });
        const friends = friendships.map(f => ({
            ...(f.userId === userId ? f.friend : f.user),
            friendshipId: f.id,
        }));
        res.json(friends);
    }
    catch (error) {
        console.error('Get friends error:', error);
        res.status(500).json({ error: 'Ошибка получения друзей' });
    }
});
// ─── Get incoming friend requests ────────────────────────────────────
router.get('/requests', async (req, res) => {
    try {
        const userId = req.userId;
        const requests = await db_1.prisma.friendship.findMany({
            where: { friendId: userId, status: 'pending' },
            include: {
                user: { select: shared_1.USER_SELECT },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests.map(r => ({ id: r.id, user: r.user, createdAt: r.createdAt })));
    }
    catch (error) {
        console.error('Get friend requests error:', error);
        res.status(500).json({ error: 'Ошибка получения заявок' });
    }
});
// ─── Get outgoing friend requests ────────────────────────────────────
router.get('/outgoing', async (req, res) => {
    try {
        const userId = req.userId;
        const requests = await db_1.prisma.friendship.findMany({
            where: { userId, status: 'pending' },
            include: {
                friend: { select: shared_1.USER_SELECT },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests.map(r => ({ id: r.id, user: r.friend, createdAt: r.createdAt })));
    }
    catch (error) {
        console.error('Get outgoing requests error:', error);
        res.status(500).json({ error: 'Ошибка получения заявок' });
    }
});
// ─── Get friendship status with a user ───────────────────────────────
router.get('/status/:userId', async (req, res) => {
    try {
        const userId = req.userId;
        const targetId = parseInt(req.params.userId, 10);
        if (userId === targetId) {
            res.json({ status: 'self' });
            return;
        }
        const friendship = await db_1.prisma.friendship.findFirst({
            where: {
                OR: [
                    { userId, friendId: targetId },
                    { userId: targetId, friendId: userId },
                ],
            },
        });
        if (!friendship) {
            res.json({ status: 'none', friendshipId: null });
            return;
        }
        // Determine who sent the request to show correct action
        const direction = friendship.userId === userId ? 'outgoing' : 'incoming';
        res.json({ status: friendship.status, friendshipId: friendship.id, direction });
    }
    catch (error) {
        console.error('Get friend status error:', error);
        res.status(500).json({ error: 'Ошибка получения статуса' });
    }
});
// ─── Send friend request ─────────────────────────────────────────────
router.post('/request', async (req, res) => {
    try {
        const userId = req.userId;
        const { friendId } = req.body;
        if (!friendId || typeof friendId !== 'number') {
            res.status(400).json({ error: 'ID пользователя обязателен' });
            return;
        }
        if (userId === friendId) {
            res.status(400).json({ error: 'Нельзя добавить себя в друзья' });
            return;
        }
        // Check if target user exists
        const targetUser = await db_1.prisma.user.findUnique({ where: { id: friendId } });
        if (!targetUser) {
            res.status(404).json({ error: 'Пользователь не найден' });
            return;
        }
        // Check for existing friendship in either direction
        const existing = await db_1.prisma.friendship.findFirst({
            where: {
                OR: [
                    { userId, friendId },
                    { userId: friendId, friendId: userId },
                ],
            },
        });
        if (existing) {
            if (existing.status === 'accepted') {
                res.status(400).json({ error: 'Уже в друзьях' });
                return;
            }
            if (existing.status === 'pending') {
                // If they already sent us a request, auto-accept
                if (existing.userId === friendId) {
                    const updated = await db_1.prisma.friendship.update({
                        where: { id: existing.id },
                        data: { status: 'accepted' },
                        include: { user: { select: shared_1.USER_SELECT }, friend: { select: shared_1.USER_SELECT } },
                    });
                    res.json({ status: 'accepted', friendship: updated });
                    return;
                }
                res.status(400).json({ error: 'Заявка уже отправлена' });
                return;
            }
            if (existing.status === 'declined') {
                // Allow re-sending if previously declined — keep existing direction to avoid @@unique conflict
                const updated = await db_1.prisma.friendship.update({
                    where: { id: existing.id },
                    data: { status: 'pending' },
                });
                res.json({ status: 'pending', friendship: updated });
                return;
            }
        }
        const friendship = await db_1.prisma.friendship.create({
            data: { userId, friendId },
            include: { user: { select: shared_1.USER_SELECT }, friend: { select: shared_1.USER_SELECT } },
        });
        res.json({ status: 'pending', friendship });
    }
    catch (error) {
        console.error('Send friend request error:', error);
        res.status(500).json({ error: 'Ошибка отправки заявки' });
    }
});
// ─── Accept friend request ───────────────────────────────────────────
router.post('/:id/accept', async (req, res) => {
    try {
        const userId = req.userId;
        const friendshipId = parseInt(req.params.id, 10);
        const friendship = await db_1.prisma.friendship.findUnique({ where: { id: friendshipId } });
        if (!friendship || friendship.friendId !== userId || friendship.status !== 'pending') {
            res.status(404).json({ error: 'Заявка не найдена' });
            return;
        }
        const updated = await db_1.prisma.friendship.update({
            where: { id: friendshipId },
            data: { status: 'accepted' },
            include: { user: { select: shared_1.USER_SELECT }, friend: { select: shared_1.USER_SELECT } },
        });
        // Автоматически создать личный чат 1-на-1
        const existingChat = await db_1.prisma.chat.findFirst({
            where: {
                type: 'personal',
                AND: [
                    { members: { some: { userId: friendship.userId } } },
                    { members: { some: { userId: friendship.friendId } } },
                ],
            },
        });
        if (!existingChat) {
            await db_1.prisma.chat.create({
                data: {
                    type: 'personal',
                    members: {
                        create: [
                            { userId: friendship.userId },
                            { userId: friendship.friendId },
                        ],
                    },
                },
            });
        }
        res.json(updated);
    }
    catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({ error: 'Ошибка принятия заявки' });
    }
});
// ─── Decline friend request ──────────────────────────────────────────
router.post('/:id/decline', async (req, res) => {
    try {
        const userId = req.userId;
        const friendshipId = parseInt(req.params.id, 10);
        const friendship = await db_1.prisma.friendship.findUnique({ where: { id: friendshipId } });
        if (!friendship || friendship.friendId !== userId || friendship.status !== 'pending') {
            res.status(404).json({ error: 'Заявка не найдена' });
            return;
        }
        await db_1.prisma.friendship.update({
            where: { id: friendshipId },
            data: { status: 'declined' },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Decline friend request error:', error);
        res.status(500).json({ error: 'Ошибка отклонения заявки' });
    }
});
// ─── Remove friend ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const friendshipId = parseInt(req.params.id, 10);
        const friendship = await db_1.prisma.friendship.findUnique({ where: { id: friendshipId } });
        if (!friendship || (friendship.userId !== userId && friendship.friendId !== userId)) {
            res.status(404).json({ error: 'Дружба не найдена' });
            return;
        }
        await db_1.prisma.friendship.delete({ where: { id: friendshipId } });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Remove friend error:', error);
        res.status(500).json({ error: 'Ошибка удаления друга' });
    }
});
exports.default = router;
//# sourceMappingURL=friends.js.map