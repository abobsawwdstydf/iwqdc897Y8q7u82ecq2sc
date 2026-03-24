/**
 * Автоматическая инициализация базы данных
 * Создаёт таблицы если их нет (через Prisma Client)
 */

require('dotenv').config();
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

async function initDB() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL не указан');
    process.exit(1);
  }
  
  const client = new Client({ 
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('neon.tech') || databaseUrl.includes('render.com')
      ? { rejectUnauthorized: false }
      : false
  });
  
  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl }
    }
  });
  
  try {
    await client.connect();
    console.log('✅ Подключение к базе данных');
    
    // Проверяем наличие таблиц
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'User'
      );
    `);
    
    const tableExists = result.rows[0]?.exists ?? false;
    
    if (!tableExists) {
      console.log('📝 Таблицы не найдены, создаём через Prisma...');
      
      try {
        // Создаём таблицы через Prisma db push
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            -- User table
            CREATE TABLE IF NOT EXISTS "User" (
              id SERIAL PRIMARY KEY,
              username TEXT UNIQUE NOT NULL,
              "displayName" TEXT DEFAULT '',
              email TEXT UNIQUE,
              phone TEXT,
              password TEXT NOT NULL,
              avatar TEXT,
              bio TEXT DEFAULT '',
              birthday TEXT,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "lastSeen" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "isOnline" BOOLEAN DEFAULT false,
              "hideStoryViews" BOOLEAN DEFAULT false,
              "registrationIp" TEXT,
              "isVerified" BOOLEAN DEFAULT false
            );
            
            -- Chat table
            CREATE TABLE IF NOT EXISTS "Chat" (
              id SERIAL PRIMARY KEY,
              type TEXT DEFAULT 'personal',
              name TEXT,
              username TEXT UNIQUE,
              avatar TEXT,
              description TEXT,
              "isPublic" BOOLEAN DEFAULT false,
              "inviteLink" TEXT UNIQUE,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- ChatMember table
            CREATE TABLE IF NOT EXISTS "ChatMember" (
              id SERIAL PRIMARY KEY,
              "chatId" INTEGER REFERENCES "Chat"(id) ON DELETE CASCADE,
              "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
              role TEXT DEFAULT 'member',
              "joinedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "isMuted" BOOLEAN DEFAULT false,
              "isArchived" BOOLEAN DEFAULT false,
              "isPinned" BOOLEAN DEFAULT false,
              "clearedAt" TIMESTAMP,
              UNIQUE("chatId", "userId")
            );
            
            -- Message table
            CREATE TABLE IF NOT EXISTS "Message" (
              id SERIAL PRIMARY KEY,
              "chatId" INTEGER REFERENCES "Chat"(id) ON DELETE CASCADE,
              "senderId" INTEGER REFERENCES "User"(id),
              content TEXT,
              type TEXT DEFAULT 'text',
              "replyToId" INTEGER REFERENCES "Message"(id),
              quote TEXT,
              "forwardedFromId" INTEGER REFERENCES "User"(id),
              "isEdited" BOOLEAN DEFAULT false,
              "isDeleted" BOOLEAN DEFAULT false,
              "scheduledAt" TIMESTAMP,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Media table
            CREATE TABLE IF NOT EXISTS "Media" (
              id SERIAL PRIMARY KEY,
              "messageId" INTEGER REFERENCES "Message"(id) ON DELETE CASCADE,
              type TEXT NOT NULL,
              url TEXT NOT NULL,
              filename TEXT,
              thumbnail TEXT,
              size INTEGER,
              duration DOUBLE PRECISION,
              width INTEGER,
              height INTEGER
            );
            
            -- Reaction table
            CREATE TABLE IF NOT EXISTS "Reaction" (
              id SERIAL PRIMARY KEY,
              "messageId" INTEGER REFERENCES "Message"(id) ON DELETE CASCADE,
              "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
              emoji TEXT NOT NULL,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              UNIQUE("messageId", "userId", "emoji")
            );
            
            -- ReadReceipt table
            CREATE TABLE IF NOT EXISTS "ReadReceipt" (
              id SERIAL PRIMARY KEY,
              "messageId" INTEGER REFERENCES "Message"(id) ON DELETE CASCADE,
              "userId" INTEGER REFERENCES "User"(id) ON DELETE CASCADE,
              "readAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              UNIQUE("messageId", "userId")
            );
            
            -- File table (для хранилища)
            CREATE TABLE IF NOT EXISTS "File" (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              size BIGINT NOT NULL,
              chunks INTEGER NOT NULL,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Chunk table (для хранилища)
            CREATE TABLE IF NOT EXISTS "Chunk" (
              "fileId" TEXT REFERENCES "File"(id) ON DELETE CASCADE,
              "chunkIndex" INTEGER NOT NULL,
              service TEXT NOT NULL,
              "botId" INTEGER,
              "channelId" BIGINT,
              "webhookId" INTEGER,
              "remoteId" TEXT NOT NULL,
              "encryptedKey" TEXT NOT NULL,
              "encryptionMethod" TEXT NOT NULL,
              "chunkSize" INTEGER NOT NULL,
              iv TEXT NOT NULL,
              "authTag" TEXT,
              "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY("fileId", "chunkIndex")
            );
            
            -- Telegram bots table
            CREATE TABLE IF NOT EXISTS "telegram_bots" (
              id SERIAL PRIMARY KEY,
              token TEXT UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Telegram channels table
            CREATE TABLE IF NOT EXISTS "telegram_channels" (
              id SERIAL PRIMARY KEY,
              chat_id BIGINT UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Discord webhooks table
            CREATE TABLE IF NOT EXISTS "discord_webhooks" (
              id SERIAL PRIMARY KEY,
              url TEXT UNIQUE NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          END $$;
        `);
        
        console.log('✅ Таблицы созданы');
      } catch (err) {
        console.error('⚠️  Ошибка создания таблиц:', err.message);
        console.log('⚠️  Продолжаем работу...');
      }
    } else {
      console.log('✅ Таблицы существуют');
    }
    
  } catch (error) {
    console.error('❌ Ошибка подключения:', error.message);
  } finally {
    await client.end();
    await prisma.$disconnect();
  }
}

initDB();
