/**
 * Безопасная инициализация базы данных
 * - Создаёт таблицы если их нет
 * - НЕ удаляет данные
 * - Проверяет подключение
 */

const { execSync } = require('child_process');
const { Client } = require('pg');

async function main() {
    console.log('🔍 Проверка подключения к базе данных...');
    
    // Получаем DATABASE_URL из .env
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL не указан в .env');
        process.exit(1);
    }
    
    const client = new Client({ connectionString: databaseUrl });
    
    try {
        await client.connect();
        console.log('✅ Подключение к базе данных успешно');
        
        // Проверяем, существует ли таблица users
        const result = await client.query(`
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
            execSync('npx prisma db push', {
                stdio: 'inherit',
                cwd: __dirname
            });
            
            console.log('✅ Таблицы созданы');
        }
        
        // Генерируем Prisma Client
        console.log('🔧 Генерация Prisma Client...');
        execSync('npx prisma generate', {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        console.log('✅ База данных готова к работе');
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
