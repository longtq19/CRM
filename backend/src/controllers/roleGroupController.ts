import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { isTechnicalAdminRoleCode } from '../constants/rbac';

const slugify = (str: string) => {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return str.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
};

export const getRoleGroups = async (req: Request, res: Response) => {
    try {
        const roleGroups = await prisma.roleGroup.findMany({
            include: {
                menus: true,
                permissions: true
            },
            orderBy: {
                sortOrder: 'asc'
            }
        });
        res.json({ success: true, data: roleGroups });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch role groups', error });
    }
};

export const getMenus = async (req: Request, res: Response) => {
    try {
        const menus = await prisma.menu.findMany({
            orderBy: {
                order: 'asc'
            }
        });
        res.json({ success: true, data: menus });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch menus', error });
    }
};

export const getPermissions = async (req: Request, res: Response) => {
    try {
        const permissions = await prisma.permission.findMany({
            orderBy: {
                code: 'asc'
            }
        });
        res.json({ success: true, data: permissions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch permissions', error });
    }
};

export const updateRoleGroup = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { menuIds, permissionIds, name } = req.body;

    try {
        const existing = await prisma.roleGroup.findUnique({ where: { id: String(id) } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm quyền' });
        }
        if (isTechnicalAdminRoleCode(existing.code)) {
            const triesToChangeRbac =
                menuIds !== undefined || permissionIds !== undefined || name !== undefined;
            if (triesToChangeRbac) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Nhóm Quản trị hệ thống (system_administrator) luôn có đủ menu, quyền và phạm vi tối đa; không chỉnh sửa qua API.',
                });
            }
            const unchanged = await prisma.roleGroup.findUnique({
                where: { id: String(id) },
                include: { menus: true, permissions: true },
            });
            return res.json({
                success: true,
                data: unchanged,
                message: 'Nhóm Quản trị hệ thống không chỉnh sửa từ giao diện phân quyền.',
            });
        }

        const dataToUpdate: any = {};

        if (menuIds) {
            dataToUpdate.menus = {
                set: menuIds.map((menuId: string) => ({ id: menuId }))
            };
        }

        if (permissionIds) {
            dataToUpdate.permissions = {
                set: permissionIds.map((permId: string) => ({ id: permId }))
            };
        }

        if (name) {
            dataToUpdate.name = name;
        }

        const updatedRoleGroup = await prisma.roleGroup.update({
            where: { id: String(id) },
            data: dataToUpdate,
            include: {
                menus: true,
                permissions: true
            }
        });

        res.json({ success: true, data: updatedRoleGroup, message: 'Role group updated successfully' });
    } catch (error) {
        console.error('Update RoleGroup Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update role group', error });
    }
};

export const createRoleGroup = async (req: Request, res: Response) => {
    let { name, code } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
    }

    if (!code) {
        code = slugify(name);
    }

    try {
        const existing = await prisma.roleGroup.findFirst({
            where: {
                OR: [{ code }, { name }]
            }
        });

        if (existing) {
            return res.status(400).json({ success: false, message: 'Role Group with this Code or Name already exists' });
        }

        const newRoleGroup = await prisma.roleGroup.create({
            data: {
                name,
                code: code.toUpperCase(),
                menus: { connect: [] }, // Start empty
                permissions: { connect: [] }
            },
            include: {
                menus: true,
                permissions: true
            }
        });

        res.json({ success: true, data: newRoleGroup, message: 'Role group created successfully' });
    } catch (error) {
        console.error('Create RoleGroup Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create role group', error });
    }
};

/**
 * Lấy phạm vi xem của tất cả nhóm quyền
 */
