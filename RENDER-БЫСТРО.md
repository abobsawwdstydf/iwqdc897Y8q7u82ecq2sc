# ⚡ БЫСТРАЯ НАСТРОЙКА RENDER

## 🎯 Что случилось?
Сборка падала с ошибкой **134** (out of memory).

## ✅ Исправление:

### 1. Build Command (скопируй это!)
```bash
npm install && NODE_OPTIONS="--max-old-space-size=2048" npm run build
```

### 2. Start Command (скопируй это!)
```bash
node apps/server/dist/index.js
```

---

## 📋 Полные настройки для Render:

```
Name: nexo-messenger
Region: Frankfurt
Branch: main
Root Directory: (пусто)
Runtime: Node

Build Command: npm install && NODE_OPTIONS="--max-old-space-size=2048" npm run build

Start Command: node apps/server/dist/index.js

Instance Type: Starter ($7/мес)
```

---

## 🔐 Environment Variables (все добавь!)

```
NODE_ENV=production
PORT=3001

DATABASE_URL=postgresql://neondb_owner:npg_DOzU4jR8arce@ep-wandering-dawn-an3qfdn4-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

JWT_SECRET=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
ENCRYPTION_KEY=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
DB_ENCRYPTION_ENABLED=true

CORS_ORIGINS=*
MAX_REGISTRATIONS_PER_IP=22
MAX_FILE_SIZE=53687091200
CHUNK_SIZE=19922944

TELEGRAM_BOT_TOKENS=8758209438:AAEnaXcJ7ke88fjjHNPwQVTt_u9LYrSzPFk,8748554768:AAEnJcHklmilbjih9glo3GITnQXSx4YmM_8,8554202189:AAGN0wLfcgkqK3KJ9XOJFl40rp2kjkIcm1Y,8744960493:AAHB5bn3VxlZWKJjCr70yLYJnVTyXp2zHIs,8687986079:AAGPYjnq4gdXCkf2wT81f0l2tQalKCIIyds,8141008503:AAEaCM1RrN2ppbZmUzhpW4EeLUgT1qQ2QS0,8758985233:AAF7QfRApnccaByBYa1qjGs7u-erQ47OZcQ,8733182475:AAFBitv4g4LVRuvGnssyqHQpttBydeAda9Y,8774720953:AAGvExABKj4Z-DYfKdqF-OMEdoeySeOeOoY,8674460757:AAFm7WVkDx4ISkx22toTQyrQUeGQfLdF8QM

TELEGRAM_CHANNEL_IDS=-1003850596987,-1003878106202,-1003738083520,-1003868880877

DISCORD_WEBHOOK_URLS=https://discord.com/api/webhooks/1485562630663049298/N2zoK3IJrfFEEuzQldGF835RHUkb3qBS7WFHDknhJ6ZsmoZfF8tLtl_GyHxfMgcjbYbs,https://discord.com/api/webhooks/1485563746725265418/2mDS_yV88cn3rzPifyLmLdSVJxm3mkC-CdkvCBUv-lFU_NCbGP9hQ5ajjiUFoGGxDZQ7

ADMIN_TOKEN=qwertyuiopasd

REDIS_URL=redis://localhost:6379
```

---

## 🚀 Деплой:

1. Создай Web Service на Render
2. Вставь Build и Start команды выше
3. Добавь ВСЕ Environment Variables
4. Нажми **Create Web Service**
5. Жди 5-10 минут (сборка с NODE_OPTIONS работает!)

---

## ✅ Проверка:

После деплоя открой:
```
https://nexo-messenger.onrender.com/api/health
```

Должно быть: `{"status":"ok"}`

---

**ГОТОВО!** 🎉
