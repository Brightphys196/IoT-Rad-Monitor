// --- CÁC THƯ VIỆN CẦN THIẾT ---
#include <Adafruit_SSD1306.h> // Thư viện OLED bạn đã dùng thành công
#include <Wire.h>            // Thư viện giao tiếp I2C
#include "DHT.h"             // Thư viện cảm biến DHT của Adafruit

// --- CÀI ĐẶT CHO MÀN HÌNH OLED ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET     -1
#define SCREEN_ADDRESS 0x3C
#define OLED_SDA 14 // GPIO 14 (thường là chân D5)
#define OLED_SCL 12 // GPIO 12 (thường là chân D6)

// --- CÀI ĐẶT CHO CẢM BIẾN DHT ---
#define DHTPIN 13 // Chân D7 tương ứng GPIO 13
#define DHTTYPE DHT11

// --- KHỞI TẠO CÁC ĐỐI TƯỢNG ---
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
DHT dht(DHTPIN, DHTTYPE);


// HÀM HIỂN THỊ OLED ĐÃ ĐƯỢC THIẾT KẾ LẠI CHO GỌN GÀNG
void handle_oled(float temp, float humi) {
  display.clearDisplay(); // Xóa màn hình trước khi vẽ
  
  // Dùng một cỡ chữ duy nhất là 1 cho tất cả để không bị tràn
  display.setTextSize(1); 
  display.setTextColor(SSD1306_WHITE);

  // ---- Hiển thị Nhiệt độ ----
  display.setCursor(0, 10); // Đặt con trỏ ở vị trí Dòng 1
  display.print("NHIET DO:");
  
  display.setCursor(70, 10); // Đặt con trỏ dịch sang phải
  display.print(temp);
  display.print(" ");
  display.cp437(true);    // Kích hoạt bộ ký tự đặc biệt
  display.write(167);     // Vẽ biểu tượng độ 
  display.print("C");
  

  // ---- Hiển thị Độ ẩm ----
  display.setCursor(0, 40); // Đặt con trỏ ở vị trí Dòng 2
  display.print("DO AM:");

  display.setCursor(70, 40); // Đặt con trỏ dịch sang phải
  display.print(humi);
  display.print(" %");

  // Gửi toàn bộ những gì đã vẽ ra màn hình
  display.display();
}


void setup() {
  Serial.begin(115200);

  // Khởi tạo I2C với đúng chân SDA, SCL cho board của bạn
  Wire.begin(OLED_SDA, OLED_SCL);

  // Khởi tạo màn hình
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) {
    Serial.println(F("Loi khoi tao SSD1306"));
    for(;;); 
  }
  
  // Khởi tạo cảm biến
  dht.begin();

  // Hiển thị màn hình chờ
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(20, 25);
  display.println("READY!");
  display.display();
  delay(1000);
}

void loop() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("Loi doc du lieu tu cam bien DHT!");
  } else {
    // Nếu không có lỗi, gọi hàm để vẽ dữ liệu lên màn hình
    handle_oled(temperature, humidity);
  }

  delay(2000); // Chờ 2 giây cho lần đọc tiếp theo
}