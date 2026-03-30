import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logAudit, getAuditUser } from '../utils/auditLog';
import { getSubordinateIds } from '../utils/viewScopeHelper';
import { isTechnicalAdminRoleCode } from '../constants/rbac';
import { getDefaultOrganizationId } from '../utils/organizationHelper';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

/**
 * Kiểm tra user có phải ADM (Admin System) không
 */
const isAdminUser = async (userId: string): Promise<boolean> => {
  const employee = await prisma.employee.findUnique({
    where: { id: userId },
    select: { roleGroup: { select: { code: true } } },
  });
  return isTechnicalAdminRoleCode(employee?.roleGroup?.code);
};

/**
 * Kiểm tra quyền truy cập tài liệu
 * Trả về: { canView, canEdit, canDownload, canPrint, isOwner, canManagePermissions }
 */
const checkDocumentAccess = async (
  documentId: string, 
  userId: string
): Promise<{ canView: boolean; canEdit: boolean; canDownload: boolean; canPrint: boolean; isOwner: boolean; canManagePermissions: boolean; isAdmin: boolean }> => {
  // Mặc định không có quyền
  let result = { canView: false, canEdit: false, canDownload: false, canPrint: false, isOwner: false, canManagePermissions: false, isAdmin: false };
  
  // Kiểm tra ADM - có toàn quyền (bao gồm phân quyền)
  const isAdmin = await isAdminUser(userId);
  if (isAdmin) {
    return { canView: true, canEdit: true, canDownload: true, canPrint: true, isOwner: false, canManagePermissions: true, isAdmin: true };
  }
  
  // Lấy thông tin tài liệu
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      permissions: true
    }
  });
  
  if (!document) return result;
  
  // Kiểm tra chủ sở hữu
  if (document.ownerId === userId) {
    return { canView: true, canEdit: true, canDownload: false, canPrint: false, isOwner: true, canManagePermissions: true, isAdmin: false };
  }
  
  // Lấy thông tin user
  const user = await prisma.employee.findUnique({
    where: { id: userId },
    select: { 
      id: true, 
      departmentId: true, 
      roleGroupId: true
    }
  });
  
  if (!user) return result;
  
  // Kiểm tra quyền theo cấp quản lý (Ngoại lệ 2)
  // Nếu user là quản lý cấp trên của chủ sở hữu -> được xem
  if (document.ownerId) {
    const subordinates = await getSubordinateIds(userId);
    if (subordinates.includes(document.ownerId)) {
      result.canView = true;
      // Quản lý chỉ được xem, không được edit/download/print
    }
  }
  
  // Kiểm tra permissions được cấu hình
  for (const perm of document.permissions) {
    let hasAccess = false;
    
    // Kiểm tra theo nhân sự cụ thể
    if (perm.employeeId && perm.employeeId === userId) {
      hasAccess = true;
    }
    
    // Kiểm tra theo nhóm quyền
    if (perm.roleGroupId && perm.roleGroupId === user.roleGroupId) {
      hasAccess = true;
    }
    
    // Check if department branch matches can be added here
    if (perm.departmentId && perm.departmentId === user.departmentId) {
      hasAccess = true;
    }
    
    if (hasAccess) {
      result.canView = true;
      // VIEWER: chỉ xem
      // VIEW_DOWNLOAD: xem + tải (không sửa)
      // EDITOR: xem + sửa (+ có thể tải nếu cần)
      if (perm.accessLevel === 'VIEW_DOWNLOAD' || perm.accessLevel === 'EDITOR') {
        result.canDownload = true;
      }
      if (perm.accessLevel === 'EDITOR') {
        result.canEdit = true;
      }
    }
  }
  
  return result;
};

/**
 * Tạo mã tài liệu tự động
 */
const generateDocumentCode = async (category: string): Promise<string> => {
  const prefixMap: Record<string, string> = {
    'Hợp đồng': 'HD',
    'Báo cáo': 'BC',
    'Kỹ thuật': 'KT',
    'Pháp lý': 'PL',
    'Khác': 'KH',
    'guide': 'HD',
    'process': 'QT',
    'technical': 'KT',
    'policy': 'CS',
    'customer_care': 'CK'
  };
  const prefix = prefixMap[category] || 'VB';
  const year = new Date().getFullYear();
  const baseCode = `${prefix}${year}`;

  const lastDoc = await prisma.document.findFirst({
    where: { code: { startsWith: baseCode } },
    orderBy: { code: 'desc' }
  });

  let sequence = 1;
  if (lastDoc) {
    const lastSeq = parseInt(lastDoc.code.slice(baseCode.length));
    if (!isNaN(lastSeq)) sequence = lastSeq + 1;
  }

  return `${baseCode}${sequence.toString().padStart(4, '0')}`;
};

