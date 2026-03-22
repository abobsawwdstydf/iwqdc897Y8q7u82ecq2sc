import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { USER_SELECT, SENDER_SELECT, uploadGroupAvatar, deleteUploadedFile, encryptUploadedFile, ALLOWED_IMAGE_EXTENSIONS } from '../shared';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

// Compact user select for chat member lists (no bio/birthday)
const CHAT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastSeen: true,
};

// Получить все чаты пользователя
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        members: { some: { userId: req.userId } },
      },
      include: {
        members: {
          include: { user: { select: CHAT_USER_SELECT } },
        },
        messages: {
          where: {
            isDeleted: false,
            OR: [
              { scheduledAt: null },
              { senderId: req.userId! },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
        pinnedMessages: {
          orderBy: { pinnedAt: 'desc' },
          take: 1,
          include: {
            message: {
              include: {
                sender: { select: SENDER_SELECT },
                media: true,
              },
            },
          },
        },
      },
    });

    // Batch unread counts in a single query to avoid N+1
    const chatIds = chats.map(c => c.id);
    let unreadCounts: Array<{ chatId: number; count: bigint }> = [];
    if (chatIds.length > 0) {
      unreadCounts = await prisma.$queryRaw<Array<{ chatId: number; count: bigint }>>(
        Prisma.sql`SELECT m."chatId", COUNT(m.id) as count FROM "Message" m
         LEFT JOIN "ReadReceipt" rr ON rr."messageId" = m.id AND rr."userId" = ${req.userId}
         WHERE m."chatId" IN (${Prisma.join(chatIds)})
         AND m."senderId" != ${req.userId} AND m."isDeleted" = false AND rr.id IS NULL
         AND m."scheduledAt" IS NULL
         GROUP BY m."chatId"`
      ).catch(() => [] as Array<{ chatId: number; count: bigint }>);
    }

    const unreadMap = new Map<number, number>(unreadCounts.map(r => [r.chatId, Number(r.count)]));

    // Filter last message by clearedAt per user
    const chatsFiltered = chats.map((chat) => {
      const member = chat.members.find((m) => m.userId === req.userId);
      const clearedAt = member?.clearedAt;
      if (clearedAt && chat.messages.length > 0) {
        const filtered = chat.messages.filter((msg) => new Date(msg.createdAt) > new Date(clearedAt));
        return { ...chat, messages: filtered };
      }
      return chat;
    });

    const sortedChats = chatsFiltered.sort((a, b) => {
      const aPinned = a.members.find((m) => m.userId === req.userId)?.isPinned || false;
      const bPinned = b.members.find((m) => m.userId === req.userId)?.isPinned || false;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aDate = a.messages[0]?.createdAt || a.createdAt;
      const bDate = b.messages[0]?.createdAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const chatsWithUnread = sortedChats.map((chat) => ({
      ...chat,
      unreadCount: unreadMap.get(Number(chat.id)) || 0,
    }));

    res.json(chatsWithUnread);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать личный чат
router.post('/personal', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body as { userId?: number };
    if (!userId) {
      res.status(400).json({ error: 'ID пользователя обязателен' });
      return;
    }

    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'personal',
        AND: [
          { members: { some: { userId: req.userId } } },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    if (existingChat) {
      res.json({ ...existingChat, unreadCount: 0 });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'personal',
        members: {
          create: [{ userId: req.userId! }, { userId }],
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать или получить чат "Избранное" (saved messages)
router.post('/favorites', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check if favorites chat already exists
    const existing = await prisma.chat.findFirst({
      where: {
        type: 'favorites',
        members: { some: { userId } },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    if (existing) {
      res.json({ ...existing, unreadCount: 0 });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'favorites',
        name: null,
        members: {
          create: [{ userId, role: 'admin' }],
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create favorites chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать групповой чат
router.post('/group', async (req: AuthRequest, res) => {
  try {
    const { name, memberIds } = req.body as { name?: string; memberIds?: number[] };
    if (!name || !memberIds || !Array.isArray(memberIds)) {
      res.status(400).json({ error: 'Название и участники обязательны' });
      return;
    }

    // Validate group name length
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      res.status(400).json({ error: 'Название группы должно быть от 1 до 100 символов' });
      return;
    }

    // Limit max members
    if (memberIds.length > 256) {
      res.status(400).json({ error: 'Максимум 256 участников в группе' });
      return;
    }

    const allMemberIds = [...new Set([req.userId!, ...memberIds])];

    const chat = await prisma.chat.create({
      data: {
        type: 'group',
        name,
        members: {
          create: allMemberIds.map((uid) => ({
            userId: uid,
            role: uid === req.userId ? 'admin' : 'member',
          })),
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать канал
router.post('/channel', async (req: AuthRequest, res: Response) => {
  try {
    const { name, username, description, memberIds } = req.body as { name?: string; username?: string; description?: string; memberIds?: number[] };

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      res.status(400).json({ error: 'Название канала должно быть от 1 до 100 символов' });
      return;
    }

    // Validate username (required for channels)
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 32) {
      res.status(400).json({ error: 'Юзернейм канала должен быть от 3 до 32 символов' });
      return;
    }

    // Validate username format (alphanumeric + underscore)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      res.status(400).json({ error: 'Юзернейм может содержать только буквы, цифры и подчёркивания' });
      return;
    }

    // Validate optional description
    if (description !== undefined && (typeof description !== 'string' || description.length > 255)) {
      res.status(400).json({ error: 'Описание канала должно быть не длиннее 255 символов' });
      return;
    }

    // Check if username is taken
    const existingChannel = await prisma.chat.findUnique({
      where: { username },
    });
    if (existingChannel) {
      res.status(400).json({ error: 'Этот юзернейм уже занят' });
      return;
    }

    // Optional: validate memberIds if provided
    let members = [];
    if (memberIds && Array.isArray(memberIds) && memberIds.length > 0) {
      if (memberIds.length > 1000) {
        res.status(400).json({ error: 'Максимум 1000 участников при создании' });
        return;
      }
      const allMemberIds = [...new Set([req.userId!, ...memberIds])];
      members = allMemberIds.map((uid) => ({
        userId: uid,
        role: uid === req.userId ? 'admin' : 'member',
      }));
    } else {
      // Creator only (can add members later)
      members = [{ userId: req.userId!, role: 'admin' }];
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'channel',
        name,
        username: username.toLowerCase(),
        description: description ? description.slice(0, 255) : null,
        members: {
          create: members,
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить чат по ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const chatId = parseInt(req.params.id as string, 10);
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        members: { some: { userId: req.userId } },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
      },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить группу (только админ)
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const { name } = req.body as { name?: string };

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может редактировать группу' });
      return;
    }

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { name },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузить аватар группы (только админ)
router.post('/:id/avatar', uploadGroupAvatar.single('avatar'), encryptUploadedFile, async (req: AuthRequest, res) => {
  try {
    const chatId = parseInt(req.params.id as string, 10);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может менять аватар группы' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    // Delete old avatar file
    const currentChat = await prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
    if (currentChat?.avatar) deleteUploadedFile(currentChat.avatar);

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: avatarUrl },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Upload group avatar error:', error);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// Удалить аватар группы (только админ)
router.delete('/:id/avatar', async (req: AuthRequest, res) => {
  try {
    const chatId = parseInt(req.params.id as string, 10);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может менять аватар группы' });
      return;
    }

    // Delete file from disk
    const currentChat = await prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
    if (currentChat?.avatar) deleteUploadedFile(currentChat.avatar);

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: null },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// ─── Multiple Avatars Management (for channels/groups) ─────────────────

const uploadMultipleAvatars = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../uploads/avatars')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `avatar-${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 100 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Только изображения (jpg, png, gif, webp, avif)'));
    }
  },
});

// Загрузить несколько аватаров (до 100)
router.post('/:id/avatars', uploadMultipleAvatars.array('avatars', 100), encryptUploadedFile, async (req: AuthRequest, res) => {
  try {
    const chatId = parseInt(req.params.id as string, 10);
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Только владелец, совладелец или администратор может управлять аватарами' });
      return;
    }

    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      res.status(400).json({ error: 'Файлы не загружены' });
      return;
    }

    const files = (req as any).files as MulterFile[];
    
    // Get current max position
    const existingAvatars = await prisma.chatAvatar.findMany({
      where: { chatId },
      orderBy: { position: 'desc' },
      take: 1,
    });
    const startPosition = existingAvatars.length > 0 ? existingAvatars[0].position + 1 : 0;

    // Create avatar records
    const avatars = await Promise.all(
      files.map((file, index) => 
        prisma.chatAvatar.create({
          data: {
            chatId,
            url: `/uploads/avatars/${file.filename}`,
            position: startPosition + index,
            isMain: index === 0 && existingAvatars.length === 0, // First avatar is main if none exist
          },
        })
      )
    );

    // Update main avatar if this is the first one
    if (existingAvatars.length === 0 && avatars.length > 0) {
      await prisma.chat.update({
        where: { id: chatId },
        data: { avatar: avatars[0].url },
      });
    }

    res.json(avatars);
  } catch (error) {
    console.error('Upload multiple avatars error:', error);
    res.status(500).json({ error: 'Ошибка загрузки аватаров' });
  }
});

// Получить все аватары чата
router.get('/:id/avatars', async (req: AuthRequest, res) => {
  try {
    const chatId = parseInt(req.params.id as string, 10);
    
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const avatars = await prisma.chatAvatar.findMany({
      where: { chatId },
      orderBy: { position: 'asc' },
    });

    res.json(avatars);
  } catch (error) {
    console.error('Get avatars error:', error);
    res.status(500).json({ error: 'Ошибка получения аватаров' });
  }
});

// Обновить порядок аватаров
router.put('/:id/avatars/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const { avatarIds } = req.body as { avatarIds?: number[] };

    if (!avatarIds || !Array.isArray(avatarIds)) {
      res.status(400).json({ error: 'Необходимо указать массив ID' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Только владелец, совладелец или администратор может управлять аватарами' });
      return;
    }

    // Update positions
    await Promise.all(
      avatarIds.map((id: number, index: number) =>
        prisma.chatAvatar.update({
          where: { id },
          data: { position: index },
        })
      )
    );

    res.json({ ok: true });
  } catch (error) {
    console.error('Reorder avatars error:', error);
    res.status(500).json({ error: 'Ошибка изменения порядка' });
  }
});

// Установить главный аватар
router.put('/:id/avatars/:avatarId/main', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const avatarId = parseInt((req.params as { avatarId?: string }).avatarId as string, 10);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Только владелец, совладелец или администратор может управлять аватарами' });
      return;
    }

    const avatar = await prisma.chatAvatar.findUnique({
      where: { id: avatarId },
    });

    if (!avatar || avatar.chatId !== chatId) {
      res.status(404).json({ error: 'Аватар не найден' });
      return;
    }

    // Set all to not main
    await prisma.chatAvatar.updateMany({
      where: { chatId },
      data: { isMain: false },
    });

    // Set selected as main
    await prisma.chatAvatar.update({
      where: { id: avatarId },
      data: { isMain: true },
    });

    // Update chat main avatar
    await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: avatar.url },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Set main avatar error:', error);
    res.status(500).json({ error: 'Ошибка установки главного аватара' });
  }
});

// Удалить аватар
router.delete('/:id/avatars/:avatarId', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const avatarId = parseInt((req.params as { avatarId?: string }).avatarId as string, 10);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: 'Только владелец, совладелец или администратор может управлять аватарами' });
      return;
    }

    const avatar = await prisma.chatAvatar.findUnique({
      where: { id: avatarId },
    });

    if (!avatar || avatar.chatId !== chatId) {
      res.status(404).json({ error: 'Аватар не найден' });
      return;
    }

    // Delete file
    deleteUploadedFile(avatar.url);

    // Delete record
    await prisma.chatAvatar.delete({
      where: { id: avatarId },
    });

    // If this was main avatar, set first available as main
    if (avatar.isMain) {
      const firstAvatar = await prisma.chatAvatar.findFirst({
        where: { chatId },
        orderBy: { position: 'asc' },
      });

      if (firstAvatar) {
        await prisma.chatAvatar.update({
          where: { id: firstAvatar.id },
          data: { isMain: true },
        });
        await prisma.chat.update({
          where: { id: chatId },
          data: { avatar: firstAvatar.url },
        });
      } else {
        await prisma.chat.update({
          where: { id: chatId },
          data: { avatar: null },
        });
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete avatar error:', error);
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// Добавить участников в группу (только админ)
router.post('/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const { userIds } = req.body as { userIds?: number[] };

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'Необходимо указать пользователей' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может добавлять участников' });
      return;
    }

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat || chat.type !== 'group') {
      res.status(400).json({ error: 'Чат не является группой' });
      return;
    }

    for (const uid of userIds) {
      await prisma.chatMember.upsert({
        where: { chatId_userId: { chatId, userId: uid } },
        create: { chatId, userId: uid, role: 'member' },
        update: {},
      });
    }

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Ошибка добавления участников' });
  }
});

// Удалить участника из группы (только админ)
router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const targetUserId = parseInt((req.params as { userId?: string }).userId as string, 10);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может удалять участников' });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'Нельзя удалить себя из группы' });
      return;
    }

    await prisma.chatMember.delete({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Ошибка удаления участника' });
  }
});

// Очистить чат для себя
router.post('/:id/clear', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const userId = req.userId!;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    // Cannot clear favorites chat
    if (chat.type === 'favorites') {
      res.status(400).json({ error: 'Нельзя очистить чат "Избранное"' });
      return;
    }

    // For channels, only owner/co-owner/admin can clear
    if (chat.type === 'channel') {
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId } },
        select: { role: true },
      });

      if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
        res.status(403).json({ error: 'Только владелец, совладелец или администратор может очищать канал' });
        return;
      }
    }

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { clearedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Ошибка очистки чата' });
  }
});

