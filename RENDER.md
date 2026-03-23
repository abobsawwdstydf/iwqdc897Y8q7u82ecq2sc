# 🚀 ПОЛНАЯ НАСТРОЙКА RENDER.COM

## 📋 Шаг 1: Регистрация на Render

1. Зайди на https://render.com
2. Нажми **Sign Up**
3. Войди через GitHub (рекомендуется) или email
4. Подтверди email

---

## 🗄️ Шаг 2: Создание базы данных (PostgreSQL)

1. **New +** → **PostgreSQL**
2. Заполни:
   ```
   Name: nexo-database
   Region: Frankfurt, Germany (ближе к РФ)
   Database Size: Free (0.1 GB)
   ```
3. Нажми **Create Database**
4. После создания:
   - Прокрути вниз до **Connections**
   - Скопируй **External Database URL**
   - Пример: `postgresql://user:password@host:5432/dbname?sslmode=require`

**⚠️ ВАЖНО:** Сохрани этот URL!

---

## 🌐 Шаг 3: Создание Web Service

1. **New +** → **Web Service**
2. **Connect a repository**
3. Выбери свой репозиторий: `abobsawwdstydf/iwqdc897Y8q7u82ecq2sc`
4. Нажми **Connect repository**

---

## ⚙️ Шаг 4: Настройка Web Service

Заполни все поля:

### Basic Settings
```
Name: nexo-messenger
Region: Frankfurt, Germany
Branch: main
Root Directory: (оставь пустым)
Runtime: Node
```

### Build & Start Commands
```
Build Command: npm install && npm run build

Start Command: npm run prod
```

### Instance Type
```
Type: Free
```

**⚠️ Free тариф засыпает через 15 мин без активности!**
Для продакшена лучше **Starter ($7/мес)**

---

## 🔐 Шаг 5: Environment Variables (САМОЕ ВАЖНОЕ!)

Прокрути вниз до **Environment** и добавь ВСЕ переменные:

### 1. Основные
```
NODE_ENV=production
PORT=3001
```

### 2. База данных (вставь свой URL из Шага 2)
```
DATABASE_URL=postgresql://neondb_owner:npg_DOzU4jR8arce@ep-wandering-dawn-an3qfdn4-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### 3. Шифрование
```
JWT_SECRET=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
ENCRYPTION_KEY=36427af4278b7198dc850c7235c4c85feda7275d89fe3d360c79a1af94579765
MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
DB_ENCRYPTION_ENABLED=true
```

### 4. CORS
```
CORS_ORIGINS=*
```

### 5. Telegram (уже готово)
```
TELEGRAM_BOT_TOKENS=8758209438:AAEnaXcJ7ke88fjjHNPwQVTt_u9LYrSzPFk,8748554768:AAEnJcHklmilbjih9glo3GITnQXSx4YmM_8,8554202189:AAGN0wLfcgkqK3KJ9XOJFl40rp2kjkIcm1Y,8744960493:AAHB5bn3VxlZWKJjCr70yLYJnVTyXp2zHIs,8687986079:AAGPYjnq4gdXCkf2wT81f0l2tQalKCIIyds,8141008503:AAEaCM1RrN2ppbZmUzhpW4EeLUgT1qQ2QS0,8758985233:AAF7QfRApnccaByBYa1qjGs7u-erQ47OZcQ,8733182475:AAFBitv4g4LVRuvGnssyqHQpttBydeAda9Y,8774720953:AAGvExABKj4Z-DYfKdqF-OMEdoeySeOeOoY,8674460757:AAFm7WVkDx4ISkx22toTQyrQUeGQfLdF8QM