/**
 * Lấy danh sách tài liệu (có phân quyền)
 */
export const getDocuments = async (req: Request, res: Response) => {
  try {
    const { type, search, category } = req.query;
    const user = (req as any).user;
    const userId = user.id;
    
    const isAdmin = await isAdminUser(userId);
    
    // Lấy tất cả tài liệu
    let documents = await prisma.document.findMany({
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        permissions: true
      },
      orderBy: { uploadDate: 'desc' }
    });
    
    // Nếu không phải ADM, lọc theo quyền truy cập
    if (!isAdmin) {
      const userInfo = await prisma.employee.findUnique({
        where: { id: userId },
        select: { 
          departmentId: true, 
          roleGroupId: true
        }
      });
      
      // Lấy danh sách cấp dưới
      const subordinates = await getSubordinateIds(userId);
      
      documents = documents.filter(doc => {
        // Chủ sở hữu
        if (doc.ownerId === userId) return true;
        
        // Quản lý cấp trên của chủ sở hữu
        if (doc.ownerId && subordinates.includes(doc.ownerId)) return true;
        
        // Kiểm tra permissions
        for (const perm of doc.permissions) {
          if (perm.employeeId === userId) return true;
          if (perm.roleGroupId && perm.roleGroupId === userInfo?.roleGroupId) return true;
          if (perm.departmentId && perm.departmentId === userInfo?.departmentId) return true;
        }
        
        return false;
      });
    }
    
    // Filter by type
    if (type && type !== 'all') {
      documents = documents.filter(d => d.type === type);
    }
    
    // Filter by category
    if (category && category !== 'all') {
      documents = documents.filter(d => d.category === category);
    }
    
    // Search
    if (search) {
      const q = (search as string).toLowerCase();
      documents = documents.filter(d => 
        d.name.toLowerCase().includes(q) || 
        d.code.toLowerCase().includes(q)
      );
    }
    
    // Map response (không include content để giảm payload)
    const result = documents.map(doc => ({
      id: doc.id,
      code: doc.code,
      name: doc.name,
      type: doc.type,
      category: doc.category,
      size: doc.size,
      uploadDate: doc.uploadDate,
      uploadedBy: doc.uploadedBy,
      status: doc.status,
      version: doc.version,
      owner: doc.owner,
      isOwner: doc.ownerId === userId,
      permissionCount: doc.permissions.length
    }));
    
    res.json(result);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách tài liệu' });
  }
};

/**
 * Lấy chi tiết tài liệu (có kiểm tra quyền)
 */
export const getDocumentById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    
    const access = await checkDocumentAccess(id, user.id);
    
    if (!access.canView) {
      return res.status(403).json({ message: 'Bạn không có quyền xem tài liệu này' });
    }
    
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        permissions: {
          include: {
            employee: { select: { id: true, fullName: true, avatarUrl: true } },
            roleGroup: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true } }
          }
        }
      }
    });
    
    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }
    
    res.json({
      ...document,
      access: {
        canView: access.canView,
        canEdit: access.canEdit,
        canDownload: access.canDownload,
        canPrint: access.canPrint,
        isOwner: access.isOwner,
        canManagePermissions: access.canManagePermissions,
        isAdmin: access.isAdmin
      }
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin tài liệu' });
  }
};

/**
 * Tạo tài liệu mới (người tạo = chủ sở hữu)
 */
