# 🚀 NIMBUS - Distributed File Storage

## 📖 Описание

Файлы хранятся **не на сервере**, а в **Telegram каналах** и **Discord серверах**. Это означает:

- ✅ **Неограниченное хранилище** (используем несколько каналов)
- ✅ **Файлы до 20GB** каждый
- ✅ **Любые форматы** (видео, аудио, документы, архивы)
- ✅ **Децентрализация** (файлы в разных юрисдикциях)
- ✅ **Шифрование** (20 методов, случайный выбор на чанк)
- ✅ **Отказоустойчивость** (дублирование на разные сервисы)

---

## 🔧 Настройка

### 1. Создай Telegram ботов

1. Открой [@BotFather](https://t.me/BotFather)
2. `/newbot` → придумай имя и username
3. Скопируй токен (выглядит как `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**Нужно минимум 1 бот, лучше 3-5 для надёжности**

### 2. Создай Telegram каналы

1. Создай канал в Telegram
2. Добавь ботов как **администраторов** (с правом отправки сообщений)
3. Узнай ID канала:
   - Добавь [@RawDataBot](https://t.me/RawDataBot) в канал
   - Он пришлёт JSON с `id` (например, `-1001234567890`)
   - Удали RawDataBot после получения ID

**Нужно минимум 1 канал, лучше 5-10**

### 3. Создай Discord вебхуки

1. Зайди в настройки Discord сервера → Каналы
2. Выбери канал → Edit Channel → Integrations → Webhooks
3. New Webhook → Copy Webhook URL

**Нужно минимум 1 вебхук, лучше 3-5**

### 4. Создай базу данных для хранилища

На Render:
1. New + → PostgreSQL
2. Name: `nimbus-storage`
3. Скопируй connectionString

Или используй готовую:
```
postgresql://v_b8cf_user:atyPNV6Gl45p62htAvpsDmCZ3Rk2@dpg-d704so6uk2gs739442q0-a.virginia-postgres.render.com/v_b8cf
```

### 5. Настрой .storage.env

Скопируй `.storage.env.example` в `.storage.env`:

```bash
# Server
NODE_ENV=production
PORT=3002

# Databases
DATABASE_URL=<твоя основная БД мессенджера>
STORAGE_DATABASE_URL=<твоя БД для хранилища>

# Encryption
MASTER_KEY=<64 символа hex, например: 0123456789abcdef...>

# Telegram
TELEGRAM_BOT_TOKENS=BOT_TOKEN_1,BOT_TOKEN_2,BOT_TOKEN_3
TELEGRAM_CHANNEL_IDS=-1001234567890,-1001234567891,-1001234567892

# Discord
DISCORD_WEBHOOK_URLS=https://discord.com/api/webhooks/WEBHOOK_1,https://discord.com/api/webhooks/WEBHOOK_2

# Limits
MAX_FILE_SIZE=21474836480
CHUNK_SIZE=19922944
```

---

## 🚀 Запуск

### Локально:

```bash
# Установка зависимостей
npm install

# Запуск хранилища
npm run start:storage

# ИЛИ запуск мессенджера + хранилища
npm run dev
```

### На Render:

1. Добавь переменные из `.storage.env` в Environment сервиса
2. Добавь команду запуска:

```bash
npm install && npm run build && node apps/server/dist/index.js & node apps/server/storage-server.js
```

---

## 📊 API

### Загрузка файла

```http
POST /api/storage/upload
Content-Type: multipart/form-data

file: <binary>
```

**Ответ:**
```json
{
  "fileId": "uuid",
  "fileName": "example.zip",
  "size": 1048576,
  "chunks": 53
}
```

### Скачивание файла

```http
GET /api/storage/download/:fileId
```

**Ответ:** Файл как attachment

### Информация о файле

```http
GET /api/storage/info/:fileId
```

**Ответ:**
```json
{
  "fileId": "uuid",
  "fileName": "example.zip",
  "size": 1048576,
  "mimeType": "application/zip",
  "chunks": 53,
  "uploadedAt": "2026-03-22T19:00:00.000Z",
  "distribution": [
    { "service": "telegram", "count": 30 },
    { "service": "discord", "count": 23 }
  ]
}
```

### Удаление файла

```http
DELETE /api/storage/delete/:fileId
```

**Ответ:**
```json
{ "success": true }
```

### Проверка здоровья

```http
GET /api/storage/health
```

**Ответ:**
```json
{
  "status": "ok",
  "telegramBots": 3,
  "telegramChannels": 5,
  "discordWebhooks": 3,
  "totalResources": 11
}
```

---

## 🔐 Шифрование

Каждый чанк шифруется **случайным методом** из 20 доступных:

- **AES** (128/192/256 бит) в режимах GCM, CCM, CBC, CTR
- **ChaCha20-Poly1305**
- **ARIA** (128/192/256 бит) GCM
- **Camellia** (128/192/256 бит) GCM, CBC
- **3DES-CBC**

**Ключи:**
- Каждый чанк → случайный 256-битный ключ
- Ключ шифруется мастер-ключом (AES-256-GCM)
- Зашифрованный ключ хранится в БД

---

## 📈 Архитектура

```
┌─────────────┐
│   Файл 2GB  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Разбиение на чанки по 19MB         │
│  (105 чанков для 2GB)               │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Шифрование каждого чанка:          │
│  - Случайный метод (из 20)          │
│  - Случайный ключ (32 байта)        │
│  - Уникальный IV                    │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Распределение по сервисам:         │
│  - Telegram канал 1: чанки 1-35     │
│  - Discord сервер 1: чанки 36-70    │
│  - Telegram канал 2: чанки 71-105   │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Сохранение метаданных в БД:        │
│  - file_id, chunk_index             │
│  - service (telegram/discord)       │
│  - remote_id (message ID)           │
│  - encrypted_key, method, iv, tag   │
└─────────────────────────────────────┘
```

---

## 🎯 Преимущества

| Характеристика | Традиционное | Nimbus Storage |
|---------------|-------------|----------------|
| **Хранилище** | Сервер (дорого) | Telegram/Discord (бесплатно) |
| **Лимит файла** | Зависит от диска | 20GB на файл |
| **Масштабирование** | Купить диск | Добавить канал |
| **Юрисдикция** | Одна страна | Файлы в разных странах |
| **Цензуроустойчивость** | Низкая | Высокая |
| **Стоимость** | $5-50/мес за TB | $0 (бесплатно) |

---

## ⚠️ Важные заметки

1. **Не удаляй каналы/вебхуки** — файлы пропадут
2. **Делай бэкапы БД** — там метаданные для расшифровки
3. **Храни MASTER_KEY в секрете** — без него не расшифровать
4. **Используй 3+ бота и 5+ каналов** — для надёжности
5. **Мониторь лимиты** — у Telegram/Discord есть дневные лимиты

---

## 🆘 Troubleshooting

### "No storage resources available"
- Проверь, что боты добавлены в каналы как админы
- Проверь токены ботов в .storage.env
- Перезапусти сервер

### "Encryption failed"
- Некоторые методы могут не поддерживаться в старой Node.js
- Обнови Node.js до 18+

### "File not found"
- Проверь, что файл загружен и есть в БД
- Проверь подключение к STORAGE_DATABASE_URL

---

**🎉 Готово! Твои файлы теперь в безопасности! 🚀**
