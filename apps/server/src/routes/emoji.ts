// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import { uploadFile, deleteUploadedFile, encryptUploadedFile } from '../shared';

const router = Router();

// ============================================
// ✨ АНИМИРОВАННЫЕ ЭМОДЗИ (Custom Emoji)
// ============================================

// Получить все паки эмодзи
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить паки пользователя (избранные)
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать свой пак эмодзи
router.post('/packs', async (req: Request, res: Response) => {
  try {
    const { name, title, description } = req.body as {
      name?: string;
      title?: string;
      description?: string;
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
    const existing = await prisma.customEmojiPack.findUnique({
      where: { name: name.toLowerCase() },
    });

    if (existing) {
      res.status(400).json({ error: 'Пак с таким названием уже существует' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить пак по ID
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
      res.status(404).json({ error: 'Пак не найден' });
      return;
    }

    res.json(pack);
  } catch (error) {
    console.error('Get emoji pack error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Добавить эмодзи в пак
router.post('/packs/:id/emojis', uploadFile.single('file'), encryptUploadedFile, async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);
    const { emoji } = req.body as { emoji?: string };

    const pack = await prisma.customEmojiPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'Нет прав для добавления эмодзи в этот пак' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить эмодзи из пака
router.delete('/packs/:packId/emojis/:emojiId', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.packId as string, 10);
    const emojiId = decodeURIComponent(req.params.emojiId);

    const pack = await prisma.customEmojiPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'Нет прав для удаления эмодзи из этого пака' });
      return;
    }

    const emoji = await prisma.customEmoji.findFirst({
      where: { packId, emoji: emojiId },
    });

    if (!emoji) {
      res.status(404).json({ error: 'Эмодзи не найден' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить пак эмодзи
router.delete('/packs/:id', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.customEmojiPack.findFirst({
      where: { id: packId, ownerId: req.userId },
    });

    if (!pack) {
      res.status(403).json({ error: 'Нет прав для удаления этого пака' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// ИЗБРАННЫЕ ПАКИ ЭМОДЗИ
// ============================================

// Добавить пак в избранные
router.post('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    const pack = await prisma.customEmojiPack.findUnique({
      where: { id: packId },
    });

    if (!pack) {
      res.status(404).json({ error: 'Пак не найден' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить пак из избранных
router.delete('/packs/:id/favorite', async (req: Request, res: Response) => {
  try {
    const packId = parseInt(req.params.id as string, 10);

    await prisma.userCustomEmojiPack.delete({
      where: { userId_packId: { userId: req.userId!, packId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove favorite emoji pack error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
