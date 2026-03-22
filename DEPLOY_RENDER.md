# 📦 Полная инструкция по деплою Nimbus Messenger на Render.com

## 🎯 Два варианта деплоя:

1. **Вместе (Monorepo)** - Сервер и клиент в одном репозитории
2. **Раздельно** - Сервер и клиент на разных сервисах

---

# 📋 ВАРИАНТ 1: ВМЕСТЕ (MONOREPO)

## 📁 Структура проекта:
```
telega/
├── apps/
│   ├── server/     # Бэкенд (Node.js + Express + Socket.IO)
│   └── web/        # Фронтенд (React + Vite)
├── package.json    # Корневой package.json
└── ...
```

## 🚀 Шаг 1: Подготовка репозитория

### 1.1 Создайте репозиторий на GitHub:
```bash
cd C:\Users\haker_one\Desktop\от ютубички нимбус\юэкап субота 11 12\telega
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ВАШ_USERNAME/ВАШ_REPO.git
git push -u origin main
```

### 1.2 Создайте `.render.yaml` в корне проекта:

```yaml
services:
  # Backend service
  - type: web
    name: nimbus-server
    env: node
    region: frankfurt
    plan: free
    branch: main
    rootDir: apps/server
    buildCommand: npm install && npm run build
    startCommand: node dist/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: DATABASE_URL
        fromDatabase:
          name: nimbus-db
          property: connectionString
      - key: CORS_ORIGINS
        value: https://nimbus-web.onrender.com
      - key: ENCRYPTION_KEY
        generateValue: true
      - key: MAX_REGISTRATIONS_PER_IP
        value: "5"

  # Frontend service
  - type: web
    name: nimbus-web
    env: static
    region: frankfurt
    plan: free
    branch: main
    rootDir: apps/web
    buildCommand: npm install && npm run build
    staticPublishPath: ./dist
    envVars:
      - key: VITE_API_URL
        value: https://nimbus-server.onrender.com

databases:
  - name: nimbus-db
    databaseName: nimbus
    user: nimbus
    plan: free
    region: frankfurt
```

## 🚀 Шаг 2: Деплой на Render.com

### 2.1 Зарегистрируйтесь на Render.com:
- Перейдите на https://render.com
- Войдите через GitHub

### 2.2 Создайте новый проект:
1. Нажмите "New +" → "Blueprint"
2. Выберите ваш репозиторий
3. Render автоматически обнаружит `.render.yaml`
4. Нажмите "Apply"

### 2.3 Настройка базы данных:
1. Перейдите в раздел "Databases"
2. Скопируйте connectionString
3. Обновите переменную окружения `DATABASE_URL` в сервисе `nimbus-server`

### 2.4 Инициализация БД:
```bash
# В дашборде Render перейдите в Shell для nimbus-server
npx prisma migrate deploy
npx prisma db seed
```

## 🚀 Шаг 3: Проверка

### 3.1 Проверьте сервер:
```
https://nimbus-server.onrender.com/api/auth/me
```

### 3.2 Проверьте клиент:
```
https://nimbus-web.onrender.com
```

---

# 📋 ВАРИАНТ 2: РАЗДЕЛЬНО

## 🖥️ ЧАСТЬ 1: Деплой сервера (Backend)

### 1.1 Создайте новый Web Service на Render:
1. Dashboard → New + → Web Service
2. Выберите ваш репозиторий
3. Настройте:
   - **Name**: `nimbus-server`
   - **Region**: Frankfurt (или ближайший)
   - **Branch**: `main`
   - **Root Directory**: `apps/server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`

### 1.2 Переменные окружения для сервера:
```
NODE_ENV=production
JWT_SECRET=<сгенерируйте случайную строку 64 символа>
DATABASE_URL=<connectionString от Render PostgreSQL>
CORS_ORIGINS=https://ваш-фронтенд.com
ENCRYPTION_KEY=<сгенерируйте случайную строку 64 символа>
MAX_REGISTRATIONS_PER_IP=5
PORT=3001
```

### 1.3 Создайте базу данных:
1. Dashboard → New + → PostgreSQL
2. Name: `nimbus-db`
3. Database: `nimbus`
4. Скопируйте External Connection String

### 1.4 Инициализация БД:
```bash
# В Shell сервера:
cd apps/server
npx prisma migrate deploy
npx prisma db seed
```

---

## 💻 ЧАСТЬ 2: Деплой клиента (Frontend)

### 2.1 Создайте новый Static Site на Render:
1. Dashboard → New + → Static Site
2. Выберите ваш репозиторий
3. Настройте:
   - **Name**: `nimbus-web`
   - **Region**: Frankfurt (или тот же что у сервера)
   - **Branch**: `main`
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

### 2.2 Переменные окружения для клиента:
```
VITE_API_URL=https://nimbus-server.onrender.com
```

---

# 🔧 ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ

## 📝 Обновление корневого package.json

Убедитесь, что в корневом `package.json` есть:

