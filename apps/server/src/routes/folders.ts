// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
const router = Router();

// ============================================
// 📁 ПАПКИ ЧАТОВ
// ============================================

// Получить все папки пользователя
router.get('/', async (req: Request, res: Response) => {
  try {
    const folders = await prisma.chatFolder.findMany({
      where: { userId: req.userId },
      include: {
        chats: {
          include: {
            folder: {
              select: { id: true, name: true },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    res.json(folders);
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать папку
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color, icon, chatIds } = req.body as {
      name?: string;
      color?: string;
      icon?: string;
      chatIds?: number[];
    };

    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 50) {
      res.status(400).json({ error: 'Название папки должно быть от 1 до 50 символов' });
      return;
    }

    // Check if folder with same name exists
    const existing = await prisma.chatFolder.findUnique({
      where: { userId_name: { userId: req.userId!, name: name.trim() } },
    });

    if (existing) {
      res.status(400).json({ error: 'Папка с таким названием уже существует' });
      return;
    }

    // Get max position
    const maxPosition = await prisma.chatFolder.aggregate({
      where: { userId: req.userId },
      _max: { position: true },
    });

    const folder = await prisma.chatFolder.create({
      data: {
        userId: req.userId!,
        name: name.trim(),
        color: color || '#6366f1',
        icon: icon || 'folder',
        position: (maxPosition._max.position || 0) + 1,
        chats: chatIds && chatIds.length > 0 ? {
          create: chatIds.map((chatId, index) => ({
            chatId,
            position: index,
          })),
        } : undefined,
      },
      include: {
        chats: {
          include: {
            folder: {
              select: { id: true, name: true },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    res.json(folder);
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить папку
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id as string, 10);
    const { name, color, icon } = req.body as {
      name?: string;
      color?: string;
      icon?: string;
    };

    const folder = await prisma.chatFolder.findFirst({
      where: { id: folderId, userId: req.userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    // Check if new name conflicts
    if (name && name !== folder.name) {
      const existing = await prisma.chatFolder.findUnique({
        where: { userId_name: { userId: req.userId!, name: name.trim() } },
      });

      if (existing && existing.id !== folderId) {
        res.status(400).json({ error: 'Папка с таким названием уже существует' });
        return;
      }
    }

    const updated = await prisma.chatFolder.update({
      where: { id: folderId },
      data: {
        name: name ? name.trim() : undefined,
        color,
        icon,
      },
      include: {
        chats: {
          include: {
            folder: {
              select: { id: true, name: true },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить папку
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id as string, 10);

    const folder = await prisma.chatFolder.findFirst({
      where: { id: folderId, userId: req.userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    await prisma.chatFolder.delete({
      where: { id: folderId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Добавить чат в папку
router.post('/:id/chats', async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id as string, 10);
    const { chatIds } = req.body as { chatIds?: number[] };

    if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
      res.status(400).json({ error: 'Необходимо указать чаты' });
      return;
    }

    const folder = await prisma.chatFolder.findFirst({
      where: { id: folderId, userId: req.userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    // Get max position
    const maxPosition = await prisma.chatFolderChat.aggregate({
      where: { folderId },
      _max: { position: true },
    });

    const startPosition = (maxPosition._max.position || 0) + 1;

    // Add chats (skip if already exists)
    for (let i = 0; i < chatIds.length; i++) {
      await prisma.chatFolderChat.upsert({
        where: { folderId_chatId: { folderId, chatId: chatIds[i] } },
        create: {
          folderId,
          chatId: chatIds[i],
          position: startPosition + i,
        },
        update: {},
      });
    }

    const updated = await prisma.chatFolder.findUnique({
      where: { id: folderId },
      include: {
        chats: {
          include: {
            folder: {
              select: { id: true, name: true },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Add chats to folder error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить чат из папки
router.delete('/:folderId/chats/:chatId', async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.folderId as string, 10);
    const chatId = parseInt(req.params.chatId as string, 10);

    const folder = await prisma.chatFolder.findFirst({
      where: { id: folderId, userId: req.userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    await prisma.chatFolderChat.delete({
      where: { folderId_chatId: { folderId, chatId } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Remove chat from folder error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить порядок чатов в папке
router.put('/:id/chats/reorder', async (req: Request, res: Response) => {
  try {
    const folderId = parseInt(req.params.id as string, 10);
    const { chatIds } = req.body as { chatIds?: number[] };

    if (!chatIds || !Array.isArray(chatIds)) {
      res.status(400).json({ error: 'Необходимо указать чаты' });
      return;
    }

    const folder = await prisma.chatFolder.findFirst({
      where: { id: folderId, userId: req.userId },
    });

    if (!folder) {
      res.status(404).json({ error: 'Папка не найдена' });
      return;
    }

    await Promise.all(
      chatIds.map((chatId, index) =>
        prisma.chatFolderChat.update({
          where: { folderId_chatId: { folderId, chatId } },
          data: { position: index },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder folder chats error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
