import json
import boto3 # type: ignore
import os
import uuid
from botocore.exceptions import ClientError # type: ignore

# Khởi tạo client S3 và Cognito
s3_client = boto3.client('s3', region_name='ap-southeast-1')
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1')

# Lấy tên Bucket từ Biến Môi trường
AVATAR_BUCKET_NAME = os.environ.get('AVATAR_BUCKET_NAME')
USER_POOL_ID = os.environ.get('USER_POOL_ID') # ✨ [MỚI] Thêm biến này

def create_cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS, POST'
        },
        'body': json.dumps(body)
    }

def is_admin(access_token):
    """Kiểm tra xem user có phải admin không"""
    try:
        user = cognito_client.get_user(AccessToken=access_token)
        username = user['Username']
        groups_resp = cognito_client.admin_list_groups_for_user(
            UserPoolId=USER_POOL_ID, Username=username
        )
        groups = [g['GroupName'] for g in groups_resp.get('Groups', [])]
        return 'admin' in groups, username
    except:
        return False, None

def lambda_handler(event, context):
    http_method = event.get('requestContext', {}).get('http', {}).get('method')
    
    # Xử lý CORS Preflight
    if http_method == 'OPTIONS':
        return create_cors_response(200, {})
        
    if not AVATAR_BUCKET_NAME:
        return create_cors_response(500, {'error': 'Hàm Lambda chưa được cấu hình (thiếu AVATAR_BUCKET_NAME).'})

    try:
        headers = event.get('headers', {})
        auth_header = headers.get('authorization', headers.get('Authorization', ''))
        access_token = auth_header.split(' ')[1]
        
        body = json.loads(event.get('body', '{}'))
        file_name = body.get('fileName')
        file_type = body.get('fileType')

        if not file_name or not file_type:
            return create_cors_response(400, {'error': 'Thiếu fileName hoặc fileType.'})

        # ✨ [MỚI] Kiểm tra loại file để chọn thư mục
        folder = 'avatars'
        is_firmware = file_name.endswith('.bin')
        
        # Kiểm tra quyền Admin nếu upload firmware
        is_user_admin, username = is_admin(access_token)
        
        if is_firmware:
            if not is_user_admin:
                return create_cors_response(403, {'error': 'Only Admin can upload firmware'})
            folder = 'firmware'
        elif not username:
             # Logic cũ cho user thường upload avatar
             user = cognito_client.get_user(AccessToken=access_token)
             username = user['Username']

        # Tạo một tên tệp duy nhất để tránh trùng lặp
        file_extension = file_name.split('.')[-1]
        unique_file_key = f"{folder}/{username}/{uuid.uuid4()}.{file_extension}"
        
        # Nếu là firmware, có thể bỏ username để dễ quản lý
        if is_firmware:
             unique_file_key = f"firmware/{uuid.uuid4()}.bin"

        # 3. Tạo Presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': AVATAR_BUCKET_NAME,
                'Key': unique_file_key,
                'ContentType': file_type
            },
            ExpiresIn=300  # URL có hiệu lực trong 5 phút
        )
        
        # 4. Trả về URL tải lên (cho frontend) và URL truy cập (để lưu vào Cognito)
        return create_cors_response(200, {
            'uploadURL': presigned_url,
            'finalURL': f"https://{AVATAR_BUCKET_NAME}.s3.amazonaws.com/{unique_file_key}"
        })

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Token không hợp lệ.'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})
