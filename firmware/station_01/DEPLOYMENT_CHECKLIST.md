# Checklist Triển Khai OTA - Trạm 1

## ✅ Đã hoàn thành
- [x] Code ESP32 với OTA handler (`config_globals.h`)
- [x] Folder lưu firmware (`firmware/station_01/`)
- [x] Admin Panel có UI Firmware
- [x] Backend Lambda gửi lệnh UPDATE_FIRMWARE

## 📋 Cần thực hiện trước khi flash USB

### 1. Cập nhật WiFi (nếu cần)
File: `ESP8266_Station_1/Aws_glitch/secrets.h`
```cpp
const char WIFI_SSID[] = "TEN_WIFI_TRUONG";     // ← Đổi thành WiFi trường
const char WIFI_PASSWORD[] = "MAT_KHAU_WIFI";   // ← Đổi password
```

### 2. Kiểm tra Thing Name
Đảm bảo `THINGNAME` khớp với AWS IoT Console:
```cpp
#define THINGNAME "ESP8266_Station_1"
```

### 3. Flash code qua USB
1. Mở Arduino IDE
2. Chọn Board: ESP32 Dev Module
3. Chọn Port USB
4. Upload

---

## 🚀 Sau khi flash USB thành công

### Test OTA từ Admin Panel
1. Admin Panel → Điều khiển Trạm → Station 01
2. Tab "Firmware" → Upload file `.bin` hoặc nhập URL
3. Xem màn hình TFT hiển thị tiến trình

### Test các lệnh khác
- **RESET**: Restart thiết bị
- **INTERVAL**: Thay đổi tần suất gửi dữ liệu

---

## 📁 Cấu trúc files

```
DOAN/
├── ESP8266_Station_1/Aws_glitch/
│   ├── Aws_glitch.ino          # Main sketch
│   ├── config_globals.h        # Code chính (đã thêm OTA)
│   └── secrets.h               # WiFi & AWS credentials
│
├── firmware/station_01/
│   ├── version.json            # Theo dõi version
│   └── (firmware.bin)          # Upload sau khi build
│
└── .agent/workflows/
    └── ota-update.md           # Hướng dẫn quy trình
```