// Удалить чат (для текущего пользователя — выйти из чата)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const userId = req.userId!;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    // Membership check
    const isMember = chat.members.some(m => m.userId === userId);
    if (!isMember) {
      res.status(403).json({ error: 'Нет доступа к этому чату' });
      return;
    }

    // Cannot delete favorites chat
    if (chat.type === 'favorites') {
      res.status(400).json({ error: 'Нельзя удалить чат "Избранное"' });
      return;
    }

    if (chat.type === 'personal') {
      // For personal chats, just remove the member (soft leave) instead of destroying for both
      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId } },
      });
      // If both members have left, clean up the chat
      const remaining = await prisma.chatMember.count({ where: { chatId } });
      if (remaining === 0) {
        await prisma.chat.delete({ where: { id: chatId } });
      }
    } else if (chat.members.length <= 1) {
      // Last member — delete the group entirely
      await prisma.chat.delete({ where: { id: chatId } });
    } else {
      // For groups, just remove the member
      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId } },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Ошибка удаления чата' });
  }
});

// Закрепить / открепить чат
router.post('/:id/pin', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const userId = req.userId!;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { isPinned: !member.isPinned },
    });

    res.json({ isPinned: !member.isPinned });
  } catch (error) {
    console.error('Pin chat error:', error);
    res.status(500).json({ error: 'Ошибка закрепления чата' });
  }
});

// Пригласить пользователей в канал (только владелец/админ)
router.post('/:id/invite', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt((req.params as { id?: string }).id as string, 10);
    const { userIds } = req.body as { userIds?: number[] };

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'Необходимо указать пользователей' });
      return;
    }

    const inviterMember = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!inviterMember || !['owner', 'co-owner', 'admin'].includes(inviterMember.role)) {
      res.status(403).json({ error: 'Только владелец, совладелец или администратор может приглашать участников' });
      return;
    }

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat || chat.type !== 'channel') {
      res.status(400).json({ error: 'Чат не является каналом' });
      return;
    }

    const addedUsers = [];
    for (const uid of userIds) {
      const existing = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId, userId: uid } },
      });
      if (!existing) {
        await prisma.chatMember.create({
          data: { chatId, userId: uid, role: 'member' },
        });
        addedUsers.push(uid);
      }
    }

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json({ ...updatedChat, addedUsers });
  } catch (error) {
    console.error('Invite to channel error:', error);
    res.status(500).json({ error: 'Ошибка приглашения в канал' });
  }
});

export default router;
