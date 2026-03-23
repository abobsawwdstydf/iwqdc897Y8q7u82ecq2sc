/**
 * Encrypt existing unencrypted files in the uploads directory.
 *
 * Run once after enabling ENCRYPTION_KEY:
 *   npx ts-node prisma/encrypt-existing-files.ts
 *
 * Safe to re-run вЂ” skips already-encrypted files (decryption test).
 */
import '../src/config'; // loads .env & initialises encryption
import path from 'path';
import fs from 'fs';
import { isEncryptionEnabled, encryptFileInPlace, decryptFileToBuffer } from '../src/encrypt';

const UPLOADS_ROOT = path.join(__dirname, '../uploads');

function walkDir(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function main() {
  if (!isEncryptionEnabled()) {
    console.error('вќЊ ENCRYPTION_KEY РЅРµ Р·Р°РґР°РЅ РІ .env вЂ” СЃРЅР°С‡Р°Р»Р° СѓРєР°Р¶РёС‚Рµ РєР»СЋС‡ С€РёС„СЂРѕРІР°РЅРёСЏ.');
    process.exit(1);
  }

  console.log('рџ”’ РќР°С‡Р°Р»Рѕ С€РёС„СЂРѕРІР°РЅРёСЏ С„Р°Р№Р»РѕРІ РІ uploads/вЂ¦\n');

  const allFiles = walkDir(UPLOADS_ROOT);
  console.log(`рџ“Ѓ РќР°Р№РґРµРЅРѕ ${allFiles.length} С„Р°Р№Р»РѕРІ`);

  let encrypted = 0;
  let skipped = 0;

  for (const filePath of allFiles) {
    const relPath = path.relative(UPLOADS_ROOT, filePath);
    try {
      // Try to decrypt вЂ” if it works, file is already encrypted
      const decrypted = decryptFileToBuffer(filePath);
      if (decrypted !== null) {
        skipped++;
        continue;
      }

      // File is not encrypted вЂ” encrypt it
      encryptFileInPlace(filePath);
      encrypted++;
      process.stdout.write(`  вњ” ${encrypted} Р·Р°С€РёС„СЂРѕРІР°РЅРѕ, ${skipped} РїСЂРѕРїСѓС‰РµРЅРѕ\r`);
    } catch (e) {
      console.error(`\n  вќЊ РћС€РёР±РєР° СЃ С„Р°Р№Р»РѕРј ${relPath}:`, e);
    }
  }

  console.log(`\n\nвњ… Р“РѕС‚РѕРІРѕ! Р—Р°С€РёС„СЂРѕРІР°РЅРѕ ${encrypted} С„Р°Р№Р»РѕРІ, РїСЂРѕРїСѓС‰РµРЅРѕ ${skipped} (СѓР¶Рµ Р·Р°С€РёС„СЂРѕРІР°РЅС‹).`);
}

main().catch((e) => {
  console.error('РћС€РёР±РєР°:', e);
  process.exit(1);
});
