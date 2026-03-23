/**
 * Автоматическая инициализация базы данных
 * Создаёт таблицы если их нет
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { Client } = require('pg');

async function initDB() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL не указан');
    process.exit(1);
  }
  
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    console.log('✅ Подключение к базе данных');
    
    // Проверяем наличие таблиц
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'User'
      );
    `);
    
    const tableExists = result.rows[0]?.exists ?? false;
    
    if (!tableExists) {
      console.log('📝 Таблицы не найдены, создаём...');
      execSync('npx prisma db push', { 
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log('✅ Таблицы созданы');
    } else {
      console.log('✅ Таблицы существуют');
    }
    
    // Генерируем Prisma Client
    console.log('🔧 Генерация Prisma Client...');
    execSync('npx prisma generate', {
      stdio: 'inherit',
      cwd: __dirname
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDB();
