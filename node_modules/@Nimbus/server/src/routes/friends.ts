// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import { USER_SELECT } from '../shared';

const router = Router();

// в”Ђв”Ђв”Ђ Get accepted friends list в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: { select: USER_SELECT },
        friend: { select: USER_SELECT },
      },
    });

    const friends = friendships.map(f => ({
      ...(f.userId === userId ? f.friend : f.user),
      friendshipId: f.id,
    }));

    res.json(friends);
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РґСЂСѓР·РµР№' });
  }
});

// в”Ђв”Ђв”Ђ Get incoming friend requests в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.get('/requests', async (req: Request, res) => {
  try {
    const userId = req.userId!;

    const requests = await prisma.friendship.findMany({
      where: { friendId: userId, status: 'pending' },
      include: {
        user: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests.map(r => ({ id: r.id, user: r.user, createdAt: r.createdAt })));
  } catch (error) {
    console.error('Get friend requests error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·Р°СЏРІРѕРє' });
  }
});

// в”Ђв”Ђв”Ђ Get outgoing friend requests в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.get('/outgoing', async (req: Request, res) => {
  try {
    const userId = req.userId!;

    const requests = await prisma.friendship.findMany({
      where: { userId, status: 'pending' },
      include: {
        friend: { select: USER_SELECT },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(requests.map(r => ({ id: r.id, user: r.friend, createdAt: r.createdAt })));
  } catch (error) {
    console.error('Get outgoing requests error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·Р°СЏРІРѕРє' });
  }
});

// в”Ђв”Ђв”Ђ Get friendship status with a user в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.get('/status/:userId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const targetId = parseInt((req.params as { userId?: string }).userId as string, 10);

    if (userId === targetId) {
      res.json({ status: 'self' });
      return;
    }

    const friendship = await prisma.friendship.findFirst({
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
  } catch (error) {
    console.error('Get friend status error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃС‚Р°С‚СѓСЃР°' });
  }
});

// в”Ђв”Ђв”Ђ Send friend request в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.post('/request', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { friendId } = req.body as { friendId?: number };

    if (!friendId || typeof friendId !== 'number') {
      res.status(400).json({ error: 'ID РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РѕР±СЏР·Р°С‚РµР»РµРЅ' });
      return;
    }

    if (userId === friendId) {
      res.status(400).json({ error: 'РќРµР»СЊР·СЏ РґРѕР±Р°РІРёС‚СЊ СЃРµР±СЏ РІ РґСЂСѓР·СЊСЏ' });
      return;
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({ where: { id: friendId } });
    if (!targetUser) {
      res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    // Check for existing friendship in either direction
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'accepted') {
        res.status(400).json({ error: 'РЈР¶Рµ РІ РґСЂСѓР·СЊСЏС…' });
        return;
      }
      if (existing.status === 'pending') {
        // If they already sent us a request, auto-accept
        if (existing.userId === friendId) {
          const updated = await prisma.friendship.update({
            where: { id: existing.id },
            data: { status: 'accepted' },
            include: { user: { select: USER_SELECT }, friend: { select: USER_SELECT } },
          });
          res.json({ status: 'accepted', friendship: updated });
          return;
        }
        res.status(400).json({ error: 'Р—Р°СЏРІРєР° СѓР¶Рµ РѕС‚РїСЂР°РІР»РµРЅР°' });
        return;
      }
      if (existing.status === 'declined') {
        // Allow re-sending if previously declined вЂ” keep existing direction to avoid @@unique conflict
        const updated = await prisma.friendship.update({
          where: { id: existing.id },
          data: { status: 'pending' },
        });
        res.json({ status: 'pending', friendship: updated });
        return;
      }
    }

    const friendship = await prisma.friendship.create({
      data: { userId, friendId },
      include: { user: { select: USER_SELECT }, friend: { select: USER_SELECT } },
    });

    res.json({ status: 'pending', friendship });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё Р·Р°СЏРІРєРё' });
  }
});

// в”Ђв”Ђв”Ђ Accept friend request в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.post('/:id/accept', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const friendshipId = parseInt((req.params as { id?: string }).id as string, 10);

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });

    if (!friendship || friendship.friendId !== userId || friendship.status !== 'pending') {
      res.status(404).json({ error: 'Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР°' });
      return;
    }

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'accepted' },
      include: { user: { select: USER_SELECT }, friend: { select: USER_SELECT } },
    });

    // РђРІС‚РѕРјР°С‚РёС‡РµСЃРєРё СЃРѕР·РґР°С‚СЊ Р»РёС‡РЅС‹Р№ С‡Р°С‚ 1-РЅР°-1
    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'personal',
        AND: [
          { members: { some: { userId: friendship.userId } } },
          { members: { some: { userId: friendship.friendId } } },
        ],
      },
    });

    if (!existingChat) {
      await prisma.chat.create({
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
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РїСЂРёРЅСЏС‚РёСЏ Р·Р°СЏРІРєРё' });
  }
});

// в”Ђв”Ђв”Ђ Decline friend request в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.post('/:id/decline', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const friendshipId = parseInt((req.params as { id?: string }).id as string, 10);

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });

    if (!friendship || friendship.friendId !== userId || friendship.status !== 'pending') {
      res.status(404).json({ error: 'Р—Р°СЏРІРєР° РЅРµ РЅР°Р№РґРµРЅР°' });
      return;
    }

    await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'declined' },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° РѕС‚РєР»РѕРЅРµРЅРёСЏ Р·Р°СЏРІРєРё' });
  }
});

// в”Ђв”Ђв”Ђ Remove friend в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const friendshipId = parseInt((req.params as { id?: string }).id as string, 10);

    const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });

    if (!friendship || (friendship.userId !== userId && friendship.friendId !== userId)) {
      res.status(404).json({ error: 'Р”СЂСѓР¶Р±Р° РЅРµ РЅР°Р№РґРµРЅР°' });
      return;
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РґСЂСѓРіР°' });
  }
});

export default router;
