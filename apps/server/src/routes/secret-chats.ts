// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import crypto from 'crypto';

const router = Router();

// ============================================
// 🔒 СЕКРЕТНЫЕ ЧАТЫ (с таймером удаления)
// ============================================

// Создать секретный чат
router.post('/', async (req: Request, res: Response) => {
  try {
    const { receiverId, ttl } = req.body as {
      receiverId?: number;
      ttl?: number; // time to live in seconds
    };

    if (!receiverId) {
      res.status(400).json({ error: 'ID получателя обязателен' });
      return;
    }

    if (receiverId === req.userId) {
      res.status(400).json({ error: 'Нельзя создать секретный чат с самим собой' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить все секретные чаты пользователя
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить секретный чат по ID
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
      res.status(404).json({ error: 'Секретный чат не найден' });
      return;
    }

    res.json(secretChat);
  } catch (error) {
    console.error('Get secret chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить TTL секретного чата
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
      res.status(404).json({ error: 'Секретный чат не найден' });
      return;
    }

    // Only sender can change TTL
    if (secretChat.senderId !== req.userId) {
      res.status(403).json({ error: 'Только создатель чата может изменять таймер' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить секретный чат
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
      res.status(404).json({ error: 'Секретный чат не найден' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// СООБЩЕНИЯ СЕКРЕТНОГО ЧАТА
// ============================================

// Отправить сообщение в секретный чат
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
      res.status(404).json({ error: 'Секретный чат не найден' });
      return;
    }

    if (!content || typeof content !== 'string' || content.length > 10000) {
      res.status(400).json({ error: 'Содержимое обязательно и не должно превышать 10000 символов' });
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить сообщения секретного чата
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
      res.status(404).json({ error: 'Секретный чат не найден' });
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
          content: '[Ошибка расшифровки]',
        };
      }
    });

    res.json(decryptedMessages);
  } catch (error) {
    console.error('Get secret messages error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Прочитать сообщение в секретном чате
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
      res.status(404).json({ error: 'Секретный чат не найден' });
      return;
    }

    await prisma.secretMessage.update({
      where: { id: messageId },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Mark secret message as read error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
