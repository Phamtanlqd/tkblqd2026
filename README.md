# Smart Timetable V3.1 – THPT Chuyên Lê Quý Đôn
Bản V2 + **nhiều tuần / học kỳ / năm học**, công bố cho mọi người xem, so sánh tuần, báo cáo.

## Quy trình mỗi tuần (quản trị)
1. Mở web → **Cài Đặt** → đăng nhập quản trị.
2. Bấm **Nạp file TKB**, chọn *cùng lúc* các file của một hoặc nhiều tuần (giáo viên, lớp, buổi chiều). Hệ thống tự tách theo số tuần trong tiêu đề file ("Tuần 7…"), tự gom đủ 3 loại file cho mỗi tuần. Có thể nạp bổ sung từng file về sau.
3. Vào **Lịch Sử & So Sánh** → tích các tuần cần công bố → **Xuất gói công bố (.zip)**.
4. Giải nén, chép thư mục `weeks` vào `assets/data/` (ghi đè), commit & push lên GitHub (hoặc kéo-thả trên github.com → *Add file → Upload files*).
5. Sau ~1 phút mọi người tải lại trang sẽ thấy các tuần mới. Mở web tự vào **tuần hiện hành theo ngày hôm nay**; ô chọn tuần ở đầu trang để xem tuần khác.

## Người xem
Chọn tuần ở đầu trang; **Lịch Sử & So Sánh** để so sánh hai tuần và xem báo cáo học kỳ / năm học (biểu đồ + Excel).

## Lưu ý
- Năm học lấy từ ngày trong tiêu đề file; **HK1 = tuần 1–18, HK2 = từ tuần 19**.
- Mỗi tuần ~300 KB; 52 tuần ≈ 15 MB (tải từng tuần khi cần).
- Nếu có `assets/data/weeks/index.json` thì web dùng chế độ nhiều tuần; 3 file `assets/data/*.xlsx` cũ chỉ còn là dự phòng (V2).
- Tuần nạp trên máy quản trị nhưng chưa công bố chỉ hiện "(máy này)". **Sao lưu / Khôi phục** để chuyển sang máy khác.
- Đổi mật khẩu quản trị trong `js/config.js`.

## Triển khai GitHub Pages
Push toàn bộ thư mục lên repo → Settings → Pages → branch `main`, `/ (root)`.
