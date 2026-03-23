/**
 * Migrate existing plain-text messages to encrypted form.
 *
 * Run once after enabling ENCRYPTION_KEY:
 *   npx ts-node prisma/encrypt-existing.ts
 *
 * Safe to re-run вЂ” skips already-encrypted messages ("enc:v1:" prefix).
 */
import '../src/config'; // loads .env & initialises encryption
import { PrismaClient } from '@prisma/client';
import { encryptText, isEncryptionEnabled } from '../src/encrypt';

// Use raw PrismaClient to bypass the encryption middleware (avoid double-encryption)
const rawPrisma = new PrismaClient();

async function main() {
  if (!isEncryptionEnabled()) {
    console.error('вќЊ ENCRYPTION_KEY РЅРµ Р·Р°РґР°РЅ РІ .env вЂ” СЃРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ РєР»СЋС‡ С€РёС„СЂРѕРІР°РЅРёСЏ.');
    process.exit(1);
  }

  console.log('рџ”’ РќР°С‡Р°Р»Рѕ С€РёС„СЂРѕРІР°РЅРёСЏ СЃСѓС‰РµСЃС‚РІСѓСЋС‰РёС… СЃРѕРѕР±С‰РµРЅРёР№вЂ¦\n');

  // We bypass the Prisma middleware by using $queryRawUnsafe for the SELECT,
  // then use raw UPDATE to avoid double-encryption via middleware.
  const messages: Array<{ id: string; content: string | null; quote: string | null }> =
    await rawPrisma.$queryRaw`
      SELECT id, content, quote FROM "Message"
      WHERE (content IS NOT NULL AND content != '' AND content NOT LIKE 'enc:v1:%')
         OR (quote IS NOT NULL AND quote != '' AND quote NOT LIKE 'enc:v1:%')
    `;

  console.log(`рџ“ќ РќР°Р№РґРµРЅРѕ ${messages.length} РЅРµР·Р°С€РёС„СЂРѕРІР°РЅРЅС‹С… СЃРѕРѕР±С‰РµРЅРёР№`);

  let encrypted = 0;
  const BATCH_SIZE = 500;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    await rawPrisma.$transaction(
      batch.map((msg) => {
        const newContent = msg.content && !msg.content.startsWith('enc:v1:')
          ? encryptText(msg.content) : null;
        const newQuote = msg.quote && !msg.quote.startsWith('enc:v1:')
          ? encryptText(msg.quote) : null;

        return rawPrisma.$executeRaw`
          UPDATE "Message"
          SET content = COALESCE(${newContent}::text, content),
              quote   = COALESCE(${newQuote}::text, quote)
          WHERE id = ${msg.id}
        `;
      })
    );
    encrypted += batch.length;
    process.stdout.write(`  вњ” ${encrypted}/${messages.length}\r`);
  }

  console.log(`\n\nвњ… Р“РѕС‚РѕРІРѕ! Р—Р°С€РёС„СЂРѕРІР°РЅРѕ ${encrypted} СЃРѕРѕР±С‰РµРЅРёР№.`);
  console.log('вљ   РЎРћРҐР РђРќРРўР• РљР›Р®Р§ ENCRYPTION_KEY Р’ РќРђР”РЃР–РќРћРњ РњР•РЎРўР• вЂ” Р±РµР· РЅРµРіРѕ РґР°РЅРЅС‹Рµ РЅРµ РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊ!');
  await rawPrisma.$disconnect();
}

main().catch((e) => {
  console.error('РћС€РёР±РєР° РјРёРіСЂР°С†РёРё:', e);
  process.exit(1);
});