```json
{
  "name": "nimbus-messenger",
  "private": true,
  "workspaces": [
    "apps/*"
  ],
  "scripts": {
    "dev": "concurrently -k -n server,web \"npm run dev -w apps/server\" \"npm run dev -w apps/web\"",
    "build": "npm run build -w apps/server && npm run build -w apps/web",
    "start": "npm run start -w apps/server",
    "db:push": "npm run db:push -w apps/server",
    "db:seed": "npm run db:seed -w apps/server"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  }
}
```

## 📄 .gitignore (убедитесь что есть):
```
# Dependencies
node_modules/

# Build output
dist/
build/

# Environment
.env
.env.local
.env.production

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Prisma
apps/server/prisma/dev.db
apps/server/prisma/dev.db-journal
```

## 🔐 .env.example для сервера:
```
# Порт сервера
PORT=3001

# JWT секрет (минимум 32 символа)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long

# CORS Origins (разрешённые домены)
CORS_ORIGINS=https://your-frontend.com,http://localhost:5173

# База данных (PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/database

# Ключ шифрования (64 символа hex)
ENCRYPTION_KEY=<64-character-hex-string>

# Максимум регистраций с IP
MAX_REGISTRATIONS_PER_IP=5

# TURN сервер (опционально для звонков)
TURN_URL=turn:your-domain.com:3478
TURN_SECRET=your-turn-secret
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
```

## 🔐 .env.example для клиента:
```
# API URL (адрес сервера)
VITE_API_URL=https://your-server.onrender.com
```

---

# 🔄 CI/CD: Автоматический деплой

## Настройка авто-деплоя:

1. **При пуше в main** - автоматический деплой
2. **При Pull Request** - preview деплой

### В Render.com:
1. Перейдите в настройки сервиса
2. Auto-Deploy: ✅ Enabled
3. Preview Deploy: ✅ Enabled (для PR)

---

# 🛠️ Решение проблем

## ❌ Ошибка: "Build failed"

### Проверьте логи:
```bash
# В дашборде Render → Logs → Build Logs
```

### Частые проблемы:
1. **Неверный rootDir** - убедитесь что путь правильный
2. **Отсутствует package.json** - проверьте структуру
3. **Ошибки TypeScript** - запустите `npm run build` локально

## ❌ Ошибка: "Database connection failed"

### Решение:
1. Проверьте DATABASE_URL
2. Убедитесь что БД создана
3. Запустите миграции:
```bash
npx prisma migrate deploy
```

## ❌ Ошибка: "CORS error"

### Решение:
1. Проверьте CORS_ORIGINS
2. Убедитесь что URL совпадает с фронтендом
3. Добавьте https:// и http:// префиксы

## ❌ Ошибка: "Port already in use"

### Решение:
1. Используйте переменную PORT из Render
2. В `apps/server/src/index.ts`:
```typescript
const port = process.env.PORT || 3001;
```

---

# 📊 Мониторинг

## Логи:
- Dashboard → Сервис → Logs
- Real-time логи
- Фильтры по уровню (error, warn, info)

## Метрики:
- Dashboard → Сервис → Metrics
- CPU usage
- Memory usage
- Request count
- Response time

## Уведомления:
- Dashboard → Settings → Notifications
- Email уведомления
- Slack интеграция
- Discord webhook

---

# 💰 Тарифы Render

## Free план:
- ✅ 750 часов/месяц (один сервис 24/7)
- ✅ 512MB RAM
- ✅ PostgreSQL 1GB
- ❌ Авто-сон через 15 мин без активности

## Pro план ($7/месяц):
- ✅ Без авто-сна
- ✅ 2GB RAM
- ✅ Приоритетная поддержка

## Team план ($20/месяц):
- ✅ Неограниченные участники
- ✅ SSO
- ✅ Приоритетная поддержка

---

# 🎯 Рекомендации

## Для продакшена:

1. **Используйте Pro план** - без авто-сна
2. **Настройте домен** - кастомный домен
3. **Включите HTTPS** - автоматически на Render
4. **Настройте бэкапы** - ежедневно
5. **Мониторинг** - включите уведомления

## Оптимизация:

1. **Кэширование** - используйте Redis
2. **CDN** - для статики
3. **Компрессия** - gzip/brotli
4. **Lazy loading** - для фронтенда

---

# 📞 Поддержка

## Документация Render:
- https://render.com/docs

## Сообщество:
- Discord: https://discord.gg/render
- Forum: https://community.render.com

## Статус сервиса:
- https://status.render.com

---

# ✅ Чек-лист перед деплоем

- [ ] Репозиторий на GitHub
- [ ] `.render.yaml` создан
- [ ] Переменные окружения настроены
- [ ] База данных создана
- [ ] Миграции запущены
- [ ] Тестовый деплой успешен
- [ ] CORS настроен
- [ ] HTTPS работает
- [ ] Логи в порядке
- [ ] Мониторинг включён

---

**🎉 Готово! Ваш Nimbus Messenger развёрнут на Render.com!**
