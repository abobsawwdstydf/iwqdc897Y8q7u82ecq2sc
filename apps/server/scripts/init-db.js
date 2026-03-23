/**
 * Автоматическая инициализация базы данных
 * Создаёт таблицы если их нет
 */

require('dotenv').config();
const { execSync } = require('child_process');
const { Client } = require('pg');
const path = require('path');

async function initDB() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL не указан');
    process.exit(1);
  }
  
  const client = new Client({ 
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('neon.tech') || databaseUrl.includes('render.com')
      ? { rejectUnauthorized: false }
      : false
  });
  
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
      
      // Пытаемся запустить prisma db push
      const cwd = path.join(__dirname, '../..');
      
      try {
        execSync(`node node_modules/prisma/build/index.js db push --accept-data-loss`, { 
          stdio: 'inherit',
          cwd: cwd
        });
        console.log('✅ Таблицы созданы');
      } catch (e) {
        console.error('⚠️  Ошибка создания таблиц через node, пробуем npx...');
        try {
          execSync(`npx prisma db push --accept-data-loss`, { 
            stdio: 'inherit',
            cwd: cwd,
            env: { ...process.env, FORCE_COLOR: '1' }
          });
          console.log('✅ Таблицы созданы (через npx)');
        } catch (e2) {
          console.error('❌ Не удалось создать таблицы:', e2.message);
          console.log('⚠️  Продолжаем работу, таблицы будут созданы при первом запросе');
        }
      }
    } else {
      console.log('✅ Таблицы существуют');
    }
    
  } catch (error) {
    console.error('❌ Ошибка подключения:', error.message);
  } finally {
    await client.end();
  }
}

initDB();
