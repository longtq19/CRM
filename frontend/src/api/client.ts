const resolveApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  // Production: dùng envUrl nếu có, không thì '/api' (same-origin backend)
  if (!import.meta.env.DEV) return envUrl || '/api';
  // Dev: envUrl hoặc mặc định /api cho Vite proxy
  if (envUrl) return envUrl;
  return '/api';
};

export const API_URL = resolveApiUrl();

if (!API_URL) {
  console.error('Missing API configuration. Please check .env file.');
}

/** Lỗi HTTP từ API kèm mã trạng thái (dùng để phân biệt 401 với thông báo tiếng Việt từ body). */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly payload?: unknown;

  constructor(status: number, message: string, payload?: unknown) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.payload = payload;
  }
}

function fallbackMessageForStatus(status: number): string {
  if (status === 401) return 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
  if (status === 404) return 'Không tìm thấy dữ liệu.';
  if (status === 413) {
    return 'Dung lượng gửi lên quá lớn (giới hạn proxy hoặc máy chủ). Hãy thử ảnh nhỏ hơn hoặc tăng client_max_body_size trên reverse proxy.';
  }
  // Vite proxy trả 502 khi backend không lắng nghe (ví dụ chưa `npm run dev` trong `backend/`, cổng 3000).
  if (status === 502 || status === 503 || status === 504) {
    return 'Không kết nối được API. Hãy chạy backend (trong thư mục backend: npm run dev, cổng 3000) rồi thử lại.';
  }
  if (status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.';
  return `Không thể hoàn tất yêu cầu (mã ${status}).`;
}

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { message?: string };
    let message =
      typeof errorData.message === 'string' && errorData.message.trim()
        ? errorData.message.trim()
        : fallbackMessageForStatus(response.status);
    // Chuẩn hóa thông báo tiếng Anh cũ từ backend (nếu còn sót)
    if (message === 'Internal Server Error') {
      message = fallbackMessageForStatus(response.status >= 500 ? response.status : 500);
    }
    if (message === 'Unauthorized') {
      message = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
    }
    if (message === 'User not found') {
      message = 'Không tìm thấy tài khoản.';
    }
    if (/^Unauthorized/i.test(message)) {
      message = 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.';
    }
    throw new ApiHttpError(response.status, message, errorData);
  }
  return await response.json();
};

const handleError = (error: unknown) => {
  const is401 = error instanceof ApiHttpError && error.status === 401;
  // 401 khi kiểm tra phiên là bình thường — không log ồn ào
  if (!is401) {
    console.error('API Call Failed:', error);
  }
  throw error;
};

/** sessionStorage: phiên kiểm tra tài khoản (cửa sổ riêng, không ghi đè localStorage tab quản trị). */
export function getStoredAuthToken(): string | null {
  return sessionStorage.getItem('token') || localStorage.getItem('token');
}

const getHeaders = (isMultipart = false) => {
  const headers: HeadersInit = {};
  if (!isMultipart) {
    headers['Content-Type'] = 'application/json';
  }
  const token = getStoredAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const apiClient = {
  get: async (endpoint: string, fetchOptions?: Pick<RequestInit, 'signal'>) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: getHeaders(),
        credentials: 'include', // Important: This sends cookies with the request
        signal: fetchOptions?.signal,
      });
      return await handleResponse(response);
    } catch (error) {
      handleError(error);
    }
  },
  getBlob: async (endpoint: string) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!response.ok) {
        const errJson = (await response.json().catch(() => ({}))) as { message?: string };
        const msg =
          typeof errJson.message === 'string' && errJson.message.trim()
            ? errJson.message
            : fallbackMessageForStatus(response.status);
        throw new ApiHttpError(response.status, msg, errJson);
      }
      return await response.blob();
    } catch (error) {
      handleError(error);
    }
  },
  post: async (endpoint: string, body: any) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
        credentials: 'include', // Important: This sends/receives cookies
      });
      return await handleResponse(response);
    } catch (error) {
      handleError(error);
    }
  },
  postMultipart: async (endpoint: string, formData: FormData) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: getHeaders(true),
        body: formData,
        credentials: 'include',
      });
      return await handleResponse(response);
    } catch (error) {
      handleError(error);
    }
  },
  put: async (endpoint: string, body: any) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(body),
        credentials: 'include', // Important: This sends/receives cookies
      });
      return await handleResponse(response);
    } catch (error) {
      handleError(error);
    }
  },
  patch: async (endpoint: string, body: any) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(body),
        credentials: 'include', // Important: This sends/receives cookies
      });
      return await handleResponse(response);
    } catch (error) {
      handleError(error);
    }
  },
  delete: async (endpoint: string) => {
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include', // Important: This sends/receives cookies
      });
      return await handleResponse(response);
    } catch (error) {
      handleError(error);
    }
  },
};
