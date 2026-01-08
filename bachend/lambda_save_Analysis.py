import json
import boto3
import uuid
import time
from decimal import Decimal

# Khởi tạo kết nối
dynamodb = boto3.resource('dynamodb')
# Đảm bảo tên bảng này khớp với tên bảng trên AWS DynamoDB của bạn
table = dynamodb.Table('Saved_Analyses') 

def lambda_handler(event, context):
    """
    Hàm này xử lý các yêu cầu API để LƯU, CẬP NHẬT, và XÓA các phân tích của AI.
    Nó hoạt động như một bộ định tuyến dựa trên phương thức HTTP.
    """
    
    # Lấy phương thức HTTP từ sự kiện API Gateway
    http_method = event.get('requestContext', {}).get('http', {}).get('method')
    
    # --- PHẦN QUAN TRỌNG: XỬ LÝ YÊU CẦU PREFLIGHT (OPTIONS) CỦA CORS ---
    # Trình duyệt sẽ gửi một yêu cầu OPTIONS trước khi gửi POST/PUT/DELETE thật.
    if http_method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*', # Cho phép mọi nguồn
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Allow-Methods': 'OPTIONS, POST, GET, PUT, DELETE' # Các phương thức cho phép
            }
        }
    
    # --- BỘ ĐỊNH TUYẾN ---
    try:
        if http_method == 'POST':
            return save_analysis(event)
        # Các route khác có thể được thêm vào đây trong tương lai
        # elif http_method == 'PUT':
        #     return update_analysis(event)
        # elif http_method == 'DELETE':
        #     return delete_analysis(event)
        else:
            return create_response(405, {'error': f'Method {http_method} not allowed'})

    except Exception as e:
        print(f"Error in handler: {e}")
        return create_response(500, {'error': str(e)})

def save_analysis(event):
    """Xử lý logic để lưu một phân tích mới."""
    try:
        body = json.loads(event.get('body', '{}'))
        analysis_text = body.get('analysisText')
        data_type = body.get('dataType')

        if not analysis_text or not data_type:
            raise ValueError("Missing analysisText or dataType")

        analysis_id = str(uuid.uuid4())
        current_timestamp = int(time.time())

        table.put_item(
            Item={
                'analysisId': analysis_id, # Partition Key
                'savedAt': current_timestamp, # Sort Key (tùy chọn, nhưng hữu ích)
                'analysisText': analysis_text,
                'dataType': data_type
            }
        )
        
        return create_response(200, {'message': 'Analysis saved successfully', 'analysisId': analysis_id})

    except Exception as e:
        print(f"Error in save_analysis: {e}")
        # Ném lại lỗi để handler chính có thể bắt và trả về lỗi 500
        raise e

# --- CÁC HÀM TIỆN ÍCH ---
def create_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        },
        'body': json.dumps(body)
    }
