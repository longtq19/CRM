import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Bắt đầu map dữ liệu khối lượng (weight) từ product_bios sang products...');

  // Lấy tất cả các product_bios có khối lượng > 0
  const bios = await prisma.productBio.findMany({
    where: {
      weight: {
        gt: 0,
      },
    },
    select: {
      productId: true,
      weight: true,
    },
  });

  console.log(`Tìm thấy ${bios.length} bản ghi product_bios có khối lượng.`);

  let updatedCount = 0;
  for (const bio of bios) {
    if (bio.weight != null) {
      await prisma.product.update({
        where: { id: bio.productId },
        data: { weight: bio.weight },
      });
      updatedCount++;
    }
  }

  console.log(`Hoàn tất! Đã cập nhật khối lượng cho ${updatedCount} sản phẩm.`);
}

main()
  .catch((e) => {
    console.error('Lỗi khi chạy script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
