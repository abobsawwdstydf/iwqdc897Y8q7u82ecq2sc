// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import { uploadFile, deleteUploadedFile, encryptUploadedFile } from '../shared';

const router = Router();

// ============================================
// вњЁ РђРќРРњРР РћР’РђРќРќР«Р• Р­РњРћР”Р—Р (Custom Emoji)
// ============================================

// РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ РїР°РєРё СЌРјРѕРґР·Рё
router.get('/packs', async (req: Request, res: Response) => {
  try {
    const packs = await prisma.customEmojiPack.findMany({
      include: {
        emojis: {
          orderBy: { position: 'asc' },
          take: 10, // Preview
        },
        _count: {
          select: { emojis: true, users: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(packs);
  } catch (error) {
    console.error('Get emoji packs error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РїР°РєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РёР·Р±СЂР°РЅРЅС‹Рµ)
router.get('/packs/my', async (req: Request, res: Response) => {
  try {
    const userPacks = await prisma.userCustomEmojiPack.findMany({
      where: { userId: req.userId },
      include: {
        pack: {
          include: {
            emojis: {
              orderBy: { position: 'asc' },
            },
            _count: {
              select: { emojis: true, users: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(userPacks.map(up => up.pack));
  } catch (error) {
    console.error('Get my emoji packs error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЎРѕР·РґР°С‚СЊ СЃРІРѕР№ РїР°Рє СЌРјРѕРґР·Рё
router.post('/packs', async (req: Request, res: Response) => {
  try {
    const { name, title, description } = req.body as {
      name?: string;
      title?: string;
      description?: string;
    };

    // Validate name (unique identifier)
    if (!name || typeof name !== 'string' || name.length < 3 || name.length > 32) {
      res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РїР°РєР° РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕС‚ 3 РґРѕ 32 СЃРёРјРІРѕР»РѕРІ' });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РїР°РєР° РјРѕР¶РµС‚ СЃРѕРґРµСЂР¶Р°С‚СЊ С‚РѕР»СЊРєРѕ Р±СѓРєРІС‹, С†РёС„СЂС‹ Рё РїРѕРґС‡С‘СЂРєРёРІР°РЅРёСЏ' });
      return;
    }

    // Validate title
    if (!title || typeof title !== 'string' || title.length > 100) {
      res.status(400).json({ error: 'Р—Р°РіРѕР»РѕРІРѕРє РїР°РєР° РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РґР»РёРЅРЅРµРµ 100 СЃРёРјРІРѕР»РѕРІ' });
      return;
    }

    // Check if name is taken
    const existing = await prisma.customEmojiPack.findUnique({
      where: { name: name.toLowerCase() },
    });

    if (existing) {
      res.status(400).json({ error: 'РџР°Рє СЃ С‚Р°РєРёРј РЅР°Р·РІР°РЅРёРµРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚' });
      return;
    }

    const pack = await prisma.customEmojiPack.create({
      data: {
        ownerId: req.userId!,
        name: name.toLowerCase(),
        title,
        description: description || null,
      },
    });

    res.json(pack);
  } catch (error) {
    console.error('Create emoji pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РїР°Рє РїРѕ ID
router.get('/packs/:id', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.customEmojiPack.findUnique({
      where: { id: packId },
      include: {
        emojis: {
          orderBy: { position: 'asc' },
        },
        owner: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
        _count: {
          select: { emojis: true, users: true },
        },
      },
    });

    if (!pack) {
      res.status(404).json({ error: 'РџР°Рє РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    res.json(pack);
  } catch (error) {
    console.error('Get emoji pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// Р”РѕР±Р°РІРёС‚СЊ СЌРјРѕРґР·Рё РІ РїР°Рє
router.post('/packs/:id/emojis', uploadFile.single('file'), encryptUploadedFile, async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);
    const { emoji } = req.body as { emoji?: string };

    const pack = await prisma.customEmojiPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ РґРѕР±Р°РІР»РµРЅРёСЏ СЌРјРѕРґР·Рё РІ СЌС‚РѕС‚ РїР°Рє' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });
      return;
    }

    // Get max position
    const maxPosition = await prisma.customEmoji.aggregate({
      where: { packId },
      _max: { position: true },
    });

    // Generate unique emoji identifier if not provided
    const emojiId = emoji || `emoji_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const customEmoji = await prisma.customEmoji.create({
      data: {
        packId,
        emoji: emojiId,
        url: `/uploads/${req.file.filename}`,
        position: (maxPosition._max.position || 0) + 1,
      },
    });

    res.json(customEmoji);
  } catch (error) {
    console.error('Add emoji error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ СЌРјРѕРґР·Рё РёР· РїР°РєР°
router.delete('/packs/:packId/emojis/:emojiId', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.packId as string, 10);
    const emojiId = decodeURIComponent(req.params.emojiId);

    const pack = await prisma.customEmojiPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ СЌРјРѕРґР·Рё РёР· СЌС‚РѕРіРѕ РїР°РєР°' });
      return;
    }

    const emoji = await prisma.customEmoji.findFirst({
      where: { packId, emoji: emojiId },
    });

    if (!emoji) {
      res.status(404).json({ error: 'Р­РјРѕРґР·Рё РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    // Delete file
    deleteUploadedFile(emoji.url);

    await prisma.customEmoji.delete({
      where: { id: emoji.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete emoji error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ РїР°Рє СЌРјРѕРґР·Рё
router.delete('/packs/:id', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.customEmojiPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ СЌС‚РѕРіРѕ РїР°РєР°' });
      return;
    }

    // Delete all emoji files
    const emojis = await prisma.customEmoji.findMany({
      where: { packId },
      select: { url: true },
    });

    for (const emoji of emojis) {
      deleteUploadedFile(emoji.url);
    }

    await prisma.customEmojiPack.delete({
      where: { id: packId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete emoji pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ============================================
// РР—Р‘Р РђРќРќР«Р• РџРђРљР Р­РњРћР”Р—Р
// ============================================

// Р”РѕР±Р°РІРёС‚СЊ РїР°Рє РІ РёР·Р±СЂР°РЅРЅС‹Рµ
router.post('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.customEmojiPack.findUnique({
      where: { id: packId },
    });

    if (!pack) {
      res.status(404).json({ error: 'РџР°Рє РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    const existing = await prisma.userCustomEmojiPack.findUnique({
      where: { userId_packId: { userId: req.userId!, packId } },
    });

    if (existing) {
      res.json({ success: true, alreadyExists: true });
      return;
    }

    await prisma.userCustomEmojiPack.create({
      data: {
        userId: req.userId!,
        packId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Add favorite emoji pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ РїР°Рє РёР· РёР·Р±СЂР°РЅРЅС‹С…
router.delete('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    await prisma.userCustomEmojiPack.delete({
      where: { userId_packId: { userId: req.userId!, packId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite emoji pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

export default router;
