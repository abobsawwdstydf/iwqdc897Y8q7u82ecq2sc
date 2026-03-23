// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
const router = Router();

// ============================================
// 📝 ЧЕРНОВИКИ (автосохранение)
// ============================================

// Получить черновик для чата
router.get('/chat/:chatId', async (req: Request, res: Response) => {
  try {
    const chatId = parseInt(req.params.chatId as string, 10);

    const draft = await prisma.draft.findFirst({
      where: {
        userId: req.userId,
        chatId,
      },
    });

    res.json(draft || { content: '', media: null });
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить все черновики пользователя
router.get('/', async (req: Request, res: Response) => {
  try {
    const drafts = await prisma.draft.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(drafts);
  } catch (error) {
    console.error('Get all drafts error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать или обновить черновик (автосохранение)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { chatId, content, media } = req.body as {
      chatId?: number | null;
      content?: string;
      media?: any[];
    };

    const existing = await prisma.draft.findFirst({
      where: {
        userId: req.userId,
        chatId: chatId || null,
      },
    });

    let draft;
    if (existing) {
      draft = await prisma.draft.update({
        where: { id: existing.id },
        data: {
          content: content || '',
          media: media ? JSON.parse(JSON.stringify(media)) : null,
        },
      });
    } else {
      draft = await prisma.draft.create({
        data: {
          userId: req.userId!,
          chatId: chatId || null,
          content: content || '',
          media: media ? JSON.parse(JSON.stringify(media)) : null,
        },
      });
    }

    res.json(draft);
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить черновик
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const draftId = parseInt(req.params.id as string, 10);

    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId: req.userId },
    });

    if (!draft) {
      res.status(404).json({ error: 'Черновик не найден' });
      return;
    }

    await prisma.draft.delete({
      where: { id: draftId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Очистить все черновики
router.delete('/', async (req: Request, res: Response) => {
  try {
    await prisma.draft.deleteMany({
      where: { userId: req.userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear all drafts error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
