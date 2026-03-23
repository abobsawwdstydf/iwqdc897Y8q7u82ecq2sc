/**
 * Безопасная инициализация базы данных
 * - Создаёт таблицы если их нет
 * - НЕ удаляет данные
 * - Проверяет подключение
 * - Поддержка нескольких баз
 */

require('dotenv').config();
const { dbManager } = require('../lib/db-manager');

async function main() {
    console.log('🔍 Инициализация баз данных...');
    
    try {
        // Инициализация всех баз
        await dbManager.initialize();
        
        const primary = dbManager.getPrimary();
        
        // Проверяем, существует ли таблица users
        const result = await primary.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'User'
            );
        `);
        
        const tableExists = result.rows[0].exists;
        
        if (tableExists) {
            console.log('✅ Таблицы уже существуют, пропускаем создание');
            console.log('📊 Данные сохранены');
        } else {
            console.log('📝 Таблицы не найдены, создаём...');
            console.log('⚠️  Это первый запуск, данных нет');
            
            // Запускаем Prisma для создания таблиц
            const { execSync } = require('child_process');
            execSync('npx prisma db push', {
                stdio: 'inherit',
                cwd: __dirname
            });
            
            console.log('✅ Таблицы созданы');
        }
        
        // Генерируем Prisma Client
        console.log('🔧 Генерация Prisma Client...');
        const { execSync } = require('child_process');
        execSync('npx prisma generate', {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        console.log('✅ База данных готова к работе');
        
        // Закрываем подключения
        await dbManager.close();
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        await dbManager.close().catch(() => {});
        process.exit(1);
    }
}

main();
