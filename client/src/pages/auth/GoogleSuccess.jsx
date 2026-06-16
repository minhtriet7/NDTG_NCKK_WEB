import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';

export default function GoogleSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const loginStore = useAuthStore((state) => state.login);

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      // Gọi API lấy thông tin chi tiết user bằng token vừa nhận được
      api.get('/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then((userProfile) => {
        // Lưu thông tin user và token vào Zustand store
        if (loginStore) {
          loginStore(userProfile, token);
        }
        // Đăng nhập thành công, chuyển hướng thẳng vào trang chính
        navigate('/');
      })
      .catch((err) => {
        console.error("Lỗi lấy thông tin user sau OAuth:", err);
        navigate('/auth/login?error=ProfileFetchFailed');
      });
    } else {
      navigate('/auth/login?error=NoTokenProvided');
    }
  }, [searchParams, loginStore, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
      <Loader2 className="w-10 h-10 animate-spin text-[#009688] mb-4" />
      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Xác thực tài khoản Google...</h3>
      <p className="text-sm text-slate-500 mt-1">Đang đồng bộ dữ liệu hệ thống, vui lòng đợi trong giây lát.</p>
    </div>
  );
}