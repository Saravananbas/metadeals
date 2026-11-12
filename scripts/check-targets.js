const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
    orderBy: { name: 'asc' }
  });
  console.log('Total categories in PG:', cats.length);
  const targets = ['Fashion (Men)', 'Fashion (Women)', 'Mobile & Tablets', 'Mobile & Computers', 'Mobiles & Computers', 'Wallet'];
  
  for (const t of targets) {
    const matches = cats.filter(c => c.name.toLowerCase() === t.toLowerCase() || c.slug.toLowerCase() === t.toLowerCase().replace(/[^a-z0-9]/g, '-'));
    console.log(`Target: "${t}" -> found:`, matches);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());

