// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import crypto from 'crypto';

const router = Router();

// ============================================
// рџ”’ РЎР•РљР Р•РўРќР«Р• Р§РђРўР« (СЃ С‚Р°Р№РјРµСЂРѕРј СѓРґР°Р»РµРЅРёСЏ)
// ============================================

// РЎРѕР·РґР°С‚СЊ СЃРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚
router.post('/', async (req: Request, res: Response) => {
  try {
    const { receiverId, ttl } = req.body as {
      receiverId?: number;
      ttl?: number; // time to live in seconds
    };

    if (!receiverId) {
      res.status(400).json({ error: 'ID РїРѕР»СѓС‡Р°С‚РµР»СЏ РѕР±СЏР·Р°С‚РµР»РµРЅ' });
      return;
    }

    if (receiverId === req.userId) {
      res.status(400).json({ error: 'РќРµР»СЊР·СЏ СЃРѕР·РґР°С‚СЊ СЃРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ СЃ СЃР°РјРёРј СЃРѕР±РѕР№' });
      return;
    }

    // Validate TTL (1 second to 7 days)
    const validTtl = Math.max(1, Math.min(604800, ttl || 60));

    // Check if secret chat already exists
    const existing = await prisma.secretChat.findFirst({
      where: {
        OR: [
          { senderId: req.userId, receiverId },
          { senderId: receiverId, receiverId: req.userId! },
        ],
        isDestroyed: false,
      },
      include: {
        chat: true,
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        receiver: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    if (existing) {
      res.json(existing);
      return;
    }

    // Generate encryption key
    const encryptionKey = crypto.randomBytes(32).toString('hex');

    // Create chat first
    const chat = await prisma.chat.create({
      data: {
        type: 'secret',
        name: null,
      },
    });

    // Create secret chat
    const secretChat = await prisma.secretChat.create({
      data: {
        chatId: chat.id,
        senderId: req.userId!,
        receiverId,
        encryptionKey,
        ttl: validTtl,
      },
      include: {
        chat: true,
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        receiver: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    // Add members to chat
    await prisma.chatMember.createMany({
      data: [
        { chatId: chat.id, userId: req.userId!, role: 'admin' },
        { chatId: chat.id, userId: receiverId, role: 'member' },
      ],
    });

    res.json(secretChat);
  } catch (error) {
    console.error('Create secret chat error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ СЃРµРєСЂРµС‚РЅС‹Рµ С‡Р°С‚С‹ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
router.get('/', async (req: Request, res: Response) => {
  try {
    const secretChats = await prisma.secretChat.findMany({
      where: {
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
        isDestroyed: false,
      },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, username: true, displayName: true, avatar: true, isOnline: true, lastSeen: true },
                },
              },
            },
          },
        },
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        receiver: { select: { id: true, username: true, displayName: true, avatar: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(secretChats);
  } catch (error) {
    console.error('Get secret chats error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ СЃРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РїРѕ ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const secretChatId = parseInt(req.params.id as string, 10);

    const secretChat = await prisma.secretChat.findFirst({
      where: {
        id: secretChatId,
        isDestroyed: false,
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
      },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, username: true, displayName: true, avatar: true, isOnline: true, lastSeen: true },
                },
              },
            },
          },
        },
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        receiver: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    if (!secretChat) {
      res.status(404).json({ error: 'РЎРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    res.json(secretChat);
  } catch (error) {
    console.error('Get secret chat error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РћР±РЅРѕРІРёС‚СЊ TTL СЃРµРєСЂРµС‚РЅРѕРіРѕ С‡Р°С‚Р°
router.put('/:id/ttl', async (req: Request, res: Response) => {
  try {
    const secretChatId = parseInt(req.params.id as string, 10);
    const { ttl } = req.body as { ttl?: number };

    const secretChat = await prisma.secretChat.findFirst({
      where: {
        id: secretChatId,
        isDestroyed: false,
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
      },
    });

    if (!secretChat) {
      res.status(404).json({ error: 'РЎРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    // Only sender can change TTL
    if (secretChat.senderId !== req.userId) {
      res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ С‡Р°С‚Р° РјРѕР¶РµС‚ РёР·РјРµРЅСЏС‚СЊ С‚Р°Р№РјРµСЂ' });
      return;
    }

    // Validate TTL (1 second to 7 days)
    const validTtl = Math.max(1, Math.min(604800, ttl || 60));

    const updated = await prisma.secretChat.update({
      where: { id: secretChatId },
      data: { ttl: validTtl },
      include: {
        chat: true,
        sender: { select: { id: true, username: true, displayName: true, avatar: true } },
        receiver: { select: { id: true, username: true, displayName: true, avatar: true } },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update secret chat TTL error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РЈРґР°Р»РёС‚СЊ СЃРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const secretChatId = parseInt(req.params.id as string, 10);

    const secretChat = await prisma.secretChat.findFirst({
      where: {
        id: secretChatId,
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
      },
    });

    if (!secretChat) {
      res.status(404).json({ error: 'РЎРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    // Mark as destroyed
    await prisma.secretChat.update({
      where: { id: secretChatId },
      data: {
        isDestroyed: true,
        destroyedAt: new Date(),
      },
    });

    // Delete all messages
    await prisma.secretMessage.deleteMany({
      where: { chatId: secretChatId },
    });

    // Delete chat members
    await prisma.chatMember.deleteMany({
      where: { chatId: secretChat.chatId },
    });

    // Delete chat
    await prisma.chat.delete({
      where: { id: secretChat.chatId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete secret chat error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ============================================
// РЎРћРћР‘Р©Р•РќРРЇ РЎР•РљР Р•РўРќРћР“Рћ Р§РђРўРђ
// ============================================

// РћС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ РІ СЃРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚
router.post('/:id/messages', async (req: Request, res: Response) => {
  try {
    const secretChatId = parseInt(req.params.id as string, 10);
    const { content } = req.body as { content?: string };

    const secretChat = await prisma.secretChat.findFirst({
      where: {
        id: secretChatId,
        isDestroyed: false,
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
      },
    });

    if (!secretChat) {
      res.status(404).json({ error: 'РЎРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    if (!content || typeof content !== 'string' || content.length > 10000) {
      res.status(400).json({ error: 'РЎРѕРґРµСЂР¶РёРјРѕРµ РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ Рё РЅРµ РґРѕР»Р¶РЅРѕ РїСЂРµРІС‹С€Р°С‚СЊ 10000 СЃРёРјРІРѕР»РѕРІ' });
      return;
    }

    // Encrypt content with the chat's encryption key
    const algorithm = 'aes-256-cbc';
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(secretChat.encryptionKey, 'hex');
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(content, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const encryptedContent = `${iv.toString('hex')}:${encrypted}`;

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + secretChat.ttl * 1000);

    const message = await prisma.secretMessage.create({
      data: {
        chatId: secretChatId,
        senderId: req.userId!,
        content: encryptedContent,
        expiresAt,
      },
      include: {
        chat: true,
      },
    });

    res.json(message);
  } catch (error) {
    console.error('Send secret message error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџРѕР»СѓС‡РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ СЃРµРєСЂРµС‚РЅРѕРіРѕ С‡Р°С‚Р°
router.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const secretChatId = parseInt(req.params.id as string, 10);

    const secretChat = await prisma.secretChat.findFirst({
      where: {
        id: secretChatId,
        isDestroyed: false,
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
      },
    });

    if (!secretChat) {
      res.status(404).json({ error: 'РЎРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    const messages = await prisma.secretMessage.findMany({
      where: {
        chatId: secretChatId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Decrypt messages
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(secretChat.encryptionKey, 'hex');

    const decryptedMessages = messages.map(msg => {
      try {
        const [ivHex, encrypted] = msg.content.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return {
          ...msg,
          content: decrypted,
        };
      } catch (e) {
        return {
          ...msg,
          content: '[РћС€РёР±РєР° СЂР°СЃС€РёС„СЂРѕРІРєРё]',
        };
      }
    });

    res.json(decryptedMessages);
  } catch (error) {
    console.error('Get secret messages error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// РџСЂРѕС‡РёС‚Р°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ РІ СЃРµРєСЂРµС‚РЅРѕРј С‡Р°С‚Рµ
router.put('/:chatId/messages/:messageId/read', async (req: Request, res: Response) => {
  try {
    const secretChatId = parseInt(req.params.chatId as string, 10);
    const messageId = parseInt(req.params.messageId as string, 10);

    const secretChat = await prisma.secretChat.findFirst({
      where: {
        id: secretChatId,
        isDestroyed: false,
        OR: [
          { senderId: req.userId },
          { receiverId: req.userId },
        ],
      },
    });

    if (!secretChat) {
      res.status(404).json({ error: 'РЎРµРєСЂРµС‚РЅС‹Р№ С‡Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
      return;
    }

    await prisma.secretMessage.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark secret message as read error:', error);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

export default router;
