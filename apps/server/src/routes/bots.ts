// @ts-nocheck
import { Router, Response } from 'express';
import { prisma } from '../db';
import crypto from 'crypto';

const router = Router();

// ============================================
// 🤖 БОТЫ (API для разработчиков)
// ============================================

// Получить всех ботов пользователя
router.get('/my', async (req: Request, res: Response) => {
  try {
    const bots = await prisma.bot.findMany({
      where: { ownerId: req.userId },
      include: {
        commands: true,
        _count: {
          select: { authTokens: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(bots);
  } catch (error) {
    console.error('Get my bots error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать бота
router.post('/', async (req: Request, res: Response) => {
  try {
    const { username, name, description, isPrivate } = req.body as {
      username?: string;
      name?: string;
      description?: string;
      isPrivate?: boolean;
    };

    // Validate username
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 32) {
      res.status(400).json({ error: 'Юзернейм бота должен быть от 3 до 32 символов' });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      res.status(400).json({ error: 'Юзернейм может содержать только буквы, цифры и подчёркивания' });
      return;
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.length > 100) {
      res.status(400).json({ error: 'Имя бота должно быть не длиннее 100 символов' });
      return;
    }

    // Check if username is taken
    const existing = await prisma.bot.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (existing) {
      res.status(400).json({ error: 'Этот юзернейм уже занят' });
      return;
    }

    // Generate API token
    const apiToken = `bot_${crypto.randomBytes(32).toString('hex')}`;

    const bot = await prisma.bot.create({
      data: {
        ownerId: req.userId!,
        username: username.toLowerCase(),
        name,
        description: description || null,
        apiToken,
        isPrivate: isPrivate || false,
      },
      include: {
        commands: true,
      },
    });

    res.json(bot);
  } catch (error) {
    console.error('Create bot error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить бота по ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);

    const bot = await prisma.bot.findFirst({
      where: {
        id: botId,
        OR: [
          { ownerId: req.userId },
          { isPrivate: false },
        ],
      },
      include: {
        commands: true,
        owner: {
          select: { id: true, username: true, displayName: true, avatar: true },
        },
      },
    });

    if (!bot) {
      res.status(404).json({ error: 'Бот не найден' });
      return;
    }

    res.json(bot);
  } catch (error) {
    console.error('Get bot error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить бота
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);
    const { name, description, avatar, isPrivate, webhookUrl } = req.body as {
      name?: string;
      description?: string;
      avatar?: string;
      isPrivate?: boolean;
      webhookUrl?: string;
    };

    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: req.userId },
    });

    if (!bot) {
      res.status(403).json({ error: 'Нет прав для редактирования этого бота' });
      return;
    }

    const updated = await prisma.bot.update({
      where: { id: botId },
      data: {
        name,
        description,
        avatar,
        isPrivate,
        webhookUrl,
      },
      include: {
        commands: true,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update bot error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить бота
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);

    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: req.userId },
    });

    if (!bot) {
      res.status(403).json({ error: 'Нет прав для удаления этого бота' });
      return;
    }

    await prisma.bot.delete({
      where: { id: botId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete bot error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// КОМАНДЫ БОТА
// ============================================

// Добавить команду боту
router.post('/:id/commands', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);
    const { command, description, handler } = req.body as {
      command?: string;
      description?: string;
      handler?: string;
    };

    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: req.userId },
    });

    if (!bot) {
      res.status(403).json({ error: 'Нет прав для управления этим ботом' });
      return;
    }

    if (!command || !command.startsWith('/')) {
      res.status(400).json({ error: 'Команда должна начинаться с /' });
      return;
    }

    const cmd = command.replace('/', '');
    if (cmd.length > 32) {
      res.status(400).json({ error: 'Команда должна быть не длиннее 32 символов' });
      return;
    }

    const existing = await prisma.botCommand.findUnique({
      where: { botId_command: { botId, command: cmd } },
    });

    if (existing) {
      res.status(400).json({ error: 'Такая команда уже существует' });
      return;
    }

    const newCommand = await prisma.botCommand.create({
      data: {
        botId,
        command: cmd,
        description,
        handler,
      },
    });

    res.json(newCommand);
  } catch (error) {
    console.error('Add bot command error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить команду бота
router.delete('/:botId/commands/:command', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.botId as string, 10);
    const command = req.params.command.replace('/', '');

    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: req.userId },
    });

    if (!bot) {
      res.status(403).json({ error: 'Нет прав для управления этим ботом' });
      return;
    }

    await prisma.botCommand.delete({
      where: { botId_command: { botId, command } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete bot command error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// АВТОРИЗАЦИЯ БОТА
// ============================================

// Авторизовать бота (получить токен)
router.post('/:id/auth', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);
    const { expiresIn } = req.body as { expiresIn?: number }; // seconds

    const bot = await prisma.bot.findFirst({
      where: { id: botId },
    });

    if (!bot) {
      res.status(404).json({ error: 'Бот не найден' });
      return;
    }

    // Check if bot is private and user is not owner
    if (bot.isPrivate && bot.ownerId !== req.userId) {
      res.status(403).json({ error: 'Этот бот приватный' });
      return;
    }

    const token = `auth_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

    const authToken = await prisma.botAuthToken.create({
      data: {
        botId,
        userId: req.userId!,
        token,
        expiresAt,
      },
    });

    res.json({ token: authToken.token, expiresAt: authToken.expiresAt });
  } catch (error) {
    console.error('Bot auth error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверить токен бота (для API запросов)
router.post('/verify-token', async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token?: string };

    if (!token) {
      res.status(400).json({ error: 'Токен обязателен' });
      return;
    }

    const authToken = await prisma.botAuthToken.findUnique({
      where: { token },
      include: {
        bot: {
          select: { id: true, username: true, name: true, avatar: true },
        },
      },
    });

    if (!authToken) {
      res.status(401).json({ error: 'Неверный токен' });
      return;
    }

    if (authToken.expiresAt && authToken.expiresAt < new Date()) {
      await prisma.botAuthToken.delete({ where: { id: authToken.id } });
      res.status(401).json({ error: 'Токен истёк' });
      return;
    }

    res.json({
      valid: true,
      bot: authToken.bot,
      expiresAt: authToken.expiresAt,
    });
  } catch (error) {
    console.error('Verify bot token error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отозвать токен бота
router.delete('/:id/auth/:tokenId', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);
    const tokenId = parseInt(req.params.tokenId as string, 10);

    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: req.userId },
    });

    if (!bot) {
      res.status(403).json({ error: 'Нет прав для управления этим ботом' });
      return;
    }

    await prisma.botAuthToken.delete({
      where: { id: tokenId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Revoke bot token error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============================================
// ЛОГИ БОТА
// ============================================

// Получить логи бота
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const botId = parseInt(req.params.id as string, 10);
    const { level, limit = '100' } = req.query;

    const bot = await prisma.bot.findFirst({
      where: { id: botId, ownerId: req.userId },
    });

    if (!bot) {
      res.status(403).json({ error: 'Нет прав для просмотра логов' });
      return;
    }

    const logs = await prisma.botLog.findMany({
      where: {
        botId,
        level: level as string || undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit as string) || 100, 1000),
    });

    res.json(logs);
  } catch (error) {
    console.error('Get bot logs error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