export const createDocument = async (req: Request, res: Response) => {
  try {
    const { name, title, path: docPath, type, category, size, content, permissions } = req.body;
    const user = (req as any).user;
    
    const docName = name || title;
    if (!docName || !type) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (tên, loại)' });
    }
    
    const code = await generateDocumentCode(category || type || 'Khác');
    
    // Tạo tài liệu với ownerId = user hiện tại
    const newDoc = await prisma.document.create({
      data: {
        code,
        name: docName,
        path: docPath || '',
        content,
        type,
        category: category || 'Khác',
        size: size || '0KB',
        uploadDate: new Date(),
        uploadedBy: user.name || user.fullName,
        status: 'active',
        ownerId: user.id
      }
    });
    
    // Tạo permissions nếu có
    if (permissions && Array.isArray(permissions)) {
      for (const perm of permissions) {
        await prisma.documentPermission.create({
          data: {
            documentId: newDoc.id,
            employeeId: perm.employeeId || null,
            roleGroupId: perm.roleGroupId || null,
            departmentId: perm.departmentId || null,
            accessLevel: perm.accessLevel || 'VIEWER'
          }
        });
      }
    }
    
    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'DOCUMENT',
      objectId: newDoc.id,
      result: 'SUCCESS',
      details: `Created document: ${docName}`,
      req
    });
    
    res.status(201).json(newDoc);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo tài liệu' });
  }
};

/**
 * Cập nhật tài liệu (chỉ owner hoặc editor)
 */
export const updateDocument = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, title, type, category, status, content, permissions } = req.body;
    const user = (req as any).user;
    
    const access = await checkDocumentAccess(id, user.id);
    
    if (!access.canEdit) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa tài liệu này' });
    }
    
    const existingDoc = await prisma.document.findUnique({ where: { id } });
    if (!existingDoc) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }
    
    const updatedDoc = await prisma.document.update({
      where: { id },
      data: {
        name: name || title || existingDoc.name,
        type: type || existingDoc.type,
        category: category || existingDoc.category,
        status: status || existingDoc.status,
        content: content !== undefined ? content : existingDoc.content
      }
    });
    
    // Cập nhật permissions nếu là owner hoặc ADM
    if (access.canManagePermissions && permissions !== undefined) {
      // Xóa permissions cũ
      await prisma.documentPermission.deleteMany({ where: { documentId: id } });
      
      // Tạo permissions mới
      if (Array.isArray(permissions)) {
        for (const perm of permissions) {
          await prisma.documentPermission.create({
            data: {
              documentId: id,
              employeeId: perm.employeeId || null,
              roleGroupId: perm.roleGroupId || null,
              departmentId: perm.departmentId || null,
              accessLevel: perm.accessLevel || 'VIEWER'
            }
          });
        }
      }
    }
    
    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DOCUMENT',
      objectId: id,
      result: 'SUCCESS',
      oldValues: existingDoc,
      newValues: updatedDoc,
      details: `Updated document: ${updatedDoc.name}`,
      req
    });
    
    res.json(updatedDoc);
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật tài liệu' });
  }
};

/**
 * Xóa tài liệu (chỉ owner hoặc ADM)
 */
export const deleteDocument = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    
    const isAdmin = await isAdminUser(user.id);
    const document = await prisma.document.findUnique({ where: { id } });
    
    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }
    
    if (!isAdmin && document.ownerId !== user.id) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa tài liệu này' });
    }
    
    await prisma.document.delete({ where: { id } });
    
    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'DOCUMENT',
      objectId: id,
      result: 'SUCCESS',
      oldValues: document,
      details: `Deleted document: ${document.name}`,
      req
    });
    
    res.json({ message: 'Đã xóa tài liệu thành công' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa tài liệu' });
  }
};

/**
 * Cập nhật phân quyền tài liệu (chỉ owner)
 */
export const updateDocumentPermissions = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { permissions } = req.body;
    const user = (req as any).user;
    
    const document = await prisma.document.findUnique({ where: { id } });
    
    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }
    
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin && document.ownerId !== user.id) {
      return res.status(403).json({ message: 'Chỉ chủ sở hữu hoặc Quản trị viên hệ thống mới có quyền phân quyền tài liệu' });
    }
    
    // Xóa permissions cũ
    await prisma.documentPermission.deleteMany({ where: { documentId: id } });
    
    // Tạo permissions mới
    const createdPermissions = [];
    if (Array.isArray(permissions)) {
      for (const perm of permissions) {
        const created = await prisma.documentPermission.create({
          data: {
            documentId: id,
            employeeId: perm.employeeId || null,
            roleGroupId: perm.roleGroupId || null,
            departmentId: perm.departmentId || null,
            accessLevel: perm.accessLevel || 'VIEWER'
          },
          include: {
            employee: { select: { id: true, fullName: true } },
            roleGroup: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } }
          }
        });
        createdPermissions.push(created);
      }
    }
    
    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DOCUMENT_PERMISSION',
      objectId: id,
      result: 'SUCCESS',
      details: `Updated permissions for document: ${document.name}`,
      req
    });
    
    res.json({ 
      message: 'Đã cập nhật phân quyền',
      permissions: createdPermissions
    });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật phân quyền' });
  }
};

