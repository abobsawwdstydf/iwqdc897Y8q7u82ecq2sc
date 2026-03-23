// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { SENDER_SELECT, MESSAGE_INCLUDE, uploadFile, deleteUploadedFile, encryptUploadedFile } from '../shared';

// Multer file interface
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  destination: string;
  filename: string;
  path: string;
  size: number;
}

const router = Router();

// РџРѕР»СѓС‡РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ С‡Р°С‚Р°
router.get('/chat/:chatId', async (req: Request, res) => {
  try {
    const chatId = parseInt(req.params.chatId as string, 10);
    const { cursor, limit = '50' } = req.query;
    const take = Math.min(Math.max(1, parseInt(limit as string) || 50), 200);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕРјСѓ С‡Р°С‚Сѓ' });
      return;
    }

    const createdAtFilter: Record<string, Date> = {};
    if (cursor) createdAtFilter.lt = new Date(cursor as string);
    if (member.clearedAt) createdAtFilter.gt = member.clearedAt;

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        isDeleted: false,
        hiddenBy: { none: { userId: req.userId! } },
        // Scheduled messages: only visible to the sender until delivered
        OR: [
          { scheduledAt: null },
          { senderId: req.userId! },
        ],
        ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
    });

    res.json(messages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// Р—Р°РіСЂСѓР·РєР° РѕРґРЅРѕРіРѕ С„Р°Р№Р»Р°
router.post('/upload', uploadFile.single('file'), encryptUploadedFile, async (req: Request, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Р¤Р°Р№Р» РЅРµ Р·Р°РіСЂСѓР¶РµРЅ' });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    // multer decodes multipart filenames as latin1 вЂ” re-decode as UTF-8
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    res.json({
      url: fileUrl,
      filename: originalName,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё' });
  }
});

// Р—Р°РіСЂСѓР·РєР° РЅРµСЃРєРѕР»СЊРєРёС… С„Р°Р№Р»РѕРІ
router.post('/upload-multiple', uploadFile.array('files', 20), encryptUploadedFile, async (req: Request, res: Response) => {
  try {
    if (!(req as any).files || !Array.isArray((req as any).files) || (req as any).files.length === 0) {
      res.status(400).json({ error: 'Р¤Р°Р№Р»С‹ РЅРµ Р·Р°РіСЂСѓР¶РµРЅС‹' });
      return;
    }

    const results = (req as any).files.map((file: MulterFile) => {
      const fileUrl = `/uploads/${file.filename}`;
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      return {
        url: fileUrl,
        filename: originalName,
        size: file.size,
        mimetype: file.mimetype,
      };
    });

    res.json({ files: results });
  } catch (error) {
    console.error('Upload multiple error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё' });
  }
});

// Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content?: string };
    const id = parseInt((req.params as { id?: string }).id as string, 10);

    if (!content || typeof content !== 'string' || content.length > 10000) {
      res.status(400).json({ error: 'РЎРѕРґРµСЂР¶РёРјРѕРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ Рё РЅРµ РґРѕР»Р¶РЅРѕ РїСЂРµРІС‹С€Р°С‚СЊ 10000 СЃРёРјРІРѕР»РѕРІ' });
      return;
    }

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message || message.senderId !== req.userId) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СЂРµРґР°РєС‚РёСЂРѕРІР°РЅРёСЏ' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { content, isEdited: true },
      include: MESSAGE_INCLUDE,
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt((req.params as { id?: string }).id as string, 10);

    const message = await prisma.message.findUnique({
      where: { id },
      include: { media: true },
    });
    if (!message || message.senderId !== req.userId) {
      res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ' });
      return;
    }

    // Delete media files from disk
    if (message.media && message.media.length > 0) {
      for (const m of message.media) {
        if (m.url) deleteUploadedFile(m.url);
      }
      await prisma.media.deleteMany({ where: { messageId: id } });
    }

    await prisma.message.update({
      where: { id },
      data: { isDeleted: true, content: null },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РѕР±С‰РёРµ РјРµРґРёР°/С„Р°Р№Р»С‹/СЃСЃС‹Р»РєРё С‡Р°С‚Р°
router.get('/chat/:chatId/shared', async (req: Request, res: Response) => {
  try {
    const chatId = parseInt((req.params as { chatId?: string }).chatId as string, 10);
    const { type } = req.query as { type?: string };

    // Check membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });
    if (!member) {
      res.status(403).json({ error: 'РќРµС‚ РґРѕСЃС‚СѓРїР°' });
      return;
    }

    const baseWhere: Prisma.MessageWhereInput = {
      chatId,
      isDeleted: false,
      hiddenBy: { none: { userId: req.userId! } },
      ...(member.clearedAt ? { createdAt: { gt: member.clearedAt } } : {}),
    };

    if (type === 'media') {
      // Images and videos
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          media: { some: { type: { in: ['image', 'video'] } } },
        },
        include: {
          media: { where: { type: { in: ['image', 'video'] } } },
          sender: { select: SENDER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      res.json(messages);
    } else if (type === 'files') {
      // Files (documents, archives, audio, etc.)
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          media: { some: { type: { notIn: ['image', 'video'] } } },
        },
        include: {
          media: { where: { type: { notIn: ['image', 'video'] } } },
          sender: { select: SENDER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      res.json(messages);
    } else if (type === 'links') {
      // Messages containing URLs
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          content: { contains: 'http' },
        },
        include: {
          sender: { select: SENDER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      // Filter to only messages with actual URLs
      const withLinks = messages
        .filter((m) => m.content && /https?:\/\/[^\s]+/i.test(m.content))
        .map((m) => {
          const links = m.content!.match(/https?:\/\/[^\s]+/gi) || [];
          return { ...m, links };
        });
      res.json(withLinks);
    } else {
      res.status(400).json({ error: 'Invalid type. Use: media, files, or links' });
    }
  } catch (error) {
    console.error('Shared media error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

export default router;
