// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import { uploadFile, deleteUploadedFile, encryptUploadedFile } from '../shared';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============================================
// рџЋ­ РЎРўРРљР•Р Р«
// ============================================

// РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ РїР°РєРё СЃС‚РёРєРµСЂРѕРІ
router.get('/packs', async (req: Request, res: Response) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      where: { isOfficial: true },
      include: {
        stickers: {
          orderBy: { position: 'asc' },
          take: 10, // Preview
        },
        _count: {
          select: { stickers: true, users: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(packs);
  } catch (error) {
    console.error('Get sticker packs error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РїР°РєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РёР·Р±СЂР°РЅРЅС‹Рµ)
router.get('/packs/my', async (req: Request, res: Response) => {
  try {
    const userPacks = await prisma.userStickerPack.findMany({
      where: { userId: req.userId },
      include: {
        pack: {
          include: {
            stickers: {
              orderBy: { position: 'asc' },
            },
            _count: {
              select: { stickers: true, users: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(userPacks.map(up => up.pack));
  } catch (error) {
    console.error('Get my sticker packs error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЎРѕР·РґР°С‚СЊ СЃРІРѕР№ РїР°Рє СЃС‚РёРєРµСЂРѕРІ
router.post('/packs', async (req: Request, res: Response) => {
  try {
    const { name, title, description, isAnimated } = req.body as {
      name?: string;
      title?: string;
      description?: string;
      isAnimated?: boolean;
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
    const existing = await prisma.stickerPack.findUnique({
      where: { name: name.toLowerCase() },
    });

    if (existing) {
      res.status(400).json({ error: 'РџР°Рє СЃ С‚Р°РєРёРј РЅР°Р·РІР°РЅРёРµРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚' });
      return;
    }

    const pack = await prisma.stickerPack.create({
      data: {
        ownerId: req.userId!,
        name: name.toLowerCase(),
        title,
        description: description || null,
        isAnimated: isAnimated || false,
      },
    });

    res.json(pack);
  } catch (error) {
    console.error('Create sticker pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РїР°Рє РїРѕ ID
router.get('/packs/:id', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.stickerPack.findUnique({
      where: { id: packId },
      include: {
        stickers: {
          orderBy: { position: 'asc' },
        },
        owner: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
        _count: {
          select: { stickers: true, users: true },
        },
      },
    });

    if (!pack) {
      res.status(404).json({ error: 'РџР°Рє РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    res.json(pack);
  } catch (error) {
    console.error('Get sticker pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// Р”РѕР±Р°РІРёС‚СЊ СЃС‚РёРєРµСЂ РІ РїР°Рє
router.post('/packs/:id/stickers', uploadFile.single('file'), encryptUploadedFile, async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);
    const { emoji } = req.body as { emoji?: string };

    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ РґРѕР±Р°РІР»РµРЅРёСЏ СЃС‚РёРєРµСЂРѕРІ РІ СЌС‚РѕС‚ РїР°Рє' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });
      return;
    }

    // Get max position
    const maxPosition = await prisma.sticker.aggregate({
      where: { packId },
      _max: { position: true },
    });

    const sticker = await prisma.sticker.create({
      data: {
        packId,
        url: `/uploads/${req.file.filename}`,
        emoji: emoji || null,
        isAnimated: pack.isAnimated,
        position: (maxPosition._max.position || 0) + 1,
      },
    });

    res.json(sticker);
  } catch (error) {
    console.error('Add sticker error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ СЃС‚РёРєРµСЂ РёР· РїР°РєР°
router.delete('/packs/:packId/stickers/:stickerId', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.packId as string, 10);
    const stickerId = parseInt(req.params.stickerId as string, 10);

    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ СЃС‚РёРєРµСЂРѕРІ РёР· СЌС‚РѕРіРѕ РїР°РєР°' });
      return;
    }

    const sticker = await prisma.sticker.findUnique({
      where: { id: stickerId },
    });

    if (!sticker || sticker.packId !== packId) {
      res.status(404).json({ error: 'РЎС‚РёРєРµСЂ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    // Delete file
    deleteUploadedFile(sticker.url);

    await prisma.sticker.delete({
      where: { id: stickerId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete sticker error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ РїР°Рє СЃС‚РёРєРµСЂРѕРІ
router.delete('/packs/:id', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ СЌС‚РѕРіРѕ РїР°РєР°' });
      return;
    }

    // Delete all sticker files
    const stickers = await prisma.sticker.findMany({
      where: { packId },
      select: { url: true },
    });

    for (const sticker of stickers) {
      deleteUploadedFile(sticker.url);
    }

    await prisma.stickerPack.delete({
      where: { id: packId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete sticker pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ============================================
// РР—Р‘Р РђРќРќР«Р• РџРђРљР
// ============================================

// Р”РѕР±Р°РІРёС‚СЊ РїР°Рє РІ РёР·Р±СЂР°РЅРЅС‹Рµ
router.post('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.stickerPack.findUnique({
      where: { id: packId },
    });

    if (!pack) {
      res.status(404).json({ error: 'РџР°Рє РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    const existing = await prisma.userStickerPack.findUnique({
      where: { userId_packId: { userId: req.userId!, packId } },
    });

    if (existing) {
      res.json({ success: true, alreadyExists: true });
      return;
    }

    await prisma.userStickerPack.create({
      data: {
        userId: req.userId!,
        packId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Add favorite pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ РїР°Рє РёР· РёР·Р±СЂР°РЅРЅС‹С…
router.delete('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    await prisma.userStickerPack.delete({
      where: { userId_packId: { userId: req.userId!, packId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite pack error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

export default router;
