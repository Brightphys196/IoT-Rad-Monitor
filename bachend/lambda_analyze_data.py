import json
import os
import urllib.request
import urllib.error # ✨ [SỬA LỖI] Import thư viện cần thiết để bắt lỗi HTTP
import boto3 # type: ignore
import gzip
import base64
from decimal import Decimal
import time
from boto3.dynamodb.conditions import Key # type: ignore # ✨ [CẢI TIẾN] Import Key để xây dựng truy vấn
from datetime import datetime

# =================================================================
#                      KHỞI TẠO CLIENT & CẤU HÌNH
# =================================================================
# Biến môi trường
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY') # ✨ [SỬA LỖI] Lấy API key từ biến môi trường
GEMINI_MODEL = "gemini-2.5-flash"

# DynamoDB
dynamodb = boto3.resource('dynamodb')
sensor_table = dynamodb.Table('IoT_Sensor_Data')

# Ánh xạ ID từ frontend (cũ) sang ID của DynamoDB
STATION_MAP = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
}

# Ánh xạ ngược từ DynamoDB sang frontend (cũ)
REVERSE_STATION_MAP = {v: k for k, v in STATION_MAP.items()}

# =================================================================
#                      CÁC HÀM TIỆN ÍCH
# =================================================================
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def create_cors_response(status_code, body):
    # ✨ [CẢI TIẾN] Nén dữ liệu nếu body lớn để tránh lỗi payload size
    json_body = json.dumps(body, cls=DecimalEncoder)
    
    # Nén payload
    gzipped_body = gzip.compress(json_body.encode('utf-8'))
    
    # Encode Base64 để gửi qua API Gateway
    base64_encoded_body = base64.b64encode(gzipped_body).decode('utf-8')

    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip' # Báo cho trình duyệt biết nội dung đã được nén
    }

    return { 'statusCode': status_code, 'headers': headers, 'body': base64_encoded_body, 'isBase64Encoded': True }

# =================================================================
#                      HANDLER CHÍNH (BỘ ĐỊNH TUYẾN)
# =================================================================
def lambda_handler(event, context):
    try:
        # Xử lý yêu cầu OPTIONS (CORS preflight)
        http_method = event.get('requestContext', {}).get('http', {}).get('method')
        if http_method == 'OPTIONS':
            return create_cors_response(200, {})
            
        body = json.loads(event.get('body', '{}'))

        # ✨ [BỘ ĐỊNH TUYẾN] Kiểm tra nội dung body để quyết định hành động
        if 'prompt' in body:
            # Đây là yêu cầu Phân tích AI
            print("Routing to AI Analysis...")
            return handle_ai_analysis(body)
        elif 'startDate' in body and 'endDate' in body and 'stations' in body:
            # Đây là yêu cầu Lấy Dữ liệu
            print("Routing to Data Fetching...")
            return handle_data_fetching(body)
        else:
            # Yêu cầu không hợp lệ
            return create_cors_response(400, {'error': 'Invalid request body. Missing "prompt" or "startDate/endDate/stations".'})
            
    except Exception as e:
        print(f"Error in main handler: {e}")
        return create_cors_response(500, {'error': str(e)})

# =================================================================
#                      HÀM XỬ LÝ 1: PHÂN TÍCH AI
# =================================================================
def handle_ai_analysis(body):
    if not GEMINI_API_KEY:
        print("Lỗi: Biến môi trường GEMINI_API_KEY chưa được thiết lập.")
        return create_cors_response(500, {'message': 'Dịch vụ AI chưa được cấu hình.'})

    prompt = body.get('prompt')
    if not prompt:
        return create_cors_response(400, {'message': "Thiếu 'prompt' trong nội dung yêu cầu."})

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    data = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(api_url, data=data, headers={'Content-Type': 'application/json'})
    
    with urllib.request.urlopen(req) as response:
        response_body = response.read().decode('utf-8')
        result = json.loads(response_body)
        if response.status != 200:
             print(f"Lỗi từ Gemini API: {result}")
             raise Exception(f"Gemini API Error: {result.get('error', {}).get('message', 'Unknown error')}")

    analysis_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', "Không nhận được phản hồi hợp lệ từ AI.")
    
    return create_cors_response(200, {
        'analysis': analysis_text.replace('```html', '').replace('```', '').strip()
    })

# =================================================================
#                      HÀM XỬ LÝ 2: LẤY DỮ LIỆU
# =================================================================
def handle_data_fetching(body):
    start_date_str = body.get('startDate')
    end_date_str = body.get('endDate')
    stations = body.get('stations', [])

    # Chuyển đổi chuỗi ngày tháng ISO sang timestamp (số giây)
    # ✨ [SỬA LỖI] Chuyển đổi timestamp (mili-giây) từ frontend thành số giây
    # Frontend gửi timestamp, không phải chuỗi ISO
    start_timestamp = int(start_date_str / 1000)
    end_timestamp = int(end_date_str / 1000)

    # ✨ [CẢI TIẾN] Sử dụng ThreadPoolExecutor để truy vấn song song, tăng tốc độ đáng kể
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def query_station_data(station_id_frontend):
        device_id = STATION_MAP.get(station_id_frontend)
        if not device_id:
            print(f"Bỏ qua trạm không xác định: {station_id_frontend}")
            return []

        print(f"Bắt đầu truy vấn cho {device_id} từ {start_timestamp} đến {end_timestamp}")
        items = []
        last_evaluated_key = None
        
        while True:
            query_kwargs = {
                'KeyConditionExpression': 'deviceId = :did AND #ts BETWEEN :start AND :end',
                'ExpressionAttributeNames': {'#ts': 'timestamp'},
                'ExpressionAttributeValues': {
                    ':did': device_id,
                    ':start': start_timestamp,
                    ':end': end_timestamp
                },
            }
            if last_evaluated_key:
                query_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = sensor_table.query(**query_kwargs)
            items.extend(response.get('Items', []))
            
            last_evaluated_key = response.get('LastEvaluatedKey', None)
            if not last_evaluated_key:
                break
        
        # Chuyển đổi dữ liệu ngay sau khi truy vấn xong cho một trạm
        return [{
            'timestamp': item['timestamp'] * 1000, 
            'station': REVERSE_STATION_MAP.get(item['deviceId']), 
            'temperature': item.get('temperature'),
            'humidity': item.get('humidity'),
            'radiation': item.get('uSv') 
        } for item in items]

    with ThreadPoolExecutor(max_workers=len(stations) or 1) as executor:
        # Gộp kết quả từ tất cả các luồng
        all_readings = [item for future in as_completed([executor.submit(query_station_data, s) for s in stations]) for item in future.result()]

    all_readings.sort(key=lambda x: x['timestamp'])

    return create_cors_response(200, {'readings': all_readings})
