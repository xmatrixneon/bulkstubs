import { PrismaClient } from '@prisma/client';

// Prisma Client for shared database - use direct URL override
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

export default prisma;
