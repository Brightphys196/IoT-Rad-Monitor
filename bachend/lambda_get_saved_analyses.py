import json
import boto3
from decimal import Decimal

# Helper để chuyển đổi Decimal của DynamoDB thành float/int
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o) if '.' in str(o) else int(o)
        return super(DecimalEncoder, self).default(o)

# Khởi tạo kết nối tới bảng DynamoDB
table = boto3.resource('dynamodb').Table('Saved_Analyses')

def lambda_handler(event, context):
    try:
        all_items = []
        last_evaluated_key = None

        # Bổ sung vòng lặp để xử lý phân trang (pagination) cho scan
        while True:
            scan_kwargs = {}
            # Nếu có LastEvaluatedKey từ lần quét trước, hãy sử dụng nó để bắt đầu lần quét tiếp theo
            if last_evaluated_key:
                scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
            
            response = table.scan(**scan_kwargs)
            
            items = response.get('Items', [])
            all_items.extend(items)
            
            # Kiểm tra xem DynamoDB có còn dữ liệu để trả về không
            last_evaluated_key = response.get('LastEvaluatedKey', None)
            if not last_evaluated_key:
                break # Thoát khỏi vòng lặp nếu đã lấy hết dữ liệu

        # Sắp xếp tất cả các mục theo thời gian lưu, mới nhất ở trên cùng
        sorted_items = sorted(all_items, key=lambda x: x.get('savedAt', 0), reverse=True)

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            'body': json.dumps(sorted_items, cls=DecimalEncoder)
        }
    except Exception as e:
        print(f"Lỗi khi lấy các phân tích đã lưu: {e}")
        return {
            'statusCode': 500,
            'headers': { 'Access-Control-Allow-Origin': '*' },
            'body': json.dumps({'error': 'Không thể lấy các phân tích đã lưu.'})
        }
