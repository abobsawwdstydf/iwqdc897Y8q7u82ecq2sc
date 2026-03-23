/**
 * РџРѕР»РЅР°СЏ РѕС‡РёСЃС‚РєР° Р±Р°Р·С‹ РґР°РЅРЅС‹С… РѕС‚ С‚РµСЃС‚РѕРІС‹С… РґР°РЅРЅС‹С….
 * РЈРґР°Р»СЏРµС‚ Р’РЎР•: РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№, С‡Р°С‚С‹, СЃРѕРѕР±С‰РµРЅРёСЏ, РёСЃС‚РѕСЂРёРё, РґСЂСѓР¶Р±С‹.
 * РўР°Р±Р»РёС†С‹ Рё СЃС…РµРјР° РѕСЃС‚Р°СЋС‚СЃСЏ РЅР° РјРµСЃС‚Рµ.
 *
 * Р—Р°РїСѓСЃРє: npx tsx prisma/clean-db.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function cleanDatabase() {
  console.log('вљ пёЏ  Р’РќРРњРђРќРР•: РџРѕР»РЅР°СЏ РѕС‡РёСЃС‚РєР° Р±Р°Р·С‹ РґР°РЅРЅС‹С…!\n');

  // РЈРґР°Р»СЏРµРј РІ РїСЂР°РІРёР»СЊРЅРѕРј РїРѕСЂСЏРґРєРµ (Р·Р°РІРёСЃРёРјРѕСЃС‚Рё в†’ СЂРѕРґРёС‚РµР»Рё)
  const counts: Record<string, number> = {};

  // 1. Р—Р°РІРёСЃРёРјС‹Рµ С‚Р°Р±Р»РёС†С‹
  const r1 = await prisma.hiddenMessage.deleteMany();
  counts['HiddenMessage'] = r1.count;

  const r2 = await prisma.readReceipt.deleteMany();
  counts['ReadReceipt'] = r2.count;

  const r3 = await prisma.reaction.deleteMany();
  counts['Reaction'] = r3.count;

  const r4 = await prisma.pinnedMessage.deleteMany();
  counts['PinnedMessage'] = r4.count;

  const r5 = await prisma.media.deleteMany();
  counts['Media'] = r5.count;

  const r6 = await prisma.storyView.deleteMany();
  counts['StoryView'] = r6.count;

  const r7 = await prisma.story.deleteMany();
  counts['Story'] = r7.count;

  // 2. РЎРѕРѕР±С‰РµРЅРёСЏ
  const r8 = await prisma.message.deleteMany();
  counts['Message'] = r8.count;

  // 3. Р§Р°С‚С‹
  const r9 = await prisma.chatMember.deleteMany();
  counts['ChatMember'] = r9.count;

  const r10 = await prisma.chat.deleteMany();
  counts['Chat'] = r10.count;

  // 4. Р”СЂСѓР¶Р±С‹
  const r11 = await prisma.friendship.deleteMany();
  counts['Friendship'] = r11.count;

  // 5. РџРѕР»СЊР·РѕРІР°С‚РµР»Рё
  const r12 = await prisma.user.deleteMany();
  counts['User'] = r12.count;

  // 6. Р§РёСЃС‚РєР° РїР°РїРєРё uploads (РєСЂРѕРјРµ avatars/.gitkeep)
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  let filesDeleted = 0;

  if (fs.existsSync(uploadsDir)) {
    const entries = fs.readdirSync(uploadsDir);
    for (const entry of entries) {
      const fullPath = path.join(uploadsDir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Р”Р»СЏ РїР°РїРєРё avatars вЂ” РѕС‡РёСЃС‚РёС‚СЊ СЃРѕРґРµСЂР¶РёРјРѕРµ, РЅРѕ РѕСЃС‚Р°РІРёС‚СЊ РїР°РїРєСѓ
        if (entry === 'avatars') {
          const avatarFiles = fs.readdirSync(fullPath);
          for (const f of avatarFiles) {
            if (f === '.gitkeep') continue;
            fs.unlinkSync(path.join(fullPath, f));
            filesDeleted++;
          }
        }
      } else {
        // Р¤Р°Р№Р»С‹ РІ РєРѕСЂРЅРµ uploads
        if (entry !== '.gitkeep') {
          fs.unlinkSync(fullPath);
          filesDeleted++;
        }
      }
    }
  }

  // Р’С‹РІРѕРґ СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ
  console.log('в”Њв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”ђ');
  console.log('в”‚     рџ§№ Р‘Р°Р·Р° РґР°РЅРЅС‹С… РѕС‡РёС‰РµРЅР°!          в”‚');
  console.log('в”њв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”¤');
  for (const [table, count] of Object.entries(counts)) {
    if (count > 0) {
      console.log(`в”‚  ${table.padEnd(20)} ${String(count).padStart(6)} СѓРґР°Р»РµРЅРѕ  в”‚`);
    }
  }
  if (filesDeleted > 0) {
    console.log(`в”‚  ${'Р¤Р°Р№Р»С‹ (uploads)'.padEnd(20)} ${String(filesDeleted).padStart(6)} СѓРґР°Р»РµРЅРѕ  в”‚`);
  }
  console.log('в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”');
  console.log('\nвњ… Р“РѕС‚РѕРІРѕ. Р‘Р” С‡РёСЃС‚Р°СЏ, РјРѕР¶РЅРѕ РЅР°С‡РёРЅР°С‚СЊ СЃ РЅСѓР»СЏ.');
}

cleanDatabase()
  .catch((e) => {
    console.error('вќЊ РћС€РёР±РєР° РѕС‡РёСЃС‚РєРё:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
