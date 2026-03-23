import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Р—Р°РїРѕР»РЅРµРЅРёРµ Р±Р°Р·С‹ РґР°РЅРЅС‹С…...\n');

  const password = await bcrypt.hash('demo123', 10);

  const usersData = [
    { username: 'evgeniy', displayName: 'Р•РІРіРµРЅРёР№', bio: 'РЎРѕР·РґР°С‚РµР»СЊ Nexo' },
    { username: 'anastasia', displayName: 'РђРЅР°СЃС‚Р°СЃРёСЏ', bio: 'Р”РёР·Р°Р№РЅРµСЂ РёРЅС‚РµСЂС„РµР№СЃРѕРІ' },
    { username: 'artem', displayName: 'РђСЂС‚С‘Рј', bio: 'Frontend СЂР°Р·СЂР°Р±РѕС‚С‡РёРє' },
    { username: 'polina', displayName: 'РџРѕР»РёРЅР°', bio: 'Backend СЂР°Р·СЂР°Р±РѕС‚С‡РёРє' },
    { username: 'daniil', displayName: 'Р”Р°РЅРёРёР»', bio: 'DevOps РёРЅР¶РµРЅРµСЂ' },
    { username: 'vladimir', displayName: 'Р’Р»Р°РґРёРјРёСЂ', bio: 'Product Manager' },
  ];

  const users = await Promise.all(
    usersData.map((u) =>
      prisma.user.upsert({
        where: { username: u.username },
        update: { displayName: u.displayName, bio: u.bio },
        create: {
          username: u.username,
          displayName: u.displayName,
          password,
          bio: u.bio,
          isOnline: false,
        },
      })
    )
  );

  console.log(`РЎРѕР·РґР°РЅРѕ ${users.length} РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№`);

  console.log('\n--- РўРµСЃС‚РѕРІС‹Рµ Р°РєРєР°СѓРЅС‚С‹ ---');
  console.log('РџР°СЂРѕР»СЊ РґР»СЏ РІСЃРµС…: demo123\n');
  for (const user of users) {
    console.log(`  ${user.username} (${user.displayName})`);
  }
  console.log('\nР—Р°РїРѕР»РЅРµРЅРёРµ Р·Р°РІРµСЂС€РµРЅРѕ!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