export const getViewScopes = async (req: Request, res: Response) => {
    try {
        const roleGroups = await prisma.roleGroup.findMany({
            include: { viewScopes: true },
            orderBy: { sortOrder: 'asc' }
        });
        const scopesMap: Record<string, { HR?: string; CUSTOMER?: string }> = {};
        for (const rg of roleGroups) {
            scopesMap[rg.id] = {};
            for (const vs of rg.viewScopes) {
                if (vs.context === 'HR') scopesMap[rg.id].HR = vs.scope;
                if (vs.context === 'CUSTOMER') scopesMap[rg.id].CUSTOMER = vs.scope;
            }
        }
        res.json({ success: true, data: { roleGroups, scopesMap } });
    } catch (error) {
        console.error('Get ViewScopes Error:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi tải phạm vi xem' });
    }
};

/**
 * Cập nhật phạm vi xem cho một nhóm quyền
 * body: { roleGroupId, hrScope?, customerScope? }
 * scope: SELF_RECURSIVE | DEPARTMENT | DIVISION | COMPANY
 */
export const updateViewScopes = async (req: Request, res: Response) => {
    const body = req.body || {};
    const { roleGroupId, hrScope, customerScope } = body;
    const validScopes = ['SELF_RECURSIVE', 'DEPARTMENT', 'DIVISION', 'COMPANY'];

    if (!roleGroupId || typeof roleGroupId !== 'string') {
        return res.status(400).json({ success: false, message: 'Thiếu roleGroupId' });
    }
    if (hrScope && !validScopes.includes(hrScope)) {
        return res.status(400).json({ success: false, message: `hrScope không hợp lệ. Cho phép: ${validScopes.join(', ')}` });
    }
    if (customerScope && !validScopes.includes(customerScope)) {
        return res.status(400).json({ success: false, message: `customerScope không hợp lệ. Cho phép: ${validScopes.join(', ')}` });
    }

    try {
        const roleGroup = await prisma.roleGroup.findUnique({ where: { id: roleGroupId } });
        if (!roleGroup) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm quyền' });
        }
        if (isTechnicalAdminRoleCode(roleGroup.code)) {
            return res.status(400).json({
                success: false,
                message:
                    'Phạm vi xem của nhóm Quản trị hệ thống cố định (toàn công ty); không chỉnh sửa.',
            });
        }
        const toUpsert: { roleGroupId: string; context: string; scope: string }[] = [];
        if (hrScope) toUpsert.push({ roleGroupId, context: 'HR', scope: hrScope });
        if (customerScope) toUpsert.push({ roleGroupId, context: 'CUSTOMER', scope: customerScope });

        for (const item of toUpsert) {
            await prisma.roleGroupViewScope.upsert({
                where: {
                    roleGroupId_context: { roleGroupId, context: item.context }
                },
                create: item,
                update: { scope: item.scope }
            });
        }

        const updated = await prisma.roleGroup.findUnique({
            where: { id: roleGroupId },
            include: { viewScopes: true }
        });
        res.json({ success: true, data: updated, message: 'Cập nhật phạm vi xem thành công' });
    } catch (error: any) {
        console.error('Update ViewScopes Error:', error);
        const msg = error?.message || error?.meta?.cause || 'Lỗi khi cập nhật phạm vi xem';
        res.status(500).json({ success: false, message: msg });
    }
};

export const deleteRoleGroup = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const existing = await prisma.roleGroup.findUnique({ where: { id: String(id) } });
        if (existing && isTechnicalAdminRoleCode(existing.code)) {
            return res.status(400).json({
                success: false,
                message: 'Không được xóa nhóm Quản trị hệ thống (system_administrator).',
            });
        }

        // Check if in use
        const usageCount = await prisma.employee.count({
            where: { roleGroupId: String(id) }
        });

        if (usageCount > 0) {
            return res.status(400).json({ success: false, message: `Cannot delete: ${usageCount} employees are assigned to this group.` });
        }

        await prisma.roleGroup.delete({
            where: { id: String(id) }
        });

        res.json({ success: true, message: 'Role group deleted successfully' });
    } catch (error) {
        console.error('Delete RoleGroup Error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete role group', error });
    }
};
