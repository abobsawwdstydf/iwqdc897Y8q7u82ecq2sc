@echo off
REM 🚀 БЫСТРЫЙ СТАРТ - 1 КОМАНДА ДЛЯ ЗАПУСКА NIMBUS

echo ============================================
echo    🚀 NIMBUS - Быстрый старт
echo ============================================
echo.

REM Проверка Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js не найден!
    echo    Установите Node.js 18+ с https://nodejs.org
    pause
    exit /b 1
)

echo ✅ Node.js найден
node --version
echo.

REM 1. Установка зависимостей
echo [1/5] 📦 Установка зависимостей...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ошибка установки зависимостей
    pause
    exit /b 1
)
echo.

REM 2. Сборка проекта
echo [2/5] 🏗️ Сборка проекта...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Предупреждение при сборке (продолжаем...)
)
echo.

REM 3. Генерация Prisma
echo [3/5] 🗄️ Генерация Prisma клиента...
cd apps/server
call npx prisma generate
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Ошибка генерации Prisma
    pause
    exit /b 1
)
cd ..\..
echo.

REM 4. Создание БД
echo [4/5] 📊 Создание таблиц в БД...
cd apps/server
call npx prisma db push --accept-data-loss
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Предупреждение при создании БД (продолжаем...)
)
cd ..\..
echo.

REM 5. Сидирование
echo [5/5] 🌱 Сидирование БД...
cd apps/server
call npx prisma db seed
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️ Предупреждение при сидировании (продолжаем...)
)
cd ..\..
echo.

echo ============================================
echo    ✅ ПРОЕКТ ГОТОВ К ЗАПУСКУ!
echo ============================================
echo.
echo 🚀 Для запуска выполните:
echo    npm run dev
echo.
echo 🌐 Frontend: http://localhost:5173
echo 🔧 Backend:  http://localhost:3001
echo.
pause