/**
 * Download tài liệu (chỉ ADM)
 */
export const downloadDocument = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;

    // Sử dụng checkDocumentAccess để cho phép ADM, Owner (nếu sau này mở), 
    // và các quyền cụ thể như VIEW_DOWNLOAD / EDITOR tải tài liệu.
    const access = await checkDocumentAccess(id, user.id);

    if (!access.canDownload) {
      return res.status(403).json({ message: 'Bạn không có quyền tải xuống tài liệu này' });
    }

    const document = await prisma.document.findUnique({ where: { id } });
    
    if (!document) {
      return res.status(404).json({ message: 'Không tìm thấy tài liệu' });
    }
    
    await logAudit({
      ...getAuditUser(req),
      action: 'DOWNLOAD',
      object: 'DOCUMENT',
      objectId: id,
      result: 'SUCCESS',
      details: `Downloaded document: ${document.name}`,
      req
    });
    
    // Trả về content để download
    res.json({
      name: document.name,
      content: document.content,
      type: document.type
    });
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ message: 'Lỗi khi tải xuống tài liệu' });
  }
};

/**
 * Kiểm tra quyền in (chỉ ADM)
 */
export const checkPrintPermission = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = (req as any).user;
    
    const isAdmin = await isAdminUser(user.id);
    
    if (!isAdmin) {
      return res.status(403).json({ 
        canPrint: false,
        message: 'Bạn không có quyền in tài liệu' 
      });
    }
    
    await logAudit({
      ...getAuditUser(req),
      action: 'PRINT',
      object: 'DOCUMENT',
      objectId: id,
      result: 'SUCCESS',
      details: `Print document requested`,
      req
    });
    
    res.json({ canPrint: true });
  } catch (error) {
    console.error('Check print permission error:', error);
    res.status(500).json({ message: 'Lỗi khi kiểm tra quyền in' });
  }
};

// Helper to detect binary content
const isBinaryFile = (filePath: string): boolean => {
  const buffer = Buffer.alloc(512);
  const fd = fs.openSync(filePath, 'r');
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
    if (bytesRead === 0) return false;
    
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0x00) return true;
    }

    if (bytesRead >= 4 && buffer.slice(0, 4).toString() === '%PDF') return true;
    if (bytesRead >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
    if (bytesRead >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
    if (bytesRead >= 4 && buffer.slice(0, 4).toString() === 'GIF8') return true;
    
    return false;
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * Upload file tài liệu
 */
export const uploadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Không có file được tải lên' });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let content = '';

    if (!['.docx', '.html', '.md', '.xlsx', '.pdf'].includes(ext)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: 'Loại file không được hỗ trợ' });
    }

    if (ext === '.pdf') {
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');
      content = `data:application/pdf;base64,${base64}`;
    } else if (ext === '.docx') {
      try {
        const result = await mammoth.convertToHtml({ path: filePath });
        content = result.value;
      } catch (err) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'File .docx không hợp lệ' });
      }
    } else if (ext === '.xlsx') {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('Empty workbook');

        let html = '<table border="1" cellpadding="4" cellspacing="0">';
        worksheet.eachRow((row, rowNumber) => {
          html += '<tr>';
          row.eachCell({ includeEmpty: true }, (cell) => {
            const tag = rowNumber === 1 ? 'th' : 'td';
            const value = cell.value != null ? String(cell.value) : '';
            html += `<${tag}>${value}</${tag}>`;
          });
          html += '</tr>';
        });
        html += '</table>';
        content = html;
      } catch (err) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'File .xlsx không hợp lệ' });
      }
    } else {
      if (isBinaryFile(filePath)) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'File binary không được hỗ trợ' });
      }
      content = fs.readFileSync(filePath, 'utf8');
      
      if (content.includes('\uFFFD')) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: 'Nội dung file không hợp lệ' });
      }
    }

    fs.unlinkSync(filePath);

    res.json({ 
      content, 
      filename: req.file.originalname,
      message: 'Tải file thành công' 
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Lỗi khi xử lý file' });
  }
};

