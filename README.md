# 🚀 Nexo Messenger

**Современный мессенджер с хранением файлов в Telegram/Discord**

---

## ⚡ ОДНА КОМАНДА ДЛЯ ВСЕГО!

### Локально (разработка):
```bash
npm run go
```

### Продакшен (Render/VDS):
```bash
npm run prod
```

**ВСЁ!** 🎉

---

## 📦 Что делает `npm run go`?

1. ✅ `npm install` - устанавливает зависимости
2. ✅ `npm run build` - собирает проект
3. ✅ `npm run db:setup` - настраивает базу данных
4. ✅ `npm run dev` - запускает сервер и фронтенд

---

## 🌟 Возможности

- 📁 **Хранение файлов** в Telegram/Discord (не на сервере!)
- 🔐 **20 методов шифрования** (AES, ChaCha20, Aria, Camellia)
- 📞 **Голосовые и видеозвонки** WebRTC
- 🎥 **Видео-кружки** как в Telegram
- 📂 **Папки чатов** как в Telegram
- 📱 **Адаптация** под мобильные/планшеты/ПК
- ⚖️ **Балансировка нагрузки** между ботами

---

## 🔧 Настройки (уже заполнены!)

Всё уже настроено в `.env`:

- ✅ **Neon PostgreSQL**: основная база данных
- ✅ **Telegram**: 10 ботов, 4 канала
- ✅ **Discord**: 2 вебхука
- ✅ **Шифрование**: AES-256-GCM включено
- ✅ **Ключи шифрования**: сгенерированы

**Менять ничего не нужно!**

---

## 🗄️ Базы данных

### Основная база (Neon PostgreSQL)
```
postgresql://neondb_owner:npg_DOzU4jR8arce@ep-wandering-dawn-an3qfdn4-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### Несколько баз (опционально)
```env
SECONDARY_DATABASES=postgresql://user:pass@host2:5432/db2,postgresql://user:pass@host3:5432/db3
```

### Шифрование
```env
DB_ENCRYPTION_ENABLED=true
ENCRYPTION_KEY=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
```

**Данные в базе шифруются перед записью!**

---

## 📊 Команды

| Команда | Описание |
|---------|----------|
| `npm run go` | **ЗАПУСТИТЬ ВСЁ** (dev) - данные **НЕ** удаляются |
| `npm run prod` | **ПРОДАКШЕН** (Render/VDS) - данные **НЕ** удаляются |
| `npm run dev` | Запуск разработки |
| `npm run build` | Сборка |
| `npm run db:setup` | ⚠️ Пересоздать БД (данные удалятся!) |

---

## 🔒 База данных

**При запуске `npm run go` или `npm run prod`:**
- ✅ Данные **НЕ** удаляются
- ✅ Таблицы создаются только если их нет
- ✅ Все сообщения, пользователи, файлы сохраняются

**Если нужно сбросить всё:**
```bash
npm run db:setup
```

---

## 🌐 Render - инструкция

### 1. Создай PostgreSQL
- Render.com → New+ → PostgreSQL
- Скопируй **External Database URL**

### 2. Создай Web Service
- New+ → Web Service
- Репозиторий: `abobsawwdstydf/iwqdc897Y8q7u82ecq2sc`

### 3. Настройки
```
Name: nexo-messenger
Region: Frankfurt
Branch: main
Build Command: npm install && npm run build
Start Command: npm run prod
```

### 4. Environment Variables
Добавь все из `.env` (уже заполнены)

**Готово!**

---

## 🛡️ Безопасность

- ✅ AES-256-GCM шифрование
- ✅ 20 различных методов
- ✅ Файлы разбиты на чанки по 19MB
- ✅ Распределение по разным ботам
- ✅ Ключи шифруются мастер-ключом

---

## 📁 Структура

```
telega/
├── .env                    # Конфиг (уже настроен!)
├── package.json            # Скрипт "npm run go"
├── apps/
│   ├── server/             # Сервер (TypeScript)
│   │   ├── src/
│   │   └── storage.js      # Хранилище Telegram/Discord
│   └── web/                # Фронтенд (React)
│       └── src/
└── БЫСТРЫЙ_СТАРТ.md        # Инструкция
```

---

## 🆘 Проблемы?

### Redis
```bash
docker run -d -p 6379:6379 redis:latest
```

### База данных
```bash
npm run db:setup
```

---

**Автор:** haker_one  
**Версия:** 2.0.0  
**Лицензия:** MIT

---

## ✅ Запомни:

```bash
npm run go
```

**Это всё, что нужно!** 🚀
