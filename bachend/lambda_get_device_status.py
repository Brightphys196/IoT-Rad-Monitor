import json
import boto3
import time
from decimal import Decimal
from datetime import datetime, timedelta, timezone

dynamodb = boto3.resource('dynamodb')
# Sử dụng bảng DeviceStatus chuyên dụng và hiệu quả hơn
table = dynamodb.Table('DeviceStatus')

# Ngưỡng thời gian (giây) để coi một thiết bị là ngoại tuyến
OFFLINE_THRESHOLD_SECONDS = 30 

# Bổ sung Trạm 3-4 vào bảng ánh xạ
STATION_MAP = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
}

def lambda_handler(event, context):
    try:
        # Đọc 'station' từ query string, mặc định là 'station_01'
        query_params = event.get('queryStringParameters') or {}
        station_id = query_params.get('station', 'station_01')
        
        # Lấy deviceId (Thing Name) tương ứng từ bảng ánh xạ
        device_id = STATION_MAP.get(station_id, STATION_MAP['station_01'])

        print(f"Fetching status for station: {station_id}, deviceId: {device_id}")

        response = table.get_item(Key={'deviceId': device_id})
        
        item = response.get('Item')
        
        status = "offline"
        details = "Không tìm thấy thông tin."
        last_seen_timestamp = None

        if item:
            last_seen = int(item.get('lastSeen', 0))
            # Xử lý trường hợp timestamp là mili giây
            if last_seen > time.time() * 2: 
                last_seen = last_seen / 1000
            
            last_seen_timestamp = last_seen
            current_time = int(time.time())
            
            tz_vietnam = timezone(timedelta(hours=7))
            last_seen_datetime = datetime.fromtimestamp(last_seen, tz_vietnam)
            formatted_time = last_seen_datetime.strftime('%H:%M:%S %d-%m-%Y')

            if (current_time - last_seen) > OFFLINE_THRESHOLD_SECONDS:
                status = "offline"
                details = f"Lần cuối hoạt động: {formatted_time}."
            else:
                status = "online"
                details = "Thiết bị đang hoạt động."

        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'status': status, 
                'details': details,
                'deviceId': device_id,
                'lastSeen': last_seen_timestamp 
            })
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'error': str(e)})
        }

