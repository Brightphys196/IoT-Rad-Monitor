import json
import boto3
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('IoT_Sensor_Data')

# Bổ sung Trạm 3-4 vào bảng ánh xạ
STATION_MAP = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
}

def lambda_handler(event, context):
    try:
        # Đọc tham số 'station' từ query string, nếu không có thì mặc định là 'station_01'
        query_params = event.get('queryStringParameters') or {}
        station_id = query_params.get('station', 'station_01')

        # Ánh xạ station_id sang deviceId (thing_name) để truy vấn đúng thiết bị
        thing_name = STATION_MAP.get(station_id, STATION_MAP['station_01'])
        
        print(f"Querying data for station: {station_id}, mapped to deviceId: {thing_name}")

        # Truy vấn dữ liệu chỉ cho deviceId được yêu cầu
        response = table.query(
            KeyConditionExpression='deviceId = :id',
            ExpressionAttributeValues={':id': thing_name},
            ScanIndexForward=False,  # Lấy dữ liệu mới nhất trước
            Limit=50                 # Giới hạn 50 điểm dữ liệu gần nhất
        )
         
        items = response.get('Items', [])
         
        # Chuyển đổi định dạng Decimal sang số thông thường
        for item in items:
            for key, value in item.items():
                if isinstance(value, Decimal):
                    item[key] = float(value) if '.' in str(value) else int(value)
            
        # Sắp xếp lại theo thứ tự thời gian cũ -> mới
        items.reverse()

        return {
            'statusCode': 200,
            'headers': { 
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            'body': json.dumps(items)
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            'statusCode': 500,
            'headers': { 
                'Access-Control-Allow-Origin': '*' 
            },
            'body': json.dumps({'error': str(e)})
        }
