import dotenv from 'dotenv';

dotenv.config({ override: true });

/** Dokploy/UI đôi khi ghép mật khẩu có @ thành @@ trước host — URL sai; @ trong mật khẩu phải là %40. */
const dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.includes('@@')) {
  console.warn(
    '[HCRM] DATABASE_URL chứa "@@" — thường sai định dạng. Ký tự @ trong mật khẩu phải ghi là %40; chỉ một @ trước hostname. Ví dụ: postgresql://postgres:MatKhau%40@host:5432/DB'
  );
}
