import json
import boto3
import os

# Khởi tạo client Cognito
# region_name cần khớp với vùng (region) của User Pool
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1') 

# Lấy thông tin từ Biến Môi trường
USER_POOL_ID = os.environ.get('USER_POOL_ID')
CLIENT_ID = os.environ.get('CLIENT_ID')

def create_cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'OPTIONS, POST'
        },
        'body': json.dumps(body)
    }

def lambda_handler(event, context):
    # Xử lý CORS Preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return create_cors_response(200, {})

    try:
        body = json.loads(event.get('body', '{}'))
        email = body.get('email')
        password = body.get('password')

        if not email or not password:
            return create_cors_response(400, {'error': 'Email và mật khẩu là bắt buộc.'})

        if not USER_POOL_ID or not CLIENT_ID:
            return create_cors_response(500, {'error': 'Hàm Lambda chưa được cấu hình (thiếu Biến Môi trường).'})

        # Thực hiện đăng ký người dùng trong Cognito
        response = cognito_client.sign_up(
            ClientId=CLIENT_ID,
            Username=email,
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email}
            ]
        )

        return create_cors_response(200, {'message': 'Đăng ký thành công! Vui lòng kiểm tra email để xác thực.'})

    except cognito_client.exceptions.UsernameExistsException:
        return create_cors_response(409, {'error': 'Email này đã tồn tại.'})
    except cognito_client.exceptions.InvalidPasswordException as e:
        return create_cors_response(400, {'error': f'Mật khẩu không hợp lệ: {e}'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})
