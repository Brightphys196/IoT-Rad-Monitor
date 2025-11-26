import json
import boto3 # type: ignore
import os
import time
from datetime import datetime, timezone
from botocore.exceptions import ClientError # type: ignore # Import ClientError

# Khởi tạo client Cognito và DynamoDB
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1')
dynamodb = boto3.resource('dynamodb', region_name='ap-southeast-1')

# Lấy thông tin từ Biến Môi trường
USER_POOL_ID = os.environ.get('USER_POOL_ID')
UPGRADE_REQUESTS_TABLE_NAME = os.environ.get('UPGRADE_REQUESTS_TABLE') # Tên bảng: UserUpgradeRequests

def create_cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            # ✨ [CẬP NHẬT] Thêm 'GET' vào các phương thức được phép
            'Access-Control-Allow-Methods': 'OPTIONS, POST, GET' 
        },
        'body': json.dumps(body)
    }

def get_user_id_from_token(access_token):
    """Hàm trợ giúp chỉ để lấy UserID (username) từ token."""
    user = cognito_client.get_user(AccessToken=access_token)
    return user['Username']

def lambda_handler(event, context):
    http_method = event.get('requestContext', {}).get('http', {}).get('method')
    
    # Xử lý CORS Preflight
    if http_method == 'OPTIONS':
        return create_cors_response(200, {})
        
    if not USER_POOL_ID or not UPGRADE_REQUESTS_TABLE_NAME:
        return create_cors_response(500, {'error': 'Hàm Lambda chưa được cấu hình (thiếu Biến Môi trường).'})

    try:
        headers = event.get('headers', {})
        auth_header = headers.get('authorization', headers.get('Authorization', ''))
        access_token = auth_header.split(' ')[1]

        # ✨ [CẬP NHẬT] Định tuyến dựa trên phương thức HTTP
        
        # --- XỬ LÝ YÊU CẦU GET (Kiểm tra trạng thái) ---
        if http_method == 'GET':
            user_id = get_user_id_from_token(access_token)
            table = dynamodb.Table(UPGRADE_REQUESTS_TABLE_NAME)
            
            try:
                response = table.get_item(Key={'userId': user_id})
                item = response.get('Item')
                if item:
                    # Tìm thấy một yêu cầu đang chờ
                    return create_cors_response(200, item)
                else:
                    # Không tìm thấy yêu cầu
                    return create_cors_response(200, {'status': 'not_found'})
            except ClientError as e:
                print(f"Lỗi DynamoDB GetItem: {e}")
                return create_cors_response(500, {'error': 'Không thể kiểm tra trạng thái yêu cầu.'})

        # --- XỬ LÝ YÊU CẦU POST (Tạo yêu cầu mới) ---
        elif http_method == 'POST':
            body = json.loads(event.get('body', '{}'))
            plan_name = body.get('plan')

            if not plan_name:
                return create_cors_response(400, {'error': 'Thiếu tên gói (plan) trong yêu cầu.'})

            # Lấy thông tin người dùng (UserID và Email)
            user = cognito_client.get_user(AccessToken=access_token)
            user_id = user['Username']
            user_email = ''
            for attr in user['UserAttributes']:
                if attr['Name'] == 'email':
                    user_email = attr['Value']
                    break
            
            # Ghi yêu cầu vào bảng UserUpgradeRequests
            table = dynamodb.Table(UPGRADE_REQUESTS_TABLE_NAME)
            table.put_item(
                Item={
                    'userId': user_id, # Khóa phân vùng
                    'plan': plan_name,
                    'email': user_email,
                    'requestDate': datetime.now(timezone.utc).isoformat(),
                    'status': 'pending' # Trạng thái chờ xử lý
                }
            )
            return create_cors_response(200, {'message': 'Yêu cầu nâng cấp đã được gửi thành công.'})
        
        else:
            return create_cors_response(405, {'error': f'Phương thức {http_method} không được hỗ trợ.'})

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Token không hợp lệ hoặc đã hết hạn.'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})