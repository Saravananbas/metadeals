const { PrismaClient } = require('./src/generated/prisma/client.js');
const { PrismaPg } = require('@prisma/adapter-pg');
require('dotenv').config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true },
    orderBy: { name: 'asc' },
  });
  console.log('Total categories:', categories.length);
  console.log(JSON.stringify(categories, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

