import json
import boto3
import time
from decimal import Decimal
from datetime import datetime, timedelta, timezone

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('IoT_Sensor_Data')

OFFLINE_THRESHOLD_SECONDS = 30

# Bảng ánh xạ để chuyển đổi ID từ client sang tên thiết bị trong DynamoDB
STATION_MAP = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
}

def lambda_handler(event, context):
    try:
        # ✨ [SỬA LỖI] Đọc 'station' từ query string, mặc định là 'station_01'
        query_params = event.get('queryStringParameters') or {}
        station_id = query_params.get('station', 'station_01')
        
        # ✨ [SỬA LỖI] Lấy deviceId (Thing Name) tương ứng từ bảng ánh xạ
        device_id = STATION_MAP.get(station_id, STATION_MAP['station_01'])

        print(f"Fetching status for station: {station_id}, deviceId: {device_id}")

        # Lấy bản ghi dữ liệu cuối cùng cho thiết bị được yêu cầu
        response = table.query(
            KeyConditionExpression='deviceId = :id',
            ExpressionAttributeValues={':id': device_id},
            ScanIndexForward=False,
            Limit=1
        )

        items = response.get('Items', [])
        
        status = "offline"
        details = "Chưa có dữ liệu."
        last_seen_timestamp = None

        if items:
            last_item = items[0]
            last_timestamp = int(last_item.get('timestamp', 0))
            last_seen_timestamp = last_timestamp
            current_timestamp = int(time.time())

            # Cài đặt múi giờ UTC+7
            tz_vietnam = timezone(timedelta(hours=7))
            last_seen_datetime = datetime.fromtimestamp(last_timestamp, tz_vietnam)
            formatted_time = last_seen_datetime.strftime('%H:%M:%S %d-%m-%Y')

            if (current_timestamp - last_timestamp) > OFFLINE_THRESHOLD_SECONDS:
                status = "offline"
                details = f"Lần cuối hoạt động: {formatted_time}."
            else:
                status = "online"
                details = "Thiết bị đang hoạt động."

        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*'},
            # ✨ [CẢI TIẾN] Trả về một cấu trúc JSON đầy đủ thông tin
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
