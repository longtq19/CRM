import { prisma } from '../src/config/database';

async function main() {
  console.log('--- Raw Schema Debug ---');
  
  try {
    const tables: any = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    console.log('Tables in public schema:', tables.map((t: any) => t.table_name).join(', '));
  } catch (e: any) {
    console.error('❌ Query public tables ERROR:', e.message);
  }

  try {
    const columns: any = await prisma.$queryRaw`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'employees'`;
    console.log('Columns in employees:', columns.map((c: any) => `${c.column_name}(${c.data_type})`).join(', '));
  } catch (e: any) {
    console.error('❌ Query employees columns ERROR:', e.message);
  }

  try {
    const res: any = await prisma.$queryRaw`SELECT 1 as result FROM lead_processing_statuses LIMIT 1`;
    console.log('✅ lead_processing_statuses table exists and is readable.');
  } catch (e: any) {
    console.error('❌ lead_processing_statuses table NOT FOUND or ERROR:', e.message);
  }

  console.log('--- End of Debug ---');
}

main().catch(console.error).finally(() => prisma.$disconnect());
