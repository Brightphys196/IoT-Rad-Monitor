---
description: Quy trình cập nhật firmware OTA cho ESP32 Station
---
# Quy Trình Cập Nhật Firmware - Trạm 1

## PHẦN 1: LẦN ĐẦU TIÊN (Flash USB)

### Bước 1: Chuẩn bị WiFi
**File:** `ESP8266_Station_1/Aws_glitch/secrets.h`

```cpp
const char WIFI_SSID[] = "TEN_WIFI_TRUONG";      // ← Đổi
const char WIFI_PASSWORD[] = "MAT_KHAU";         // ← Đổi
```

### Bước 2: Mở Project trong Arduino IDE
**Folder:** `ESP8266_Station_1/Aws_glitch/`
**File mở:** `Aws_glitch.ino`

### Bước 3: Cấu hình Board
- Board: **ESP32 Dev Module**
- Port: Chọn cổng USB của ESP32
- Partition Scheme: **Default 4MB with spiffs**

### Bước 4: Upload
- Click nút Upload (→)
- Chờ hoàn tất

### Bước 5: Xác nhận
- Mở Serial Monitor (115200 baud)
- Thấy: `AWS IoT Connected!` = Thành công ✅

---

## PHẦN 2: CẬP NHẬT QUA OTA (Các lần sau)

### Bước 1: Chỉnh sửa firmware mới
**Folder:** `tram1/Aws_glitch_upgradesp32/`
**File chính:** `config_globals.h`

> ⚠️ **QUAN TRỌNG:** File này đã có sẵn code OTA. Không xóa!

### Bước 2: Build firmware (.bin)
1. Mở Arduino IDE
2. File → Open → `tram1/Aws_glitch_upgradesp32/Aws_glitch_upgradesp32.ino`
3. Sketch → **Export Compiled Binary**
4. File `.bin` xuất hiện trong folder project

### Bước 3: Upload firmware lên internet

**Cách A - GitHub (Repo PUBLIC):**
1. Tạo folder `firmware/` trong repo
2. Upload file `.bin`
3. Lấy URL: `https://raw.githubusercontent.com/{user}/{repo}/main/firmware/xxx.bin`

**Cách B - Admin Panel (Khuyến nghị):**
- Upload trực tiếp qua giao diện (dùng S3, không cần GitHub)

### Bước 4: Gửi lệnh OTA từ Admin Panel
1. Truy cập **Admin Panel**
2. Click **"Điều khiển Trạm"** (sidebar)
3. Tìm **Station 01** → Click **"Cấu hình"**
4. Chọn tab **"Firmware"**
5. **Cách A:** Kéo thả file `.bin` vào vùng upload
   **Cách B:** Nhập URL GitHub raw
6. Click **"Cập nhật Firmware"**

### Bước 5: Theo dõi
**Trên màn hình TFT của ESP32:**
```
┌─────────────────────┐
│     OTA Update      │
│   Downloading...    │  ← Đang tải
└─────────────────────┘
         ↓
┌─────────────────────┐
│     OTA Update      │
│    Flashing...      │  ← Đang ghi
└─────────────────────┘
         ↓
┌─────────────────────┐
│   OTA Success!      │
│   Restarting...     │  ← Thành công
└─────────────────────┘
```

ESP32 tự restart với firmware mới.

---

## TỔNG KẾT FILES

| Mục đích | Folder/File |
|----------|-------------|
| **Flash USB lần đầu** | `ESP8266_Station_1/Aws_glitch/` |
| **Firmware mới (OTA)** | `tram1/Aws_glitch_upgradesp32/` |
| **Cấu hình WiFi** | `secrets.h` trong mỗi folder |
| **OTA module (tái sử dụng)** | `firmware_template/ota_handler.h` |

---

## XỬ LÝ LỖI

| Lỗi | Nguyên nhân | Giải pháp |
|-----|-------------|-----------|
| HTTP 404 | URL sai | Kiểm tra lại URL GitHub raw |
| HTTP 403 | Repo private | Chuyển sang public hoặc dùng upload file |
| Không nhận lệnh | Không subscribe topic | Kiểm tra `connectAWS()` có subscribe control topic |
| OTA Failed | Firmware quá lớn | Dùng partition scheme lớn hơn |
