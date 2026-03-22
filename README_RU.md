# 📘 Nimbus Messenger — Полная документация

## 📖 Оглавление

1. [О проекте](#о-проекте)
2. [Возможности](#возможности)
3. [Установка](#установка)
4. [Настройка](#настройка)
5. [Безопасность](#безопасность)
6. [API](#api)
7. [Частые вопросы](#частые-вопросы)

---

## 🎯 О проекте

**Nimbus** — современный мессенджер с фокусом на приватность и безопасность. Использует передовые технологии шифрования для защиты ваших данных.

### Ключевые особенности:
- ✅ Сквозное шифрование AES-256-GCM + RSA-4096
- ✅ Perfect Forward Secrecy
- ✅ Групповые звонки до 9 участников
- ✅ Каналы с неограниченным количеством подписчиков
- ✅ Файлы до 20 ГБ
- ✅ Офлайн режим
- ✅ Отложенные сообщения (до 7 дней)
- ✅ Кастомизация тем и обоев

---

## 🚀 Возможности

### 💬 Сообщения
- Текстовые сообщения с Markdown
- Голосовые сообщения
- Фото и видео
- Файлы любых типов
- GIF и стикеры
- Реакции на сообщения
- Ответы на сообщения
- Пересылка сообщений
- Закреплённые сообщения
- Удаление у себя и у всех

### 📞 Звонки
- Голосовые звонки HD качества
- Видеозвонки
- Групповые звонки (до 9 участников)
- Демонстрация экрана
- Переключение камер
- Подавление шума
- Звуковые уведомления:
  - `call.mp3` — входящий звонок
  - `call_declined.mp3` — звонок отклонён
  - `user_join.mp3` — пользователь присоединился
  - `user_leave.mp3` — пользователь покинул

### 👥 Группы и каналы
- Группы до 256 участников
- Каналы без ограничений
- Роли: владелец, совладелец, админ, участник
- Настройки приватности
- Аватары (до 100 фото)

### 🔒 Безопасность
- AES-256-GCM шифрование
- RSA-4096 обмен ключами
- PBKDF2 (100,000 итераций)
- HMAC аутентификация
- Защищённое хранилище ключей

---

## 📦 Установка

### Требования
- Node.js 18+
- PostgreSQL 14+
- npm или yarn

### 1. Клонирование
```bash
git clone <repository-url>
cd telega
```

### 2. Установка зависимостей
```bash
npm install
```

### 3. Настройка .env
```env
# Порт сервера
PORT=3001

# JWT секрет
JWT_SECRET=your-super-secret-jwt-key-here

# CORS Origins
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# База данных
DATABASE_URL="postgresql://user:password@localhost:5432/nimbus"

# Ключ шифрования (64 символа hex)
ENCRYPTION_KEY=<generate-with-node-crypto-randomBytes(32).toString('hex')>

# Максимум регистраций с IP
MAX_REGISTRATIONS_PER_IP=5

# TURN сервер (опционально)
TURN_URL=turn:your-domain.com:3478
TURN_SECRET=your-turn-secret
STUN_URLS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
```

### 4. Инициализация БД
```bash
npm run db:push
npm run db:seed
```

### 5. Запуск
```bash
npm run dev
```

### 6. Сборка для продакшена
```bash
npm run build
npm start
```

---

## ⚙️ Настройка

### Сервер отдельно от фронтенда

#### 1. Сервер (.env)
```env
PORT=3001
CORS_ORIGINS=https://your-frontend.com
```

#### 2. Фронтенд (.env)
```env
VITE_API_URL=https://your-backend-server.com
```

#### 3. Запуск
```bash
# Сервер
cd apps/server
npm run build
npm start

# Фронтенд (отдельно)
cd apps/web
npm run build
# Загрузить dist/ на хостинг
```

---

## 🔐 Безопасность

### Шифрование сообщений

Каждое сообщение шифруется в несколько слоёв:

1. **Слой 1**: AES-256-GCM
   - Ключ генерируется для каждой сессии
   - Уникальный IV для каждого сообщения

2. **Слой 2**: RSA-4096
   - Обмен симметричными ключами
   - Perfect Forward Secrecy

3. **Слой 3**: HMAC-SHA384
   - Аутентификация сообщений
   - Защита от подделки

### Хранение ключей

- Ключи хранятся в IndexedDB
- Зашифрованы паролем пользователя
- PBKDF2 с 100,000 итераций
- Соль 256 бит

### Рекомендации по безопасности

1. Используйте сложные пароли (12+ символов)
2. Включите двухфакторную аутентификацию
3. Регулярно обновляйте ключи сессии
4. Не передавайте ключи шифрования

---

## 🌐 API

### Авторизация

#### Регистрация
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "user123",
  "displayName": "User Name",
  "password": "securepassword123",
  "bio": "About me"
}
```

#### Вход
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "user123",
  "password": "securepassword123"
}
```

### Чаты

#### Получить все чаты
```http
GET /api/chats
Authorization: Bearer <token>
```

#### Создать канал
```http
POST /api/chats/channel
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Channel",
  "username": "mychannel",
  "description": "Channel description"
}
```

### Сообщения

#### Отправить сообщение
```javascript
socket.emit('send_message', {
  chatId: 1,
  content: 'Hello!',
  type: 'text'
});
```

#### Получить сообщения
```http
GET /api/messages/chat/:chatId
Authorization: Bearer <token>
```

---

## ❓ Частые вопросы

### Как восстановить доступ?
Используйте функцию сброса пароля через email.

### Где хранятся сообщения?
Все сообщения зашифрованы и хранятся на сервере.

### Можно ли использовать без интернета?
Да, доступен офлайн режим. Сообщения отправятся при подключении.

### Как удалить аккаунт?
Напишите в поддержку или используйте функцию удаления в настройках.

### Безопасно ли это?
Да, используется шифрование военного уровня.

---

## 📞 Поддержка

- Email: support@nimbus.local
- Telegram: @nimbus_support
- GitHub Issues: [ссылка]

---

## 📄 Лицензия

MIT License — см. файл LICENSE

---

**© 2026 Nimbus Messenger. Все права защищены.**
