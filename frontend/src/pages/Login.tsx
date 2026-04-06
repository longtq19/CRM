import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useAuthStore } from '../context/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { prefetchRoute } from '../utils/prefetchRoutes';
import { Loader2 } from 'lucide-react';

/** Tránh tiêu thụ cùng một JWT hai lần (ví dụ React Strict Mode). */
const consumedStaffCheckTokens = new Set<string>();

const Login = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showSupport, setShowSupport] = useState(false);
  const [staffCheckLoading, setStaffCheckLoading] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('staffCheck');
  });
  const { login, loginWithStaffCheckToken } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    prefetchRoute('/');
  }, []);

  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('staffCheck');
    if (!raw) return;
    if (consumedStaffCheckTokens.has(raw)) return;
    consumedStaffCheckTokens.add(raw);
    navigate({ pathname: '/login', search: '' }, { replace: true });
    setStaffCheckLoading(true);
    setError('');
    void loginWithStaffCheckToken(raw).then((result) => {
      if (result.success) {
        navigate('/', { replace: true });
      } else {
        setError(result.message || 'Không thể đăng nhập kiểm tra.');
        setStaffCheckLoading(false);
        consumedStaffCheckTokens.delete(raw);
      }
    });
  }, [navigate, loginWithStaffCheckToken]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      setError('Vui lòng nhập số điện thoại hợp lệ');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu');
      return;
    }
    const result = await login(phone, password);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.message || 'Đăng nhập thất bại');
    }
  };

  if (staffCheckLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-gray-600">Đang đăng nhập kiểm tra tài khoản…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-card shadow-lg w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png?v=2" alt="ZENO" className="h-24 w-auto mb-4 object-contain" />
          <p className="text-secondary text-center">Đăng nhập hệ thống ZENO</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Số điện thoại</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary mb-4"
              placeholder="Nhập số điện thoại của bạn"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              placeholder="Nhập mật khẩu"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors"
          >
            Đăng nhập
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Quên mật khẩu?{' '}
            <button
              type="button"
              onClick={() => setShowSupport(!showSupport)}
              className="text-primary font-semibold hover:underline"
            >
              Liên hệ hỗ trợ
            </button>
          </p>
        </form>

        {showSupport && (
          <div className="mt-5 space-y-4">
            <div className="border border-gray-100 rounded-xl bg-gray-50 p-4 flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                L
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Nguyễn Đức Long</p>
                <p className="text-xs text-gray-500 mb-2">Quản trị hệ thống</p>
                <p className="text-xs text-gray-600">
                  Zalo: <span className="font-semibold">0989626142</span>
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
