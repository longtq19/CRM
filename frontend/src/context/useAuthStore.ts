import { create } from 'zustand';
import type { User } from '../types';
import { apiClient, ApiHttpError } from '../api/client';
import { isTechnicalAdminRole } from '../constants/rbac';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<{ success: boolean; message?: string }>;
  /** Đăng nhập từ token kiểm tra tài khoản (cửa sổ mới, /login?staffCheck= — JWT chỉ trong sessionStorage). */
  loginWithStaffCheckToken: (token: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  hasPermission: (permissionCode: string) => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true, // Start loading to check session
  isAdmin: () => {
    const user = get().user;
    return isTechnicalAdminRole(user?.roleGroup?.code);
  },
  hasPermission: (permissionCode: string) => {
    const user = get().user;
    if (!user) return false;
    if (isTechnicalAdminRole(user.roleGroup?.code)) return true;
    const perms = user.permissions || [];
    const codes = perms.map((p: any) => (typeof p === 'string' ? p : p.code));
    if (codes.includes('FULL_ACCESS')) return true;
    return codes.includes(permissionCode);
  },
  login: async (phone, password) => {
    try {
        const data = await apiClient.post('/login', { phone, password });
        if (data.success) {
            if (data.token) {
              sessionStorage.removeItem('token');
              localStorage.setItem('token', data.token);
            }
            set({ user: data.user, isAuthenticated: true });
            return { success: true };
        }
        return { success: false, message: data.message || 'Đăng nhập thất bại' };
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '';
        if (
            msg === 'Failed to fetch' ||
            msg.includes('NetworkError') ||
            msg.includes('Load failed')
        ) {
            return {
                success: false,
                message: 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.',
            };
        }
        return { success: false, message: msg || 'Đăng nhập thất bại' };
    }
  },
  loginWithStaffCheckToken: async (token) => {
    try {
      const data: any = await apiClient.post('/auth/consume-staff-check-token', { token });
      if (data?.success && data.user) {
        if (data.token) {
          sessionStorage.setItem('token', data.token);
        }
        set({ user: data.user, isAuthenticated: true });
        return { success: true };
      }
      return { success: false, message: data?.message || 'Đăng nhập kiểm tra thất bại.' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (
        msg === 'Failed to fetch' ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed')
      ) {
        return {
          success: false,
          message: 'Không kết nối được máy chủ. Kiểm tra mạng hoặc thử lại sau.',
        };
      }
      return { success: false, message: msg || 'Đăng nhập kiểm tra thất bại.' };
    }
  },
  logout: async () => {
      try {
          await apiClient.post('/logout', {});
      } catch (err) {
          console.error('Logout error', err);
      } finally {
          /** Phiên kiểm tra chỉ dùng sessionStorage — không xóa localStorage (token tab quản trị). */
          if (sessionStorage.getItem('token')) {
            sessionStorage.removeItem('token');
          } else {
            localStorage.removeItem('token');
          }
          set({ user: null, isAuthenticated: false });
      }
  },
  checkAuth: async () => {
      try {
          // Tránh treo màn hình tải vô hạn khi backend không phản hồi (proxy/mạng).
          const sessionSignal =
            typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
              ? AbortSignal.timeout(15000)
              : undefined;
          // Xác thực phiên với backend (cookie hoặc Authorization header). Chỉ đăng xuất khi 401 (token hết hạn, bị ADM đăng xuất, tạm khóa).
          const data = await apiClient.get('/me', sessionSignal ? { signal: sessionSignal } : undefined);
          if (data.success && data.user) {
             if (data.token) {
               if (sessionStorage.getItem('token')) {
                 sessionStorage.setItem('token', data.token);
               } else {
                 localStorage.setItem('token', data.token);
               }
             }
             set({ user: data.user, isAuthenticated: true });
          } else {
             if (sessionStorage.getItem('token')) {
               sessionStorage.removeItem('token');
             } else {
               localStorage.removeItem('token');
             }
             set({ user: null, isAuthenticated: false });
          }
      } catch (error: unknown) {
          // Chỉ đăng xuất khi 401 (phiên hết hạn / không hợp lệ). Lỗi 5xx hoặc mạng tạm thời không xóa phiên.
          const unauth =
            (error instanceof ApiHttpError && error.status === 401) ||
            (error instanceof Error &&
              (error.message === 'Unauthorized' ||
                error.message === 'User not found' ||
                error.message === 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' ||
                error.message === 'Không tìm thấy tài khoản.' ||
                error.message === 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn.'));
          if (unauth) {
             if (sessionStorage.getItem('token')) {
               sessionStorage.removeItem('token');
             } else {
               localStorage.removeItem('token');
             }
             set({ user: null, isAuthenticated: false });
          }
          // Giữ nguyên user/isAuthenticated nếu có lỗi khác (server tạm lỗi), chỉ tắt loading
      } finally {
          set({ isLoading: false });
      }
  }
}));
