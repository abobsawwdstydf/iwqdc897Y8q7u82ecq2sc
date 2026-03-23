import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { config } from '../config';
import { SENDER_SELECT, deleteUploadedFile } from '../shared';

interface AuthSocket extends Socket {
  userId?: number;
}

const onlineUsers = new Map<number, Set<string>>();

// в”Ђв”Ђв”Ђ Active group calls: chatId в†’ Set<userId> в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const activeGroupCalls = new Map<number, Set<number>>();

// в”Ђв”Ђв”Ђ Active live streams: chatId в†’ { ownerId, viewers: Set<userId> } в”Ђ
const activeStreams = new Map<number, { ownerId: number; viewers: Set<number>; streamType: string }>();

// в”Ђв”Ђв”Ђ Socket rate limiting в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX = 10; // max events per window

const MAX_TIMEOUT = 2_147_483_647; // Max safe setTimeout delay (~24.8 days)

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

// Clean up stale rate-limit entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap) {
    if (now > val.resetAt) rateLimitMap.delete(key);
  }
}, 30_000);

async function isChatMember(chatId: number, userId: number): Promise<boolean> {
  const member = await prisma.chatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
  return !!member;
}

export function setupSocket(io: Server) {
  // On startup, re-schedule any pending scheduled messages
  rescheduleMessages(io);

  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('РўСЂРµР±СѓРµС‚СЃСЏ Р°РІС‚РѕСЂРёР·Р°С†РёСЏ'));

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: number };
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('РќРµРґРµР№СЃС‚РІРёС‚РµР»СЊРЅС‹Р№ С‚РѕРєРµРЅ'));
    }
  });

  io.on('connection', async (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РїРѕРґРєР»СЋС‡РёР»СЃСЏ: ${userId}`);

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId)!.add(socket.id);

    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: true, lastSeen: new Date() },
    });

    // Notify others that this user is online
    socket.broadcast.emit('user_online', { userId });

    // Send current online status for all users in this user's chats
    const userChats = await prisma.chatMember.findMany({
      where: { userId },
      select: { chatId: true },
    });

    // Get all users in these chats and their online status
    const chatIds = userChats.map(c => c.chatId);
    const chatMembers = await prisma.chatMember.findMany({
      where: { chatId: { in: chatIds } },
      include: { user: { select: { id: true, isOnline: true } } },
    });

    // Send online status for each member to the connected user
    const onlineStatuses = new Map<number, boolean>();
    for (const member of chatMembers) {
      if (member.userId !== userId) {
        onlineStatuses.set(member.userId, member.user.isOnline);
      }
    }

    for (const [memberId, isOnline] of onlineStatuses) {
      socket.emit('user_online_status', { userId: memberId, isOnline });
    }

    for (const { chatId } of userChats) {
      socket.join(`chat:${chatId}`);
    }

    socket.on('join_chat', async (chatId: number) => {
      if (await isChatMember(chatId, userId)) {
        socket.join(`chat:${chatId}`);
      }
    });

    socket.on('leave_chat', (chatId: number) => {
      socket.leave(`chat:${chatId}`);
    });

    // РћС‚РїСЂР°РІРєР° СЃРѕРѕР±С‰РµРЅРёСЏ
    socket.on('send_message', async (data: {
      chatId: number;
      content?: string;
      type?: string;
      replyToId?: number;
      quote?: string;
      forwardedFromId?: number;
      mediaUrl?: string;
      mediaType?: string;
      fileName?: string;
      fileSize?: number;
      duration?: number;
      scheduledAt?: string;
      mediaUrls?: Array<{ url: string; type: string; fileName?: string; fileSize?: number; duration?: number }>;
    }) => {
      try {
        // Rate limit
        if (!checkRateLimit(userId)) {
          socket.emit('error', { message: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёР№, РїРѕРґРѕР¶РґРёС‚Рµ' });
          return;
        }

        // Validate payload
        if (!data.chatId || typeof data.chatId !== 'number') return;
        if (data.content && data.content.length > 10000) {
          socket.emit('error', { message: 'РЎРѕРѕР±С‰РµРЅРёРµ СЃР»РёС€РєРѕРј РґР»РёРЅРЅРѕРµ' });
          return;
        }

        // Membership check
        if (!(await isChatMember(data.chatId, userId))) {
          socket.emit('error', { message: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕРјСѓ С‡Р°С‚Сѓ' });
          return;
        }

        // Check channel permissions - only owner, co-owner, admin can post
        const chat = await prisma.chat.findUnique({
          where: { id: data.chatId },
          select: { type: true },
        });

        if (chat?.type === 'channel') {
          const member = await prisma.chatMember.findUnique({
            where: { chatId_userId: { chatId: data.chatId, userId } },
            select: { role: true },
          });

          if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
            socket.emit('error', { message: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РѕС‚РїСЂР°РІР»СЏС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ РІ РєР°РЅР°Р»Рµ' });
            return;
          }
        }

        // Validate message type
        const VALID_TYPES = ['text', 'image', 'video', 'voice', 'file', 'gif', 'audio'];
        const msgType = data.type || 'text';
        if (!VALID_TYPES.includes(msgType)) {
          socket.emit('error', { message: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ С‚РёРї СЃРѕРѕР±С‰РµРЅРёСЏ' });
          return;
        }

        // Validate mediaUrl вЂ” only /uploads/ paths or https URLs allowed
        if (data.mediaUrl) {
          if (typeof data.mediaUrl !== 'string') {
            socket.emit('error', { message: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ mediaUrl' });
            return;
          }
          const isLocalUpload = data.mediaUrl.startsWith('/uploads/');
          const isExternalUrl = data.mediaUrl.startsWith('https://');
          if (!isLocalUpload && !isExternalUrl) {
            socket.emit('error', { message: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ mediaUrl' });
            return;
          }
          if (isLocalUpload && data.mediaUrl.includes('..')) {
            socket.emit('error', { message: 'РќРµРґРѕРїСѓСЃС‚РёРјС‹Р№ РїСѓС‚СЊ РІ mediaUrl' });
            return;
          }
        }

        const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;

        // Validate scheduledAt вЂ” must be in the future and within 7 days
        if (scheduledAt) {
          const now = Date.now();
          const maxSchedule = now + 7 * 24 * 60 * 60 * 1000;
          if (isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= now || scheduledAt.getTime() > maxSchedule) {
            socket.emit('error', { message: 'РќРµРєРѕСЂСЂРµРєС‚РЅР°СЏ РґР°С‚Р° РѕС‚Р»РѕР¶РµРЅРЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ' });
            return;
          }
        }

        // Validate forwardedFromId вЂ” must reference an existing user
        let validForwardedFromId: number | null = null;
        if (data.forwardedFromId) {
          const forwardUser = await prisma.user.findUnique({ where: { id: data.forwardedFromId }, select: { id: true } });
          if (forwardUser) {
            validForwardedFromId = forwardUser.id;
          }
        }

        // Determine message type
        let finalType = msgType;
        const mediaToCreate = [];

        // Handle multiple media files (album)
        if (data.mediaUrls && Array.isArray(data.mediaUrls) && data.mediaUrls.length > 0) {
          for (const m of data.mediaUrls) {
            mediaToCreate.push({
              type: m.type,
              url: m.url,
              filename: m.fileName,
              size: m.fileSize,
              duration: m.duration,
            });
          }
          // Set message type based on first media if not specified
          if (finalType === 'text' || finalType === 'file') {
            const firstMediaType = mediaToCreate[0]?.type;
            if (firstMediaType === 'image') finalType = 'image';
            else if (firstMediaType === 'video') finalType = 'video';
            else if (firstMediaType === 'audio') finalType = 'audio';
          }
        } else if (data.mediaUrl) {
          mediaToCreate.push({
            type: data.mediaType || 'file',
            url: data.mediaUrl,
            filename: data.fileName,
            size: data.fileSize,
            duration: data.duration,
          });
        }

        const message = await prisma.message.create({
          data: {
            chatId: data.chatId,
            senderId: userId,
            content: data.content || null,
            type: finalType,
            replyToId: data.replyToId || null,
            quote: data.quote || null,
            forwardedFromId: validForwardedFromId,
            scheduledAt,
            ...(mediaToCreate.length > 0
              ? {
                media: {
                  create: mediaToCreate,
                },
              }
              : {}),
          },
          include: {
            sender: { select: SENDER_SELECT },
            forwardedFrom: { select: SENDER_SELECT },
            replyTo: {
              include: { sender: { select: { id: true, username: true, displayName: true } } },
            },
            media: true,
            reactions: true,
            readBy: true,
          },
        });

        // Scheduled messages: only send to the sender immediately, deliver to chat at scheduled time
        if (scheduledAt && scheduledAt.getTime() > Date.now()) {
          socket.emit('new_message', {
            ...message,
            readBy: message.readBy || [{ userId }],
          });

          const delay = Math.min(scheduledAt.getTime() - Date.now(), MAX_TIMEOUT);
          setTimeout(async () => {
            try {
              // Check if message was deleted while waiting
              const current = await prisma.message.findUnique({ where: { id: message.id } });
              if (!current || current.isDeleted) return;

              // Clear scheduledAt and emit to all
              await prisma.message.update({
                where: { id: message.id },
                data: { scheduledAt: null },
              });

              await prisma.readReceipt.create({
                data: { messageId: message.id, userId },
              });

              const members = await prisma.chatMember.findMany({
                where: { chatId: data.chatId },
                select: { userId: true },
              });
              for (const member of members) {
                const memberSockets = onlineUsers.get(member.userId);
                if (memberSockets) {
                  for (const sid of memberSockets) {
                    const memberSocket = io.sockets.sockets.get(sid);
                    if (memberSocket) memberSocket.join(`chat:${data.chatId}`);
                  }
                }
              }

              const updated = await prisma.message.findUnique({
                where: { id: message.id },
                include: {
                  sender: { select: SENDER_SELECT },
                  forwardedFrom: { select: SENDER_SELECT },
                  replyTo: {
                    include: { sender: { select: { id: true, username: true, displayName: true } } },
                  },
                  media: true,
                  reactions: true,
                  readBy: true,
                },
              });
              if (updated) {
                // Get chat details for notification
                const chat = await prisma.chat.findUnique({
                  where: { id: data.chatId },
                  include: {
                    members: {
                      include: { user: { select: { id: true, username: true, displayName: true } } },
                    },
                  },
                });
                let recipientName = '';
                if (chat) {
                  if (chat.type === 'group') {
                    recipientName = chat.name || 'Group';
                  } else if (chat.type === 'favorites') {
                    recipientName = 'РР·Р±СЂР°РЅРЅРѕРµ';
                  } else {
                    const otherMember = chat.members.find(m => m.userId !== userId);
                    recipientName = otherMember?.user.displayName || otherMember?.user.username || '';
                  }
                }

                io.to(`chat:${data.chatId}`).emit('scheduled_delivered', {
                  ...updated,
                  readBy: updated.readBy.map(r => ({ userId: r.userId })),
                  _recipientName: recipientName,
                  _deliveredAt: new Date().toISOString(),
                });
              }
            } catch (err) {
              console.error('Scheduled delivery error:', err);
            }
          }, delay);
          return;
        }

        await prisma.readReceipt.create({
          data: { messageId: message.id, userId },
        });

        const members = await prisma.chatMember.findMany({
          where: { chatId: data.chatId },
          select: { userId: true },
        });

        for (const member of members) {
          const memberSockets = onlineUsers.get(member.userId);
          if (memberSockets) {
            for (const sid of memberSockets) {
              const memberSocket = io.sockets.sockets.get(sid);
              if (memberSocket) {
                memberSocket.join(`chat:${data.chatId}`);
              }
            }
          }
        }

        io.to(`chat:${data.chatId}`).emit('new_message', {
          ...message,
          readBy: message.readBy || [{ userId }],
        });
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'РћС€РёР±РєР° РѕС‚РїСЂР°РІРєРё СЃРѕРѕР±С‰РµРЅРёСЏ' });
      }
    });

    // РРЅРґРёРєР°С‚РѕСЂ РЅР°Р±РѕСЂР° С‚РµРєСЃС‚Р° (with membership check)
    socket.on('typing_start', async (chatId: number) => {
      if (!chatId || typeof chatId !== 'number') return;
      if (!(await isChatMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('user_typing', { chatId, userId });
    });

    socket.on('typing_stop', async (chatId: number) => {
      if (!chatId || typeof chatId !== 'number') return;
      if (!(await isChatMember(chatId, userId))) return;
      socket.to(`chat:${chatId}`).emit('user_stopped_typing', { chatId, userId });
    });

    // РћС‚РјРµС‚РєРё Рѕ РїСЂРѕС‡С‚РµРЅРёРё
    socket.on('read_messages', async (data: { chatId: number; messageIds: number[] }) => {
      try {
        if (!data.chatId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        // Limit array size to prevent abuse
        if (data.messageIds.length > 200) {
          socket.emit('error', { message: 'РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ СЃРѕРѕР±С‰РµРЅРёР№ Р·Р° СЂР°Р· (РјР°РєСЃ. 200)' });
          return;
        }
        if (!(await isChatMember(data.chatId, userId))) return;

        await prisma.$transaction(
          data.messageIds.map(messageId =>
            prisma.readReceipt.upsert({
              where: { messageId_userId: { messageId, userId } },
              create: { messageId, userId },
              update: {},
            })
          )
        );

        socket.to(`chat:${data.chatId}`).emit('messages_read', {
          chatId: data.chatId,
          userId,
          messageIds: data.messageIds,
        });
      } catch (error) {
        console.error('Read receipts error:', error);
      }
    });

    // Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ
    socket.on('edit_message', async (data: { messageId: number; content: string; chatId: number }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.messageId || !data.content || data.content.length > 10000) return;

        const message = await prisma.message.findUnique({ where: { id: data.messageId } });
        if (!message || message.senderId !== userId) return;

        const updated = await prisma.message.update({
          where: { id: data.messageId },
          data: { content: data.content, isEdited: true },
          include: {
            sender: { select: SENDER_SELECT },
            replyTo: {
              include: { sender: { select: { id: true, username: true, displayName: true } } },
            },
            media: true,
            reactions: { include: { user: { select: { id: true, username: true, displayName: true } } } },
            readBy: { select: { userId: true } },
          },
        });

        io.to(`chat:${message.chatId}`).emit('message_edited', updated);
      } catch (error) {
        console.error('Edit message error:', error);
      }
    });

    // РЈРґР°Р»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёСЏ
    socket.on('delete_message', async (data: { messageId: number; chatId: number }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.messageId) return;

        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          include: { media: true },
        });
        if (!message) return;

        // РџСЂРѕРІРµСЂСЏРµРј С‡Р»РµРЅСЃС‚РІРѕ РІ С‡Р°С‚Рµ
        if (!(await isChatMember(message.chatId, userId))) return;

        // Delete media files from disk
        if (message.media && message.media.length > 0) {
          for (const m of message.media) {
            if (m.url) deleteUploadedFile(m.url);
          }
          // Delete media records from DB
          await prisma.media.deleteMany({ where: { messageId: data.messageId } });
        }

        await prisma.message.update({
          where: { id: data.messageId },
          data: { isDeleted: true, content: null },
        });

        io.to(`chat:${message.chatId}`).emit('message_deleted', {
          messageId: data.messageId,
          chatId: message.chatId,
        });
      } catch (error) {
        console.error('Delete message error:', error);
      }
    });

    // РњР°СЃСЃРѕРІРѕРµ СѓРґР°Р»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёР№ (СЃ РѕРїС†РёРµР№ В«С‚РѕР»СЊРєРѕ Сѓ РјРµРЅСЏВ» / В«Сѓ РІСЃРµС…В»)
    socket.on('delete_messages', async (data: { messageIds: number[]; chatId: number; deleteForAll: boolean }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.chatId || !Array.isArray(data.messageIds) || data.messageIds.length === 0) return;
        if (data.messageIds.length > 100) return; // Р»РёРјРёС‚

        // РџСЂРѕРІРµСЂСЏРµРј С‡Р»РµРЅСЃС‚РІРѕ РІ С‡Р°С‚Рµ
        if (!(await isChatMember(data.chatId, userId))) return;

        if (data.deleteForAll) {
          // РЈРґР°Р»РёС‚СЊ Сѓ РІСЃРµС… вЂ” Р»СЋР±РѕР№ СѓС‡Р°СЃС‚РЅРёРє С‡Р°С‚Р° РјРѕР¶РµС‚ СѓРґР°Р»РёС‚СЊ Р»СЋР±РѕРµ СЃРѕРѕР±С‰РµРЅРёРµ
          const messages = await prisma.message.findMany({
            where: {
              id: { in: data.messageIds },
              chatId: data.chatId,
              isDeleted: false,
            },
            include: { media: true },
          });

          const deletedIds: number[] = [];

          for (const message of messages) {
            // РЈРґР°Р»СЏРµРј РјРµРґРёР°-С„Р°Р№Р»С‹ СЃ РґРёСЃРєР°
            if (message.media && message.media.length > 0) {
              for (const m of message.media) {
                if (m.url) deleteUploadedFile(m.url);
              }
              await prisma.media.deleteMany({ where: { messageId: message.id } });
            }

            await prisma.message.update({
              where: { id: message.id },
              data: { isDeleted: true, content: null },
            });

            deletedIds.push(message.id);
          }

          if (deletedIds.length > 0) {
            io.to(`chat:${data.chatId}`).emit('messages_deleted', {
              messageIds: deletedIds,
              chatId: data.chatId,
            });
          }
        } else {
          // РЈРґР°Р»РёС‚СЊ С‚РѕР»СЊРєРѕ Сѓ РјРµРЅСЏ вЂ” СЃРѕР·РґР°С‘Рј Р·Р°РїРёСЃРё HiddenMessage
          const validMessages = await prisma.message.findMany({
            where: {
              id: { in: data.messageIds },
              chatId: data.chatId,
              isDeleted: false,
            },
            select: { id: true },
          });

          const validIds = validMessages.map(m => m.id);
          if (validIds.length === 0) return;

          // Upsert hidden records (РїСЂРѕРїСѓСЃРєР°РµРј РґСѓР±Р»Рё)
          await prisma.$transaction(
            validIds.map(msgId =>
              prisma.hiddenMessage.upsert({
                where: { messageId_userId: { messageId: msgId, userId } },
                create: { messageId: msgId, userId },
                update: {},
              })
            )
          );

          // РћС‚РїСЂР°РІР»СЏРµРј С‚РѕР»СЊРєРѕ СЌС‚РѕРјСѓ РїРѕР»СЊР·РѕРІР°С‚РµР»СЋ
          socket.emit('messages_hidden', {
            messageIds: validIds,
            chatId: data.chatId,
          });
        }
      } catch (error) {
        console.error('Bulk delete messages error:', error);
      }
    });

    // Р РµР°РєС†РёРё
    socket.on('add_reaction', async (data: { messageId: number; emoji: string; chatId: number }) => {
      try {
        if (!checkRateLimit(userId)) return;
        if (!data.chatId || !data.messageId || !data.emoji) return;
        if (typeof data.emoji !== 'string' || data.emoji.length > 10) return;
        if (!(await isChatMember(data.chatId, userId))) return;

        await prisma.reaction.upsert({
          where: {
            messageId_userId_emoji: { messageId: data.messageId, userId, emoji: data.emoji },
          },
          create: { messageId: data.messageId, userId, emoji: data.emoji },
          update: {},
        });

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, displayName: true },
        });

        io.to(`chat:${data.chatId}`).emit('reaction_added', {
          messageId: data.messageId,
          chatId: data.chatId,
          userId,
          username: user?.displayName || user?.username,
          emoji: data.emoji,
        });
      } catch (error) {
        console.error('Add reaction error:', error);
      }
    });

    socket.on('remove_reaction', async (data: { messageId: number; emoji: string; chatId: number }) => {
      try {
        if (!data.chatId || !data.messageId || !data.emoji) return;
        if (!(await isChatMember(data.chatId, userId))) return;

        await prisma.reaction.deleteMany({
          where: {
            messageId: data.messageId,
            userId,
            emoji: data.emoji,
          },
        });

        io.to(`chat:${data.chatId}`).emit('reaction_removed', {
          messageId: data.messageId,
          chatId: data.chatId,
          userId,
          emoji: data.emoji,
        });
      } catch (error) {
        console.error('Remove reaction error:', error);
      }
    });

    // ======= Pin / Unpin Messages =======

    socket.on('pin_message', async (data: { messageId: number; chatId: number }) => {
      try {
        // Verify user is member of the chat
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
        });
        if (!member) return;

        // Upsert pin
        await prisma.pinnedMessage.upsert({
          where: { chatId_messageId: { chatId: data.chatId, messageId: data.messageId } },
          create: { chatId: data.chatId, messageId: data.messageId },
          update: { pinnedAt: new Date() },
        });

        // Fetch the full message to broadcast
        const message = await prisma.message.findUnique({
          where: { id: data.messageId },
          include: {
            sender: { select: SENDER_SELECT },
            media: true,
          },
        });

        io.to(`chat:${data.chatId}`).emit('message_pinned', {
          chatId: data.chatId,
          message,
        });
      } catch (error) {
        console.error('Pin message error:', error);
      }
    });

    socket.on('unpin_message', async (data: { messageId: number; chatId: number }) => {
      try {
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
        });
        if (!member) return;

        await prisma.pinnedMessage.deleteMany({
          where: { chatId: data.chatId, messageId: data.messageId },
        });

        // Find the new latest pinned message (if any)
        const latestPin = await prisma.pinnedMessage.findFirst({
          where: { chatId: data.chatId },
          orderBy: { pinnedAt: 'desc' },
          include: {
            message: {
              include: {
                sender: { select: SENDER_SELECT },
                media: true,
              },
            },
          },
        });

        io.to(`chat:${data.chatId}`).emit('message_unpinned', {
          chatId: data.chatId,
          messageId: data.messageId,
          newPinnedMessage: latestPin?.message || null,
        });
      } catch (error) {
        console.error('Unpin message error:', error);
      }
    });

    // ======= WebRTC Calls =======

    // Initiate a call: relay offer to the target user
    socket.on('call_offer', async (data: { targetUserId: number; offer: unknown; callType: 'voice' | 'video'; chatId?: number }) => {
      if (!data.targetUserId) return;

      // Find a common personal chat between caller and target (server-side lookup for security)
      let chatId = data.chatId;
      if (!chatId) {
        const commonChat = await prisma.chat.findFirst({
          where: {
            type: 'personal',
            AND: [
              { members: { some: { userId } } },
              { members: { some: { userId: data.targetUserId } } },
            ],
          },
          select: { id: true },
        });
        if (!commonChat) {
          socket.emit('call_unavailable', { targetUserId: data.targetUserId });
          return;
        }
        chatId = commonChat.id;
      } else {
        // If chatId provided, verify membership
        if (!(await isChatMember(chatId, userId)) || !(await isChatMember(chatId, data.targetUserId))) {
          socket.emit('error', { message: 'РќРµС‚ РѕР±С‰РµРіРѕ С‡Р°С‚Р° РґР»СЏ Р·РІРѕРЅРєР°' });
          return;
        }
      }

      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        // Look up caller info to send to callee
        let callerInfo: { id: number; username: string; displayName: string; avatar: string | null } | null = null;
        try {
          const caller = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, displayName: true, avatar: true },
          });
          callerInfo = caller;
        } catch (e) {
          // Ignore lookup errors
        }
        for (const sid of targetSockets) {
          io.to(sid).emit('call_incoming', {
            from: userId,
            offer: data.offer,
            callType: data.callType,
            chatId,
            callerInfo,
          });
        }
      } else {
        // Target is offline
        socket.emit('call_unavailable', { targetUserId: data.targetUserId });
      }
    });

    // Relay answer back to caller
    socket.on('call_answer', (data: { targetUserId: number; answer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('call_answered', {
            from: userId,
            answer: data.answer,
          });
        }
      }
    });

    // ICE candidate exchange
    socket.on('ice_candidate', (data: { targetUserId: number; candidate: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('ice_candidate', {
            from: userId,
            candidate: data.candidate,
          });
        }
      }
    });

    // End call
    socket.on('call_end', (data: { targetUserId: number }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('call_ended', { from: userId });
        }
      }
    });

    // Decline call
    socket.on('call_decline', (data: { targetUserId: number }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('call_declined', { from: userId });
        }
      }
    });

    // Toggle video during call (audio в†’ video upgrade)
    socket.on('call_video_toggle', (data: { targetUserId: number; videoOn: boolean }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('call_video_toggle', { from: userId, videoOn: data.videoOn });
        }
      }
    });

    // Renegotiate (when adding video/screen share to an existing call)
    socket.on('renegotiate', (data: { targetUserId: number; offer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('renegotiate', { from: userId, offer: data.offer });
        }
      }
    });

    socket.on('renegotiate_answer', (data: { targetUserId: number; answer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('renegotiate_answer', { from: userId, answer: data.answer });
        }
      }
    });

    // ======= Group Conference Calls =======

    // Query active group call status for a chat
    socket.on('group_call_status', async (data: { chatId: number }) => {
      if (!data.chatId || typeof data.chatId !== 'number') return;
      if (!(await isChatMember(data.chatId, userId))) return;
      const participants = activeGroupCalls.get(data.chatId);
      socket.emit('group_call_active', {
        chatId: data.chatId,
        participants: participants ? Array.from(participants) : [],
        callType: 'voice',
      });
    });

    // Start or join a group call
    socket.on('group_call_join', async (data: { chatId: number; callType: 'voice' | 'video' }) => {
      if (!data.chatId || typeof data.chatId !== 'number') return;
      if (!(await isChatMember(data.chatId, userId))) {
        socket.emit('error', { message: 'РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЌС‚РѕРјСѓ С‡Р°С‚Сѓ' });
        return;
      }
      // Verify it's a group chat
      const chat = await prisma.chat.findUnique({ where: { id: data.chatId }, select: { type: true } });
      if (!chat || chat.type !== 'group') return;

      if (!activeGroupCalls.has(data.chatId)) {
        activeGroupCalls.set(data.chatId, new Set());
      }
      const participants = activeGroupCalls.get(data.chatId)!;
      const existingParticipants = Array.from(participants);
      participants.add(userId);

      // Look up joiner info
      const joinerInfo = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, avatar: true },
      });

      // Notify existing participants that someone joined
      for (const pid of existingParticipants) {
        const pSockets = onlineUsers.get(pid);
        if (pSockets) {
          for (const sid of pSockets) {
            io.to(sid).emit('group_call_user_joined', {
              chatId: data.chatId,
              userId,
              userInfo: joinerInfo,
            });
          }
        }
      }

      // Send current participant list to the joiner
      const participantInfos = await prisma.user.findMany({
        where: { id: { in: existingParticipants } },
        select: { id: true, username: true, displayName: true, avatar: true },
      });

      socket.emit('group_call_participants', {
        chatId: data.chatId,
        participants: participantInfos,
      });

      // Notify all group members about the active call (for "join" button)
      io.to(`chat:${data.chatId}`).emit('group_call_active', {
        chatId: data.chatId,
        participants: Array.from(participants),
        callType: data.callType,
      });
    });

    // Leave a group call
    socket.on('group_call_leave', async (data: { chatId: number }) => {
      if (!data.chatId) return;
      const participants = activeGroupCalls.get(data.chatId);
      if (!participants) return;
      participants.delete(userId);

      // Notify remaining participants
      for (const pid of participants) {
        const pSockets = onlineUsers.get(pid);
        if (pSockets) {
          for (const sid of pSockets) {
            io.to(sid).emit('group_call_user_left', { chatId: data.chatId, userId });
          }
        }
      }

      if (participants.size === 0) {
        activeGroupCalls.delete(data.chatId);
      }

      // Update active call status
      io.to(`chat:${data.chatId}`).emit('group_call_active', {
        chatId: data.chatId,
        participants: participants.size > 0 ? Array.from(participants) : [],
        callType: 'voice',
      });
    });

    // Relay group call signaling between specific participants
    socket.on('group_call_offer', (data: { chatId: number; targetUserId: number; offer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('group_call_offer', { chatId: data.chatId, from: userId, offer: data.offer });
        }
      }
    });

    socket.on('group_call_answer', (data: { chatId: number; targetUserId: number; answer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('group_call_answer', { chatId: data.chatId, from: userId, answer: data.answer });
        }
      }
    });

    socket.on('group_ice_candidate', (data: { chatId: number; targetUserId: number; candidate: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('group_ice_candidate', { chatId: data.chatId, from: userId, candidate: data.candidate });
        }
      }
    });

    socket.on('group_call_renegotiate', (data: { chatId: number; targetUserId: number; offer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('group_call_renegotiate', { chatId: data.chatId, from: userId, offer: data.offer });
        }
      }
    });

    socket.on('group_call_renegotiate_answer', (data: { chatId: number; targetUserId: number; answer: unknown }) => {
      const targetSockets = onlineUsers.get(data.targetUserId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('group_call_renegotiate_answer', { chatId: data.chatId, from: userId, answer: data.answer });
        }
      }
    });

    // ======= Live Stream Events =======

    socket.on('start_stream', async (data: { chatId: number; streamType: string }) => {
      try {
        if (!data.chatId || !data.streamType) return;

        // Check if user is channel owner/co-owner/admin
        const member = await prisma.chatMember.findUnique({
          where: { chatId_userId: { chatId: data.chatId, userId } },
        });

        if (!member || !['owner', 'co-owner', 'admin'].includes(member.role)) {
          socket.emit('error', { message: 'РўРѕР»СЊРєРѕ РІР»Р°РґРµР»РµС†, СЃРѕРІР»Р°РґРµР»РµС† РёР»Рё Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РјРѕР¶РµС‚ РЅР°С‡Р°С‚СЊ С‚СЂР°РЅСЃР»СЏС†РёСЋ' });
          return;
        }

        // Create stream record
        const stream = await prisma.liveStream.create({
          data: {
            chatId: data.chatId,
            ownerId: userId,
            streamType: data.streamType,
            isLive: true,
          },
        });

        activeStreams.set(data.chatId, {
          ownerId: userId,
          viewers: new Set(),
          streamType: data.streamType,
        });

        // Notify all chat members
        io.to(`chat:${data.chatId}`).emit('stream_started', {
          chatId: data.chatId,
          ownerId: userId,
          streamType: data.streamType,
          streamId: stream.id,
        });
      } catch (error) {
        console.error('Start stream error:', error);
        socket.emit('error', { message: 'РћС€РёР±РєР° Р·Р°РїСѓСЃРєР° С‚СЂР°РЅСЃР»СЏС†РёРё' });
      }
    });

    socket.on('stop_stream', async (data: { chatId: number }) => {
      try {
        if (!data.chatId) return;

        const streamInfo = activeStreams.get(data.chatId);
        if (!streamInfo || streamInfo.ownerId !== userId) return;

        // Update stream record
        await prisma.liveStream.updateMany({
          where: { chatId: data.chatId, isLive: true },
          data: { isLive: false, endedAt: new Date() },
        });

        activeStreams.delete(data.chatId);

        // Notify all chat members
        io.to(`chat:${data.chatId}`).emit('stream_stopped', {
          chatId: data.chatId,
        });
      } catch (error) {
        console.error('Stop stream error:', error);
      }
    });

    socket.on('join_stream_viewer', async (data: { chatId: number }) => {
      try {
        if (!data.chatId) return;

        const streamInfo = activeStreams.get(data.chatId);
        if (!streamInfo) return;

        streamInfo.viewers.add(userId);

        // Notify stream owner
        const ownerSockets = onlineUsers.get(streamInfo.ownerId);
        if (ownerSockets) {
          for (const sid of ownerSockets) {
            io.to(sid).emit('viewer_joined', {
              chatId: data.chatId,
              viewerId: userId,
              count: streamInfo.viewers.size,
            });
          }
        }
      } catch (error) {
        console.error('Join stream viewer error:', error);
      }
    });

    socket.on('leave_stream_viewer', async (data: { chatId: number }) => {
      try {
        if (!data.chatId) return;

        const streamInfo = activeStreams.get(data.chatId);
        if (!streamInfo) return;

        streamInfo.viewers.delete(userId);

        // Notify stream owner
        const ownerSockets = onlineUsers.get(streamInfo.ownerId);
        if (ownerSockets) {
          for (const sid of ownerSockets) {
            io.to(sid).emit('viewer_left', {
              chatId: data.chatId,
              viewerId: userId,
              count: streamInfo.viewers.size,
            });
          }
        }
      } catch (error) {
        console.error('Leave stream viewer error:', error);
      }
    });

    // ======= Friend System Events =======

    socket.on('friend_request', async (data: { friendId: number }) => {
      if (!data.friendId || typeof data.friendId !== 'number') return;
      // Verify a pending friendship actually exists
      const friendship = await prisma.friendship.findFirst({
        where: { userId, friendId: data.friendId, status: 'pending' },
      });
      if (!friendship) return;

      const targetSockets = onlineUsers.get(data.friendId);
      if (targetSockets) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, displayName: true, avatar: true },
        });
        for (const sid of targetSockets) {
          io.to(sid).emit('friend_request_received', { from: user });
        }
      }
    });

    socket.on('friend_accepted', async (data: { friendId: number }) => {
      if (!data.friendId || typeof data.friendId !== 'number') return;
      // Verify an accepted friendship actually exists
      const friendship = await prisma.friendship.findFirst({
        where: {
          status: 'accepted',
          OR: [
            { userId, friendId: data.friendId },
            { userId: data.friendId, friendId: userId },
          ],
        },
      });
      if (!friendship) return;

      const targetSockets = onlineUsers.get(data.friendId);
      if (targetSockets) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, displayName: true, avatar: true },
        });
        for (const sid of targetSockets) {
          io.to(sid).emit('friend_request_accepted', { from: user });
        }
      }
    });

    socket.on('friend_removed', async (data: { friendId: number }) => {
      if (!data.friendId || typeof data.friendId !== 'number') return;
      // Verify friendship was actually deleted (no record exists)
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { userId, friendId: data.friendId },
            { userId: data.friendId, friendId: userId },
          ],
        },
      });
      // If friendship still exists, don't emit removal
      if (friendship) return;

      const targetSockets = onlineUsers.get(data.friendId);
      if (targetSockets) {
        for (const sid of targetSockets) {
          io.to(sid).emit('friend_removed', { userId });
        }
      }
    });

    // РћС‚РєР»СЋС‡РµРЅРёРµ
    socket.on('disconnect', async () => {
      console.log(`РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РѕС‚РєР»СЋС‡РёР»СЃСЏ: ${userId}`);

      // Remove from active group calls
      for (const [chatId, participants] of activeGroupCalls) {
        if (participants.has(userId)) {
          participants.delete(userId);
          for (const pid of participants) {
            const pSockets = onlineUsers.get(pid);
            if (pSockets) {
              for (const sid of pSockets) {
                io.to(sid).emit('group_call_user_left', { chatId, userId });
              }
            }
          }
          if (participants.size === 0) {
            activeGroupCalls.delete(chatId);
          }
          io.to(`chat:${chatId}`).emit('group_call_active', {
            chatId,
            participants: participants.size > 0 ? Array.from(participants) : [],
            callType: 'voice',
          });
        }
      }

      // Stop active streams if owner disconnects
      for (const [chatId, streamInfo] of activeStreams) {
        if (streamInfo.ownerId === userId) {
          // Update stream record
          await prisma.liveStream.updateMany({
            where: { chatId, isLive: true },
            data: { isLive: false, endedAt: new Date() },
          });

          activeStreams.delete(chatId);

          // Notify all chat members
          io.to(`chat:${chatId}`).emit('stream_stopped', {
            chatId,
          });
        } else if (streamInfo.viewers.has(userId)) {
          streamInfo.viewers.delete(userId);
          // Notify stream owner
          const ownerSockets = onlineUsers.get(streamInfo.ownerId);
          if (ownerSockets) {
            for (const sid of ownerSockets) {
              io.to(sid).emit('viewer_left', {
                chatId,
                viewerId: userId,
                count: streamInfo.viewers.size,
              });
            }
          }
        }
      }

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);

          await prisma.user.update({
            where: { id: userId },
            data: { isOnline: false, lastSeen: new Date() },
          });

          socket.broadcast.emit('user_offline', {
            userId,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    });
  });
}

async function rescheduleMessages(io: Server) {
  try {
    const scheduled = await prisma.message.findMany({
      where: {
        scheduledAt: { not: null },
      },
      include: {
        sender: { select: SENDER_SELECT },
        forwardedFrom: { select: SENDER_SELECT },
        replyTo: {
          include: { sender: { select: { id: true, username: true, displayName: true } } },
        },
        media: true,
        reactions: true,
        readBy: true,
      },
    });

    for (let i = 0; i < scheduled.length; i++) {
      const msg = scheduled[i];
      // Stagger overdue messages by 100ms each to avoid simultaneous DB spike
      const rawDelay = new Date(msg.scheduledAt!).getTime() - Date.now();
      const delay = Math.min(Math.max(i * 100, rawDelay), MAX_TIMEOUT);
      setTimeout(async () => {
        try {
          // Check if message was deleted while waiting
          const current = await prisma.message.findUnique({ where: { id: msg.id } });
          if (!current || current.isDeleted) return;

          await prisma.message.update({
            where: { id: msg.id },
            data: { scheduledAt: null },
          });

          // Create sender read receipt
          await prisma.readReceipt.upsert({
            where: { messageId_userId: { messageId: msg.id, userId: msg.senderId } },
            create: { messageId: msg.id, userId: msg.senderId },
            update: {},
          });

          const updated = await prisma.message.findUnique({
            where: { id: msg.id },
            include: {
              sender: { select: SENDER_SELECT },
              forwardedFrom: { select: SENDER_SELECT },
              replyTo: {
                include: { sender: { select: { id: true, username: true, displayName: true } } },
              },
              media: true,
              reactions: true,
              readBy: true,
            },
          });

          if (updated) {
            io.to(`chat:${msg.chatId}`).emit('scheduled_delivered', {
              ...updated,
              readBy: updated.readBy.map(r => ({ userId: r.userId })),
            });
          }
        } catch (err) {
          console.error('Scheduled delivery error:', err);
        }
      }, delay);
    }

    if (scheduled.length > 0) {
      console.log(`  вњ” ${scheduled.length} scheduled message(s) re-armed`);
    }
  } catch (err) {
    console.error('Error rescheduling messages:', err);
  }
}
