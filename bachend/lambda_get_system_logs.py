import json
import boto3
from decimal import Decimal

# =================================================================
#                      KHỞI TẠO CLIENT & CẤU HÌNH
# =================================================================
dynamodb = boto3.resource('dynamodb')
system_logs_table = dynamodb.Table('SystemLogs')

# Bổ sung Trạm 3-4 vào bảng ánh xạ
STATION_MAP = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
}

# =================================================================
#                      CÁC HÀM TIỆN ÍCH
# =================================================================

class DecimalEncoder(json.JSONEncoder):
    """Hàm tiện ích để chuyển đổi kiểu dữ liệu Decimal của DynamoDB sang JSON."""
    def default(self, o):
        if isinstance(o, Decimal):
            # Chuyển đổi Decimal thành float hoặc int
            return float(o) if '.' in str(o) else int(o)
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

# =================================================================
#                      HANDLER CHÍNH
# =================================================================

def lambda_handler(event, context):
    """
    Hàm chính của Lambda, chịu trách nhiệm lấy và trả về nhật ký hệ thống.
    Hỗ trợ lọc theo từng trạm hoặc lấy tất cả.
    """
    try:
        query_params = event.get('queryStringParameters') or {}
        station_id_filter = query_params.get('station', 'all') # Mặc định là 'all' nếu không có tham số

        device_ids_to_query = []

        # Quyết định thiết bị nào cần truy vấn dựa trên bộ lọc
        if station_id_filter in STATION_MAP:
            # Nếu yêu cầu một trạm cụ thể
            device_ids_to_query.append(STATION_MAP[station_id_filter])
            print(f"Filtering logs for a single station: {station_id_filter}")
        else:
            # Nếu là 'all' hoặc không có tham số, lấy tất cả
            device_ids_to_query = list(STATION_MAP.values())
            print("Fetching logs for all stations...")

        all_items = []

        # Lặp qua danh sách thiết bị cần truy vấn
        for device_id in device_ids_to_query:
            print(f"Querying logs for {device_id}...")
            # Lấy 50 log mới nhất cho mỗi thiết bị
            response = system_logs_table.query(
                KeyConditionExpression='deviceId = :id',
                ExpressionAttributeValues={':id': device_id},
                ScanIndexForward=False,
                Limit=50
            )
            items = response.get('Items', [])
            all_items.extend(items)
        
        # Sắp xếp tất cả các mục đã gộp lại theo timestamp giảm dần
        sorted_items = sorted(all_items, key=lambda x: x.get('timestamp', 0), reverse=True)
        
        # Giới hạn tổng số nhật ký trả về là 100 để tránh quá tải
        final_items = sorted_items[:100]
        
        return create_cors_response(200, final_items)
        
    except Exception as e:
        print(f"Error getting system logs: {e}")
        return create_cors_response(500, {'error': str(e)})