/**
 * Lấy danh sách nhân sự để phân quyền
 */
export const getEmployeesForPermission = async (req: Request, res: Response) => {
  try {
    const { search, departmentId, divisionId } = req.query;
    
    const where: any = { status: { code: 'WORKING' } };
    
    if (departmentId) {
      where.departmentId = departmentId;
    }
    
    if (divisionId) {
      // In the new unified model, division is just a department with type='DIVISION'
      // We'd ideally recursively get children, but for now we look at parentId
      // Or we can just use the provided department logic
    }
    
    if (search) {
      where.OR = [
        { fullName: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } }
      ];
    }
    
    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        code: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { id: true, name: true } },
        position: { select: { id: true, name: true } }
      },
      orderBy: { fullName: 'asc' },
      take: 10000 // Đủ cho toàn bộ nhân sự công ty, tránh giới hạn 50
    });
    
    res.json(employees);
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhân sự' });
  }
};

/**
 * Lấy danh sách khối và phòng ban để phân quyền
 */
export const getDivisionsAndDepartments = async (req: Request, res: Response) => {
  try {
    const docOrgId = await getDefaultOrganizationId();
    const divisions = docOrgId
      ? await prisma.department.findMany({
          where: { type: 'DIVISION', organizationId: docOrgId },
          include: {
            children: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { displayOrder: 'asc' },
        })
      : [];
    
    // Map children to departments for frontend compatibility
    const mapped = divisions.map(d => ({
      ...d,
      departments: d.children
    }));
    
    res.json(mapped);
  } catch (error) {
    console.error('Get divisions error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách khối/phòng ban' });
  }
};

/**
 * Lấy danh sách nhóm quyền để phân quyền
 */
export const getRoleGroupsForPermission = async (req: Request, res: Response) => {
  try {
    const roleGroups = await prisma.roleGroup.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { sortOrder: 'asc' }
    });
    
    res.json(roleGroups);
  } catch (error) {
    console.error('Get role groups error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhóm quyền' });
  }
};

const DEFAULT_DOCUMENT_TYPES = [
  { code: 'guide', name: 'Hướng dẫn', displayOrder: 1 },
  { code: 'process', name: 'Quy trình', displayOrder: 2 },
  { code: 'technical', name: 'Kỹ thuật', displayOrder: 3 },
  { code: 'policy', name: 'Chính sách', displayOrder: 4 },
  { code: 'customer_care', name: 'CSKH', displayOrder: 5 }
];

// ========== Phân loại tài liệu (Document Types) ==========
export const getDocumentTypes = async (req: Request, res: Response) => {
  try {
    let types = await prisma.documentType.findMany({
      orderBy: { displayOrder: 'asc' }
    });
    if (types.length === 0) {
      await prisma.documentType.createMany({
        data: DEFAULT_DOCUMENT_TYPES.map((t, i) => ({ ...t, displayOrder: i + 1 }))
      });
      types = await prisma.documentType.findMany({
        orderBy: { displayOrder: 'asc' }
      });
    }
    res.json(types);
  } catch (error) {
    console.error('Get document types error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phân loại tài liệu' });
  }
};

/** Tạo mã phân loại từ tên: bỏ dấu, chữ thường, khoảng trắng -> gạch dưới */
function slugifyCode(name: string): string {
  const s = name.trim().toLowerCase();
  const map: Record<string, string> = { à: 'a', á: 'a', ả: 'a', ã: 'a', ạ: 'a', ă: 'a', ằ: 'a', ắ: 'a', ẳ: 'a', ẵ: 'a', ặ: 'a', â: 'a', ầ: 'a', ấ: 'a', ẩ: 'a', ẫ: 'a', ậ: 'a', è: 'e', é: 'e', ẻ: 'e', ẽ: 'e', ẹ: 'e', ê: 'e', ề: 'e', ế: 'e', ể: 'e', ễ: 'e', ệ: 'e', ì: 'i', í: 'i', ỉ: 'i', ĩ: 'i', ị: 'i', ò: 'o', ó: 'o', ỏ: 'o', õ: 'o', ọ: 'o', ô: 'o', ồ: 'o', ố: 'o', ổ: 'o', ỗ: 'o', ộ: 'o', ơ: 'o', ờ: 'o', ớ: 'o', ở: 'o', ỡ: 'o', ợ: 'o', ù: 'u', ú: 'u', ủ: 'u', ũ: 'u', ụ: 'u', ư: 'u', ừ: 'u', ứ: 'u', ử: 'u', ữ: 'u', ự: 'u', ỳ: 'y', ý: 'y', ỷ: 'y', ỹ: 'y', ỵ: 'y', đ: 'd' };
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += map[c] || (/[a-z0-9]/.test(c) ? c : c === ' ' || c === '\t' ? '_' : '');
  }
  return out.replace(/_+/g, '_').replace(/^_|_$/g, '') || 'type';
}

