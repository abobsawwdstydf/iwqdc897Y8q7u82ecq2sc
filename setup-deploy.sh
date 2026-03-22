#!/bin/bash
# 🚀 Полный скрипт настройки и деплоя Nimbus на Render

echo "🔧 Настройка проекта Nimbus..."

# 1. Установка зависимостей
echo "📦 Установка зависимостей..."
npm install

# 2. Сборка проекта
echo "🏗️ Сборка проекта..."
npm run build

# 3. Генерация Prisma клиента
echo "🗄️ Генерация Prisma клиента..."
cd apps/server
npx prisma generate

# 4. Пуш схемы в БД (создание таблиц)
echo "📊 Создание таблиц в БД..."
npx prisma db push --force-reset --accept-data-loss

# 5. Сидирование (начальные данные)
echo "🌱 Сидирование БД..."
npx prisma db seed

cd ../..

echo "✅ Проект готов к запуску!"
echo ""
echo "🚀 Запуск сервера: npm run dev"
echo "🌐 Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:3001"
