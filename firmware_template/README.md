# Firmware Template

Folder này chứa các file dùng chung cho tất cả firmware.

## Cách sử dụng

### Khi tạo firmware mới:
1. Copy `ota_handler.h` vào folder project mới
2. Thêm vào `config_globals.h`:
   ```cpp
   // Sau khi định nghĩa TFT_eSPI tft và TFT_eSprite spr
   #include "ota_handler.h"
   ```
3. Trong `handleCommand()`, thêm:
   ```cpp
   else if (strcmp(command, "UPDATE_FIRMWARE") == 0) {
       handleOTACommand(doc["url"]);
   }
   ```

### Hoặc đơn giản hơn:
Copy toàn bộ folder `Aws_glitch_upgradesp32` làm template, vì nó đã có sẵn code OTA.

## Files

| File | Mô tả |
|------|-------|
| `ota_handler.h` | Module OTA độc lập, chỉ cần include |
