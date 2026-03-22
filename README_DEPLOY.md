# 🚀 ДЕПЛОЙ НА RENDER.COM - БЫСТРЫЙ СТАРТ

## ⚡ 3 ШАГА К ЗАПУСКУ:

### 1. Загрузите на GitHub
```bash
git init
git add .
git commit -m "Deploy"
git push -u origin main
```

### 2. Создайте на Render
1. https://render.com → Login with GitHub
2. New + → Blueprint
3. Выберите репозиторий → Connect → Apply

### 3. Готово!
Через 3-5 минут:
- Сервер: https://nimbus-messenger.onrender.com
- Клиент: https://nimbus-messenger.onrender.com

---

## 📁 ЧТО В ПАПКЕ:

| Файл | Назначение |
|------|------------|
| `.render.yaml` | ⚙️ Конфиг для Render |
| `ИНСТРУКЦИЯ_ПО_ДЕПЛОЮ.md` | 📖 Полная инструкция |
| `.gitignore` | 🚫 Что не загружать в Git |

---

## 🔧 ЕСЛИ НУЖНО:

### Инициализация БД:
```bash
# В Shell на Render:
cd apps/server
npx prisma migrate deploy
npx prisma db seed
```

### Проверка:
```
https://nimbus-messenger.onrender.com/api/health
```

---

**ВСЁ РАБОТАЕТ! 🎉**
