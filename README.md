# 🚀 NIMBUS MESSENGER
## Полный гайд по настройке и использованию

**Автор:** haker_one  
**Версия:** 2.0.0

---

## 📋 Содержание

1. [Быстрый старт](#быстрый-старт)
2. [Настройка Telegram](#настройка-telegram)
3. [Настройка Discord](#настройка-discord)
4. [Настройка .env](#настройка-env)
5. [Деплой на Render](#деплой-на-render)
6. [Админ-панель](#админ-панель)
7. [Шифрование и безопасность](#шифрование-и-безопасность)

---

## ⚡ Быстрый старт

### 1. Установка
```bash
npm install
```

### 2. Настройка
Скопируй `.env.example` в `.env`:
```bash
cp .env.example .env
```

Отредактируй `.env` (см. [Настройка .env](#настройка-env))

### 3. Запуск
```bash
npm run dev
```

**Готово!** Мессенджер доступен на `http://localhost:5173`

---

## 📱 Настройка Telegram

### Шаг 1: Создание бота

1. Открой Telegram и найди **[@BotFather](https://t.me/BotFather)**
2. Отправь команду `/newbot`
3. Придумай имя боту (например: `Nimbus Storage Bot`)
4. Придумай username (должен заканчиваться на `bot`, например: `nimbus_storage_bot`)
5. **Скопируй токен** (выглядит как: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Шаг 2: Создание канала

1. В Telegram нажми **Создать канал**
2. Назови его (например: `Nimbus Storage #1`)
3. Сделай канал **приватным**
4. **Добавь бота** как участника
5. **Назначь бота администратором** (с правом отправки сообщений)

### Шаг 3: Получение ID канала

1. Добавь в канал бота **[@RawDataBot](https://t.me/RawDataBot)**
2. Он пришлёт сообщение с JSON
3. Найди поле `"id"` (например: `-1001234567890`)
4. **Скопируй ID** (обязательно с минусом!)
5. Удали RawDataBot из канала

### Шаг 4: Повтори для нескольких каналов

**Рекомендуется:** 3-5 каналов для надёжности

---

## 💬 Настройка Discord

### Шаг 1: Создание вебхука

1. Открой Discord и зайди на свой сервер
2. Нажми **⚙️** (настройки канала) рядом с текстовым каналом
3. Перейди во вкладку **Интеграции** → **Вебхуки**
4. Нажми **Создать вебхук**
5. Придумай имя (например: `Nimbus Storage`)
6. **Скопируй URL вебхука** (выглядит как: `https://discord.com/api/webhooks/123456789/ABCdefGHIjkl...`)

### Шаг 2: Повтори для нескольких вебхуков

**Рекомендуется:** 3-5 вебхуков на разных серверах

---

## ⚙️ Настройка .env

Открой `.env` и заполни:

```env
# ===== Server =====
NODE_ENV=production
PORT=3001

# ===== Database =====
# Для Render: скопируй из дашборда Render
DATABASE_URL=postgresql://user:password@host:port/database

# Для локалки:
# DATABASE_URL=file:./apps/server/prisma/dev.db

# ===== Security =====
JWT_SECRET=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
ENCRYPTION_KEY=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# ===== CORS =====
CORS_ORIGINS=*

# ===== Limits =====
MAX_REGISTRATIONS_PER_IP=5
MAX_FILE_SIZE=53687091200
CHUNK_SIZE=19922944

# ===== Telegram (вставь свои значения) =====
TELEGRAM_BOT_TOKENS=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz,2345678901:BCdefGHIjklMNOpqrsTUVwxyzA
TELEGRAM_CHANNEL_IDS=-1001234567890,-1002345678901

# ===== Discord (вставь свои значения) =====
DISCORD_WEBHOOK_URLS=https://discord.com/api/webhooks/123/abc,https://discord.com/api/webhooks/456/def

# ===== Admin =====
ADMIN_TOKEN=qwertyuiopasd
```

---

## 🌐 Деплой на Render

### Шаг 1: Создание PostgreSQL

1. Зайди на [Render.com](https://render.com)
2. **New +** → **PostgreSQL**
3. Name: `nimbus-db`
4. Region: `Frankfurt`
5. Plan: `Free`
6. **Скопируй `External Database URL`**

### Шаг 2: Создание Web Service

1. **New +** → **Web Service**
2. Connect твой GitHub репозиторий
3. Заполни:
   - **Name:** `nimbus-messenger`
   - **Region:** `Frankfurt`
   - **Branch:** `main`
   - **Root Directory:** (оставь пустым)
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node apps/server/dist/index.js`

### Шаг 3: Переменные окружения

Добавь все переменные из `.env.render`:

```
NODE_ENV=production
DATABASE_URL=<твой URL от PostgreSQL>
JWT_SECRET=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
ENCRYPTION_KEY=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
CORS_ORIGINS=*
MAX_REGISTRATIONS_PER_IP=5
MAX_FILE_SIZE=53687091200
CHUNK_SIZE=19922944
TELEGRAM_BOT_TOKENS=<твои токены>
TELEGRAM_CHANNEL_IDS=<твои ID каналов>
DISCORD_WEBHOOK_URLS=<твои вебхуки>
ADMIN_TOKEN=qwertyuiopasd
```

### Шаг 4: Деплой

1. Нажми **Create Web Service**
2. Дождись завершения (5-10 минут)
3. Готово!

---

## 🛡️ Админ-панель

**URL:** `https://your-server.onrender.com/aaddmmiinnppaanneell`

**Пароль:** `qwertyuiopasd`

### Возможности:

| Функция | Описание |
|---------|----------|
| 👥 Пользователи | Бан/разбан, удаление, просмотр |
| 📦 Файлы | Просмотр, скачивание, удаление |
| 📊 Статистика | Пользователи, сообщения, файлы |
| ⚙️ Система | Перезапуск сервера, очистка кэша |

---

## 🔐 Шифрование и безопасность

### Уровни защиты

#### 1️⃣ Клиентское шифрование (AES-256-GCM)
- Сообщения шифруются **до отправки**
- Ключ генерируется из пароля (PBKDF2, 100000 итераций)
- Сервер **не видит** содержимое сообщений

#### 2️⃣ Серверное шифрование (20 методов)
Каждый чанк файла шифруется **случайным методом**:

| Метод | Ключ | Режим |
|-------|------|-------|
| AES-128 | 16 байт | GCM, CCM, CBC, CTR |
| AES-192 | 24 байт | GCM, CCM, CBC, CTR |
| AES-256 | 32 байт | GCM, CCM, CBC, CTR |
| ChaCha20 | 32 байт | Poly1305 |
| ARIA-128 | 16 байт | GCM |
| ARIA-192 | 24 байт | GCM |
| ARIA-256 | 32 байт | GCM |
| Camellia-128 | 16 байт | GCM, CBC |
| Camellia-192 | 24 байт | GCM, CBC |
| Camellia-256 | 32 байт | GCM, CBC |
| 3DES | 24 байт | CBC |

#### 3️⃣ Распределённое хранение
- Файл разбивается на **чанки по 19MB**
- Каждый чанк → **случайный сервис** (Telegram/Discord)
- Чанки **дублируются** для надёжности

#### 4️⃣ Защита ключей
- Каждый чанк → **уникальный 256-битный ключ**
- Ключ шифруется **MASTER_KEY** (AES-256-GCM)
- Зашифрованный ключ хранится в БД

### Схема шифрования

```
Файл (50GB)
    ↓
Разбиение на чанки (19MB каждый)
    ↓
Для каждого чанка:
  1. Выбор случайного метода (из 20)
  2. Генерация случайного ключа (32 байта)
  3. Шифрование чанка
  4. Шифрование ключа (MASTER_KEY)
  5. Отправка в Telegram/Discord
    ↓
Метаданные в БД:
  - encrypted_key
  - encryption_method
  - iv (уникальный для каждого)
  - auth_tag (для GCM/CCM)
```

### Безопасность данных

| Угроза | Защита |
|--------|--------|
| Взлом сервера | Файлы зашифрованы, ключи отдельно |
| Перехват трафика | HTTPS + клиентское шифрование |
| Удаление файлов | Дублирование в Telegram + Discord |
| Доступ к БД | Ключи зашифрованы MASTER_KEY |
| DDoS | Rate limiting, Cloudflare |

---

## 📊 Характеристики

| Параметр | Значение |
|----------|----------|
| **Макс. размер файла** | 50GB (сервер), 20GB (пользователь) |
| **Методы шифрования** | 20 |
| **Уровни защиты** | 4 |
| **Хранилища** | Telegram + Discord |
| **Лимит чанков** | Неограниченно |
| **Скорость** | До 100MB/s (зависит от канала) |

---

## 🆘 Troubleshooting

### "No storage resources available"
- Проверь, что боты добавлены в каналы как админы
- Проверь токены в `.env`
- Перезапусти сервер

### "Database connection failed"
- Проверь `DATABASE_URL`
- Убедись, что PostgreSQL доступен

### "Admin panel not found"
- Правильный URL: `/aaddmmiinnppaanneell`
- Пароль: `qwertyuiopasd`

---

## 📞 Поддержка

**GitHub:** [@haker_one](https://github.com/haker_one)  
**Telegram:** @haker_one

---

**© 2026 haker_one. Все права защищены.**
