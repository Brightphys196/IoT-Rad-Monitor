import json
import boto3
import os

# Khởi tạo client Cognito
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

        # Thực hiện xác thực (đăng nhập)
        response = cognito_client.initiate_auth(
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': email,
                'PASSWORD': password,
            },
            ClientId=CLIENT_ID
        )

        # Gửi Token về cho client
        return create_cors_response(200, {
            'message': 'Đăng nhập thành công!',
            'idToken': response['AuthenticationResult']['IdToken'],
            'accessToken': response['AuthenticationResult']['AccessToken'],
            'refreshToken': response['AuthenticationResult']['RefreshToken']
        })

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Sai email hoặc mật khẩu.'})
    except cognito_client.exceptions.UserNotConfirmedException:
        return create_cors_response(401, {'error': 'Tài khoản chưa được xác thực. Vui lòng kiểm tra email.'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})
