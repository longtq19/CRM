/**
 * Xóa toàn bộ khách hàng (customers) và chiến dịch marketing (marketing_campaigns),
 * kèm đơn hàng, kho số, lead, hóa đơn nháp liên quan, v.v.
 *
 * CHẠY SAU KHI ĐÃ BACKUP DB (pg_dump / npm run backup:db trên máy có kết nối DB).
 *
 * Usage:
 *   CONFIRM_PURGE=yes npx ts-node scripts/purge-customers-and-campaigns.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_PURGE !== 'yes') {
    console.error(
      'Từ chối: đặt biến môi trường CONFIRM_PURGE=yes để xác nhận (và backup DB trước).'
    );
    process.exit(1);
  }

  console.log('Bắt đầu xóa dữ liệu khách hàng + chiến dịch...');

  await prisma.$transaction(
    async (tx) => {
      // 1) Lead / cơ hội (tham chiếu customer + campaign)
      const lo = await tx.leadOpportunity.deleteMany();
      console.log(`lead_opportunities: ${lo.count}`);

      const la = await tx.leadAssignment.deleteMany();
      console.log(`lead_assignments: ${la.count}`);

      // 2) Đơn hàng
      const osl = await tx.orderShippingLog.deleteMany();
      console.log(`order_shipping_logs: ${osl.count}`);

      const oi = await tx.orderItem.deleteMany();
      console.log(`order_items: ${oi.count}`);

      const sl = await tx.shippingLog.deleteMany();
      console.log(`shipping_logs: ${sl.count}`);

      const ro = await tx.returnedOrder.deleteMany();
      console.log(`returned_orders: ${ro.count}`);

      const ord = await tx.order.deleteMany();
      console.log(`orders: ${ord.count}`);

      // 3) Phân lead
      const ldh = await tx.leadDistributionHistory.deleteMany();
      console.log(`lead_distribution_history: ${ldh.count}`);

      // 4) Bảo hành (tham chiếu customer)
      const wc = await tx.warrantyClaim.deleteMany();
      console.log(`warranty_claims: ${wc.count}`);

      // 5) Hóa đơn nháp (items cascade)
      const di = await tx.draftInvoice.deleteMany();
      console.log(`draft_invoices: ${di.count}`);

      // 6) Ghi chú nội bộ gắn khách
      const inn = await tx.internalNote.deleteMany({ where: { customerId: { not: null } } });
      console.log(`internal_notes (có customer): ${inn.count}`);

      // 7) Dữ liệu customer phụ thuộc
      const ci = await tx.customerInteraction.deleteMany();
      console.log(`customer_interactions: ${ci.count}`);

      const ca = await tx.customerAggregate.deleteMany();
      console.log(`customer_aggregates: ${ca.count}`);

      const cta = await tx.customerTagAssignment.deleteMany();
      console.log(`customer_tag_assignments: ${cta.count}`);

      const cf = await tx.customerFarm.deleteMany();
      console.log(`customer_farms: ${cf.count}`);

      const cad = await tx.customerAddress.deleteMany();
      console.log(`customer_addresses: ${cad.count}`);

      const dp = await tx.dataPool.deleteMany();
      console.log(`data_pool: ${dp.count}`);

      // 8) Gỡ self-reference duplicate
      await tx.customer.updateMany({
        data: { duplicateOfCustomerId: null },
      });
      console.log('customers: đã gỡ duplicate_of_customer_id');

      const cust = await tx.customer.deleteMany();
      console.log(`customers: ${cust.count}`);

      // 9) Chiến dịch (sau khi không còn customer trỏ tới)
      const mca = await tx.marketingCostAssignment.deleteMany();
      console.log(`marketing_cost_assignments: ${mca.count}`);

      const mcc = await tx.marketingCampaignCost.deleteMany();
      console.log(`marketing_campaign_costs: ${mcc.count}`);

      const mcp = await tx.marketingCampaignProduct.deleteMany();
      console.log(`marketing_campaign_products: ${mcp.count}`);

      const mcm = await tx.marketingCampaignMember.deleteMany();
      console.log(`marketing_campaign_members: ${mcm.count}`);

      const mc = await tx.marketingCampaign.deleteMany();
      console.log(`marketing_campaigns: ${mc.count}`);
    },
    { timeout: 600_000 }
  );

  console.log('Hoàn tất.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