TELEGRAM_CHANNEL_IDS=-1003850596987,-1003878106202,-1003738083520,-1003868880877
```

### 6. Discord (уже готово)
```
DISCORD_WEBHOOK_URLS=https://discord.com/api/webhooks/1485562630663049298/N2zoK3IJrfFEEuzQldGF835RHUkb3qBS7WFHDknhJ6ZsmoZfF8tLtl_GyHxfMgcjbYbs,https://discord.com/api/webhooks/1485563746725265418/2mDS_yV88cn3rzPifyLmLdSVJxm3mkC-CdkvCBUv-lFU_NCbGP9hQ5ajjiUFoGGxDZQ7
```

### 7. Админка
```
ADMIN_TOKEN=qwertyuiopasd
```

### 8. Файлы
```
MAX_FILE_SIZE=53687091200
CHUNK_SIZE=19922944
```

### 9. Redis (опционально, для очереди)
```
REDIS_URL=redis://localhost:6379
```

---

## 🎯 Шаг 6: Создание Redis (опционально)

**Для работы очереди отправки файлов:**

1. **New +** → **Redis**
2. Заполни:
   ```
   Name: nexo-redis
   Region: Frankfurt, Germany
   Plan: Free
   ```
3. После создания скопируй **Redis URL**
4. Добавь в Environment Variables:
   ```
   REDIS_URL=redis://...
   ```

---

## ✅ Шаг 7: Проверка и запуск

1. Прокрути вниз и нажми **Create Web Service**
2. Начнётся деплой (2-5 минут)
3. Следи за логами во вкладке **Logs**
4. После успеха увидишь:
   ```
   ✅ Основная база данных подключена
   ✅ Таблицы уже существуют
   ✅ База данных готова к работе
   🚀 Nexo Storage Server
   ```

---

## 🌐 Шаг 8: Проверка работы

### 1. Открой приложение
- Скопируй URL из верхней панели (например: `https://nexo-messenger.onrender.com`)
- Открой в браузере

### 2. Проверь API
```
https://nexo-messenger.onrender.com/api/health
```
Должно вернуться: `{"status":"ok"}`

### 3. Проверь хранилище
```
https://nexo-messenger.onrender.com/health
```
Должно вернуться:
```json
{
  "status": "ok",
  "resources": {
    "telegram_bots": 10,
    "telegram_channels": 4,
    "discord_webhooks": 2
  }
}
```

---

## 🔄 Шаг 9: Авто-деплой

Теперь при каждом `git push`:
1. Render автоматически соберёт проект
2. Перезапустит сервер
3. Данные в базе **СОХРАНЯЮТСЯ** ✅

---

## ⚠️ Важные замечания

### Free тариф Render:
- ⚠️ Засыпает через 15 мин без активности
- ⚠️ Первый запрос после простоя = 30-50 сек
- ✅ Для тестов — отлично
- ❌ Для продакшена — купи Starter ($7/мес)

### База данных Neon:
- ✅ Бесплатно 0.5 GB
- ✅ Не засыпает
- ✅ SSL подключение
- ✅ Автоматический бэкап

### Redis:
- ✅ Free тариф на Render
- ✅ Нужен для очереди файлов
- ❌ Без Redis файлы будут отправляться медленнее

---

## 🛠️ Troubleshooting

### Ошибка "DATABASE_URL не указан"
- Проверь, что переменная добавлена в Environment
- Убедись, что нет опечаток
- Перезапусти сервис (Manual Deploy)

### Ошибка "No resources available"
- Проверь TELEGRAM_BOT_TOKENS
- Проверь TELEGRAM_CHANNEL_IDS
- Убедись, что боты — админы каналов

### Ошибка Redis
- Добавь REDIS_URL или отключи Redis в коде
- Или создай Redis на Render

### Долгая загрузка после простоя
- Это нормально для Free тарифа
- Купи Starter ($7/мес) для мгновенного запуска

---

## 📊 Итоговая конфигурация

| Компонент | Настройка |
|-----------|-----------|
| **Name** | nexo-messenger |
| **Region** | Frankfurt |
| **Branch** | main |
| **Build** | `npm install && npm run build` |
| **Start** | `npm run prod` |
| **Instance** | Free (или Starter $7/мес) |

---

## ✅ Чек-лист

- [ ] Создал PostgreSQL (или Neon)
- [ ] Создал Web Service
- [ ] Подключил репозиторий
- [ ] Настроил Build/Start команды
- [ ] Добавил ВСЕ Environment Variables
- [ ] Создал Redis (опционально)
- [ ] Проверил /api/health
- [ ] Проверил хранилище /health
- [ ] Протестировал загрузку файлов

**ВСЁ ГОТОВО!** 🎉

---

## 📞 Поддержка

Вопросы → @haker_one в Telegram
