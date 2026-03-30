import { Customer as PrismaCustomer } from '@prisma/client';
import { prisma } from '../config/database';

export interface Customer {
  id: string;
  code: string;
  name?: string;
  phone: string;
  email?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
  totalOrdersValue: number;
  totalOrders: number;
  joinedDate: string;
  note?: string;
  createdByRole?: string;
}

const mapToInterface = (c: PrismaCustomer): Customer => ({
  id: c.id,
  code: c.code,
  name: c.name || undefined,
  phone: c.phone,
  email: c.email || undefined,
  address: c.address || undefined,
  dateOfBirth: c.dateOfBirth?.toISOString() || undefined,
  gender: c.gender || undefined,
  totalOrdersValue: c.totalOrdersValue,
  totalOrders: c.totalOrders,
  joinedDate: c.joinedDate.toISOString(),
  note: c.note || undefined,
  createdByRole: c.createdByRole || undefined
});

export const customerModel = {
  findAll: async () => {
    const customers = await prisma.customer.findMany({
      orderBy: { joinedDate: 'desc' }
    });
    return customers.map(mapToInterface);
  },
  
  findById: async (id: string) => {
    const customer = await prisma.customer.findUnique({ where: { id } });
    return customer ? mapToInterface(customer) : null;
  },
  
  create: async (customer: Partial<Customer> & { phone: string }) => {
    const count = await prisma.customer.count();
    const code = `KH-${String(count + 1).padStart(6, '0')}`;
    
    const newCustomer = await prisma.customer.create({
      data: {
        code,
        phone: customer.phone,
        name: customer.name || null,
        email: customer.email || null,
        address: customer.address || null,
        dateOfBirth: customer.dateOfBirth ? new Date(customer.dateOfBirth) : null,
        gender: customer.gender || null,
        note: customer.note || null,
        createdByRole: customer.createdByRole || null
      }
    });
    return mapToInterface(newCustomer);
  },
  
  update: async (id: string, data: Partial<Customer>) => {
    try {
      const updateData: any = { ...data };
      if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
      if (data.joinedDate) delete updateData.joinedDate; 
      delete updateData.id;
      delete updateData.code;
      
      const updated = await prisma.customer.update({
        where: { id },
        data: updateData
      });
      return mapToInterface(updated);
    } catch (error) {
      return null;
    }
  },
  
  delete: async (id: string) => {
    try {
      const deleted = await prisma.customer.delete({ where: { id } });
      return mapToInterface(deleted);
    } catch (error) {
      return null;
    }
  }
};