export const createDocumentType = async (req: Request, res: Response) => {
  try {
    const user = getAuditUser(req);
    const { name, displayOrder } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Tên phân loại là bắt buộc' });
    }
    let code = slugifyCode(name);
    let suffix = 0;
    while (true) {
      const candidate = suffix ? `${code}_${suffix}` : code;
      const existing = await prisma.documentType.findUnique({ where: { code: candidate } });
      if (!existing) {
        code = candidate;
        break;
      }
      suffix++;
    }
    const created = await prisma.documentType.create({
      data: {
        code,
        name: name.trim(),
        displayOrder: typeof displayOrder === 'number' ? displayOrder : 0
      }
    });
    try {
      await logAudit({ ...user, action: 'DOCUMENT_TYPE_CREATE', object: 'DocumentType', objectId: created.id, result: 'SUCCESS', details: `Tạo phân loại: ${created.name}` });
    } catch (_) {}
    res.status(201).json(created);
  } catch (error: any) {
    console.error('Create document type error:', error);
    const msg = error?.message || 'Lỗi khi tạo phân loại tài liệu';
    const hint = error?.code === 'P2021' || (typeof msg === 'string' && msg.includes('document_types'))
      ? ' Bạn đã chạy migration thêm bảng document_types chưa?'
      : '';
    res.status(500).json({ message: msg + hint });
  }
};

export const updateDocumentType = async (req: Request, res: Response) => {
  try {
    const user = getAuditUser(req);
    const id = String(req.params.id ?? '');
    const { code, name, displayOrder } = req.body;
    const existing = await prisma.documentType.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy phân loại' });
    }
    const data: { name?: string; code?: string; displayOrder?: number } = {};
    if (typeof name === 'string' && name.trim()) data.name = name.trim();
    if (typeof code === 'string' && code.trim()) {
      data.code = code.trim().toLowerCase().replace(/\s+/g, '_');
      const duplicate = await prisma.documentType.findFirst({ where: { code: data.code, id: { not: id } } });
      if (duplicate) return res.status(400).json({ message: 'Mã phân loại đã được sử dụng' });
    }
    if (typeof displayOrder === 'number') data.displayOrder = displayOrder;
    const updated = await prisma.documentType.update({
      where: { id },
      data
    });
    await logAudit({ ...user, action: 'DOCUMENT_TYPE_UPDATE', object: 'DocumentType', objectId: id, result: 'SUCCESS', details: `Cập nhật phân loại: ${updated.name}` });
    res.json(updated);
  } catch (error) {
    console.error('Update document type error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật phân loại' });
  }
};

export const deleteDocumentType = async (req: Request, res: Response) => {
  try {
    const user = getAuditUser(req);
    const id = String(req.params.id ?? '');
    const existing = await prisma.documentType.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy phân loại' });
    }
    const count = await prisma.document.count({ where: { type: existing.code } });
    if (count > 0) {
      return res.status(400).json({ message: `Không thể xóa: có ${count} tài liệu đang dùng phân loại này. Hãy đổi phân loại của các tài liệu trước.` });
    }
    await prisma.documentType.delete({ where: { id } });
    await logAudit({ ...user, action: 'DOCUMENT_TYPE_DELETE', object: 'DocumentType', objectId: id, result: 'SUCCESS', details: `Xóa phân loại: ${existing.name}` });
    res.json({ message: 'Đã xóa phân loại' });
  } catch (error) {
    console.error('Delete document type error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa phân loại' });
  }
};
