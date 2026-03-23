// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
const router = Router();

// ============================================
// рџ“ќ Р§Р•Р РќРћР’РРљР (Р°РІС‚РѕСЃРѕС…СЂР°РЅРµРЅРёРµ)
// ============================================

// РџРѕР»СѓС‡РёС‚СЊ С‡РµСЂРЅРѕРІРёРє РґР»СЏ С‡Р°С‚Р°
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
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ С‡РµСЂРЅРѕРІРёРєРё РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
router.get('/', async (req: Request, res: Response) => {
  try {
    const drafts = await prisma.draft.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(drafts);
  } catch (error) {
    console.error('Get all drafts error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЎРѕР·РґР°С‚СЊ РёР»Рё РѕР±РЅРѕРІРёС‚СЊ С‡РµСЂРЅРѕРІРёРє (Р°РІС‚РѕСЃРѕС…СЂР°РЅРµРЅРёРµ)
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
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ С‡РµСЂРЅРѕРІРёРє
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const draftId = parseInt(req.params.id as string, 10);

    const draft = await prisma.draft.findFirst({
      where: { id: draftId, userId: req.userId },
    });

    if (!draft) {
      res.status(404).json({ error: 'Р§РµСЂРЅРѕРІРёРє РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    await prisma.draft.delete({
      where: { id: draftId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РћС‡РёСЃС‚РёС‚СЊ РІСЃРµ С‡РµСЂРЅРѕРІРёРєРё
router.delete('/', async (req: Request, res: Response) => {
  try {
    await prisma.draft.deleteMany({
      where: { userId: req.userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear all drafts error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

export default router;
