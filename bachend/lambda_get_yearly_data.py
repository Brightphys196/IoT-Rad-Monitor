import json
import boto3
from decimal import Decimal
from collections import defaultdict

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('DailyAggregates')

# Bảng ánh xạ để chuyển đổi ID từ client sang tên thiết bị trong DynamoDB
STATION_MAP = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
}

class DecimalEncoder(json.JSONEncoder):
    """Hàm tiện ích để chuyển đổi kiểu dữ liệu Decimal của DynamoDB sang JSON."""
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def create_cors_response(status_code, body):
    """Tạo phản hồi HTTP chuẩn với các header CORS cần thiết."""
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def lambda_handler(event, context):
    try:
        query_params = event.get('queryStringParameters') or {}
        # ✨ [SỬA LỖI] Đọc metric và station từ query string
        metric = query_params.get('metric', 'temperature') 
        station_filter = query_params.get('station', 'all')

        # Xác định trường dữ liệu cần lấy trong DynamoDB
        metric_attribute = 'avgTemperature' if metric == 'temperature' else 'avgHumidity'

        device_ids_to_query = []
        if station_filter in STATION_MAP:
            device_ids_to_query.append(STATION_MAP[station_filter])
        else: # 'all'
            device_ids_to_query = list(STATION_MAP.values())

        all_items = []
        # Lặp qua các thiết bị cần truy vấn
        for device_id in device_ids_to_query:
            last_evaluated_key = None
            while True:
                query_kwargs = {
                    'KeyConditionExpression': 'deviceId = :id',
                    'ExpressionAttributeValues': {':id': device_id}
                }
                if last_evaluated_key:
                    query_kwargs['ExclusiveStartKey'] = last_evaluated_key

                response = table.query(**query_kwargs)
                items = response.get('Items', [])
                all_items.extend(items)
                
                last_evaluated_key = response.get('LastEvaluatedKey', None)
                if not last_evaluated_key:
                    break
        
        # ✨ [CẢI TIẾN] Xử lý và tổng hợp dữ liệu
        daily_values = defaultdict(lambda: {'total': 0, 'count': 0})
        
        for item in all_items:
            date = item.get('date')
            value = item.get(metric_attribute)
            if date is not None and value is not None:
                daily_values[date]['total'] += value
                daily_values[date]['count'] += 1

        # Tạo dữ liệu cuối cùng cho heatmap
        heatmap_data = []
        for date, data in daily_values.items():
            heatmap_data.append({
                "date": date,
                "value": float(data['total']) / data['count'] if data['count'] > 0 else 0
            })

        return create_cors_response(200, heatmap_data)

    except Exception as e:
        print(f"Error: {e}")
        return create_cors_response(500, {'error': str(e)})
