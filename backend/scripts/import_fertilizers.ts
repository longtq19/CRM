import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/root/CRM/Các sản phẩm phân bón sinh học.xlsx');
  const worksheet = workbook.worksheets[0];
  if (!worksheet) { console.error('No worksheet found'); process.exit(1); }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cell.value != null ? String(cell.value).trim() : '';
  });

  const data: any[] = [];
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const obj: any = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (key) { obj[key] = cell.value; if (cell.value != null && cell.value !== '') hasValue = true; }
    });
    if (hasValue) data.push(obj);
  }

  console.log(`Found ${data.length} products to import...`);

  for (const row of data as any[]) {
    try {
      const code = row['product_code'];
      const name = row['display_name'];
      const vatName = row['vat_invoice_name'];
      const unit = row['packaging_spec'];
      const description = row['packaging_spec_1'];
      const weight = parseFloat(row['weight_kg']);

      if (!code || !name) {
        console.warn('Skipping row due to missing code or name:', row);
        continue;
      }

      // Check if product exists
      const existingProduct = await prisma.product.findUnique({
        where: { code },
      });

      if (existingProduct) {
        console.log(`Product ${code} already exists. Updating...`);
        const product = await prisma.product.update({
          where: { code },
          data: {
            name,
            vatName,
            unit: unit || 'Cái',
            description,
          },
        });
        
        await prisma.productBio.upsert({
            where: { productId: product.id },
            create: {
                productId: product.id,
                weight: isNaN(weight) ? null : weight,
                packType: unit
            },
            update: {
                weight: isNaN(weight) ? null : weight,
                packType: unit
            }
        });

      } else {
        console.log(`Creating new product ${code}...`);
        const product = await prisma.product.create({
          data: {
            code,
            name,
            vatName,
            unit: unit || 'Cái',
            description,
            listPriceNet: 0, // Default 0
            minSellPriceNet: 0, // Default 0
            vatRate: 0, // Default 0
            status: 'ACTIVE',
          },
        });
        
         // Create Bio details
        await prisma.productBio.create({
            data: {
                productId: product.id,
                weight: isNaN(weight) ? null : weight,
                packType: unit
            }
        });
      }
    } catch (error) {
      console.error(`Error processing product ${row['product_code']}:`, error);
    }
  }

  console.log('Import completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
