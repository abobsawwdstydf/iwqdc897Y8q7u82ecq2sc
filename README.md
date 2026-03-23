# 🚀 Nimbus Messenger

Мессенджер с распределённым хранилищем файлов (Telegram + Discord).

---

## ⚡ Быстрый старт

### 1. Установка
```bash
npm install
```

### 2. Настройка
Отредактируй `.env`:
```env
DATABASE_URL=postgresql://...
JWT_SECRET=твой_секрет
```

### 3. Запуск
```bash
npm run dev
```

---

## 🌐 Деплой на Render

1. Создай PostgreSQL на Render
2. Скопируй `.env.render` в `.env`
3. Вставь свой `DATABASE_URL`
4. Push на GitHub
5. Deploy на Render

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
node apps/server/dist/index.js
```

---

## 🛡️ Админ-панель

**URL:** `/aaddmmiinnppaanneell`  
**Пароль:** `qwertyuiopasd`

---

## 📦 Файлы

- **Лимит:** 50GB (сервер), 20GB (пользователи)
- **Хранение:** Telegram + Discord каналы
- **Шифрование:** AES-256-GCM + 20 методов

---

## 🔧 API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/health` | Проверка сервера |
| POST | `/api/storage/upload` | Загрузить файл |
| GET | `/api/storage/download/:id` | Скачать файл |

---

**Лицензия:** MIT  
**Автор:** Nimbus Team
