# 🚀 Nexo Messenger

**Современный мессенджер с хранением файлов в Telegram/Discord**

---

## ⚡ ОДНА КОМАНДА ДЛЯ ВСЕГО!

### Локально:
```bash
npm run go
```

### На Render:
**Start Command:**
```bash
npm run go
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

- ✅ **Telegram**: 10 ботов, 4 канала
- ✅ **Discord**: 2 вебхука
- ✅ **База данных**: PostgreSQL от Render
- ✅ **Ключи шифрования**: сгенерированы

**Менять ничего не нужно!**

---

## 📊 Команды

| Команда | Описание |
|---------|----------|
| `npm run go` | **ЗАПУСТИТЬ ВСЁ** (install + build + setup + dev) |
| `npm run dev` | Запуск разработки |
| `npm run build` | Сборка |
| `npm run db:setup` | Настройка БД |

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
Start Command: npm run go
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
