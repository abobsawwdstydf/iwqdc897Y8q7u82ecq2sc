// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import { uploadFile, deleteUploadedFile, encryptUploadedFile } from '../shared';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ============================================
// 🎭 СТИКЕРЫ
// ============================================

// Получить все паки стикеров
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить паки пользователя (избранные)
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать свой пак стикеров
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
      res.status(400).json({ error: 'Название пака должно быть от 3 до 32 символов' });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      res.status(400).json({ error: 'Название пака может содержать только буквы, цифры и подчёркивания' });
      return;
    }

    // Validate title
    if (!title || typeof title !== 'string' || title.length > 100) {
      res.status(400).json({ error: 'Заголовок пака должен быть не длиннее 100 символов' });
      return;
    }

    // Check if name is taken
    const existing = await prisma.stickerPack.findUnique({
      where: { name: name.toLowerCase() },
    });

    if (existing) {
      res.status(400).json({ error: 'Пак с таким названием уже существует' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить пак по ID
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
      res.status(404).json({ error: 'Пак не найден' });
      return;
    }

    res.json(pack);
  } catch (error) {
    console.error('Get sticker pack error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Добавить стикер в пак
router.post('/packs/:id/stickers', uploadFile.single('file'), encryptUploadedFile, async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);
    const { emoji } = req.body as { emoji?: string };

    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'Нет прав для добавления стикеров в этот пак' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить стикер из пака
router.delete('/packs/:packId/stickers/:stickerId', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.packId as string, 10);
    const stickerId = parseInt(req.params.stickerId as string, 10);

    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'Нет прав для удаления стикеров из этого пака' });
      return;
    }

    const sticker = await prisma.sticker.findUnique({
      where: { id: stickerId },
    });

    if (!sticker || sticker.packId !== packId) {
      res.status(404).json({ error: 'Стикер не найден' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить пак стикеров
router.delete('/packs/:id', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.stickerPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'Нет прав для удаления этого пака' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// ИЗБРАННЫЕ ПАКИ
// ============================================

// Добавить пак в избранные
router.post('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.stickerPack.findUnique({
      where: { id: packId },
    });

    if (!pack) {
      res.status(404).json({ error: 'Пак не найден' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить пак из избранных
router.delete('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    await prisma.userStickerPack.delete({
      where: { userId_packId: { userId: req.userId!, packId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite pack error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
