/* =====================================================================
 * config.js – Cấu hình quản trị
 * ADMIN_HASH: mã băm SHA-256 của mật khẩu quản trị.
 *  - Mật khẩu mặc định: tkb@2026   (HÃY ĐỔI sau khi triển khai)
 *  - Cách đổi: đăng nhập quản trị → Cài Đặt → "Tạo mã mật khẩu mới",
 *    dán mã nhận được vào ADMIN_HASH bên dưới rồi đẩy file lên GitHub.
 *  - Để trống ('') = không yêu cầu mật khẩu (ai cũng là quản trị).
 * Lưu ý: ứng dụng chạy hoàn toàn phía trình duyệt nên đây là lớp "khóa cửa"
 * chống thao tác nhầm, không thay thế bảo mật máy chủ.
 * ===================================================================== */
export const CONFIG = {
  ADMIN_HASH: '946395d4e7492f8218d67b9f037e5bdb76f75d312a3771809527997d4f476155',
  SESSION_MINUTES: 60,   // đăng nhập quản trị hết hạn sau số phút này
  MAX_FAILS: 5,          // sai quá số lần này sẽ bị khóa tạm thời
  LOCK_SECONDS: 60,
};
