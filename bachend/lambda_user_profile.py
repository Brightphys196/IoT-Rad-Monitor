import json
import boto3 # type: ignore
import os
from datetime import datetime, timedelta, timezone

# Khởi tạo client Cognito
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1')
dynamodb_client = boto3.resource('dynamodb', region_name='ap-southeast-1')

# ✨ [MỚI] Lấy tên bảng từ biến môi trường
UPGRADE_REQUESTS_TABLE_NAME = os.environ.get('UPGRADE_REQUESTS_TABLE')

def create_cors_response(status_code, body):
    # ... (giữ nguyên)
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS, GET, PUT'
        },
        'body': json.dumps(body)
    }

def lambda_handler(event, context):
    # ... (giữ nguyên phần đầu)
    http_method = event.get('requestContext', {}).get('http', {}).get('method')
    
    # Xử lý CORS Preflight
    if http_method == 'OPTIONS':
        return create_cors_response(200, {})
        
    try:
        headers = event.get('headers', {})
        auth_header = headers.get('authorization', headers.get('Authorization', ''))
        
        if not auth_header.startswith('Bearer '):
            return create_cors_response(401, {'error': 'Invalid authorization header. Missing Bearer token.'})
        
        access_token = auth_header.split(' ')[1]
        
        if not access_token:
             return create_cors_response(401, {'error': 'Access token is missing.'})

        # --- ✨ [LOẠI BỎ] XỬ LÝ YÊU CẦU GET ---
        # Logic GET đã được chuyển sang client-side (giải mã idToken)
        # if http_method == 'GET':
        #     user = cognito_client.get_user(AccessToken=access_token)
        #     ...

        # --- XỬ LÝ YÊU CẦU PUT (CẬP NHẬT HỒ SƠ / ĐỔI MẬT KHẨU) ---
        if http_method == 'PUT':
            body = json.loads(event.get('body', '{}'))
            action = body.get('action')

            if action == 'CHANGE_PASSWORD':
                old_password = body.get('oldPassword')
                new_password = body.get('newPassword')
                
                if not old_password or not new_password:
                    return create_cors_response(400, {'error': 'Mật khẩu cũ và mới là bắt buộc'})
                
                cognito_client.change_password(
                    PreviousPassword=old_password,
                    ProposedPassword=new_password,
                    AccessToken=access_token
                )
                return create_cors_response(200, {'message': 'Đổi mật khẩu thành công'})

            elif action == 'UPDATE_ATTRIBUTES':
                attributes = []
                
                # Cognito phân biệt thuộc tính chuẩn và thuộc tính tùy chỉnh
                if 'name' in body:
                    attributes.append({'Name': 'name', 'Value': body['name']})
                if 'birthdate' in body:
                    attributes.append({'Name': 'birthdate', 'Value': body['birthdate']})
                if 'gender' in body:
                    attributes.append({'Name': 'gender', 'Value': body['gender']})
                if 'phone_number' in body:
                    # Đảm bảo SĐT có mã quốc gia (+84)
                    phone = body['phone_number']
                    if not phone.startswith('+'):
                        return create_cors_response(400, {'error': 'Số điện thoại phải ở định dạng E.164 (ví dụ: +84123456789)'})
                    attributes.append({'Name': 'phone_number', 'Value': phone})
                
                cognito_client.update_user_attributes(
                    UserAttributes=attributes,
                    AccessToken=access_token
                )
                return create_cors_response(200, {'message': 'Cập nhật hồ sơ thành công'})
            
            # ✨ [MỚI] Xử lý yêu cầu nâng cấp gói
            elif action == 'REQUEST_UPGRADE':
                if not UPGRADE_REQUESTS_TABLE_NAME:
                    return create_cors_response(500, {'error': 'Chức năng chưa được cấu hình (thiếu UPGRADE_REQUESTS_TABLE).'})

                requested_plan = body.get('plan')
                if not requested_plan:
                    return create_cors_response(400, {'error': 'Thiếu thông tin gói yêu cầu (plan).'})

                user = cognito_client.get_user(AccessToken=access_token)
                user_id = user['Username']
                user_attributes = {attr['Name']: attr['Value'] for attr in user['UserAttributes']}
                
                table = dynamodb_client.Table(UPGRADE_REQUESTS_TABLE_NAME)
                table.put_item(
                    Item={
                        'userId': user_id,
                        'email': user_attributes.get('email'),
                        'currentPlan': user_attributes.get('custom:user_plan', 'Free'),
                        'requestedPlan': requested_plan,
                        'requestDate': datetime.utcnow().isoformat(),
                        'status': 'pending' # Trạng thái ban đầu
                    }
                )
                return create_cors_response(200, {'message': f'Đã gửi yêu cầu nâng cấp lên gói {requested_plan}. Vui lòng chờ quản trị viên phê duyệt.'})

            return create_cors_response(400, {'error': 'Hành động không hợp lệ'})
            
        # Nếu không phải PUT hoặc OPTIONS
        return create_cors_response(405, {'error': f'Phương thức {http_method} không được hỗ trợ.'})

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'})
    except cognito_client.exceptions.PasswordResetRequiredException:
        return create_cors_response(401, {'error': 'Mật khẩu đã bị admin reset, vui lòng kiểm tra email.'})
    except cognito_client.exceptions.InvalidPasswordException as e:
         return create_cors_response(400, {'error': f'Mật khẩu mới không hợp lệ: {e}'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})
