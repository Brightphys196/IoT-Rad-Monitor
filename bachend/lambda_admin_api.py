import json
import boto3 # type: ignore
import os
from decimal import Decimal
from boto3.dynamodb.conditions import Attr # type: ignore # ✨ [SỬA LỖI] Import Attr để sử dụng trong FilterExpression
from datetime import datetime, timedelta, timezone

# Khởi tạo client Cognito
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1') 
dynamodb_client = boto3.resource('dynamodb', region_name='ap-southeast-1')

# Lấy User Pool ID từ Biến Môi trường
USER_POOL_ID = os.environ.get('USER_POOL_ID')
UPGRADE_REQUESTS_TABLE_NAME = os.environ.get('UPGRADE_REQUESTS_TABLE')

class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super(DecimalEncoder, self).default(o)

def create_cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS, POST'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def get_user_from_token(auth_header):
    """Xác thực token và kiểm tra xem người dùng có phải là admin không."""
    if not auth_header.startswith('Bearer '):
        raise Exception('Invalid authorization header')
        
    access_token = auth_header.split(' ')[1] 
    
    # Hàm này sử dụng AccessToken để lấy thông tin người dùng
    user = cognito_client.get_user(AccessToken=access_token)
    username = user['Username']
    
    # Lấy thông tin nhóm của người dùng
    user_groups_response = cognito_client.admin_list_groups_for_user(
        UserPoolId=USER_POOL_ID,
        Username=username
    )
    
    groups = [group['GroupName'] for group in user_groups_response.get('Groups', [])]
    
    # Kiểm tra xem người dùng có trong nhóm 'admin' không
    if 'admin' not in groups:
        raise Exception('User is not an admin')
        
    return username

def handle_list_users(body, admin_username):
    """Lấy danh sách tất cả người dùng trong User Pool."""
    paginator = cognito_client.get_paginator('list_users')
    users_list = []
    
    for page in paginator.paginate(UserPoolId=USER_POOL_ID):
        for user in page['Users']:
            attributes = {attr['Name']: attr['Value'] for attr in user.get('Attributes', [])}
            
            # Bỏ qua chính tài khoản admin đang xem
            if user['Username'] == admin_username:
                continue

            users_list.append({
                'id': user['Username'], 
                'email': attributes.get('email', 'N/A'),
                'name': attributes.get('name', 'Chưa cập nhật'),
                'plan': attributes.get('custom:user_plan', 'Free'),
                'joinDate': user['UserCreateDate'].isoformat(),
                'status': 'Enabled' if user['Enabled'] else 'Disabled'
            })
            
    return create_cors_response(200, {'users': users_list})

def handle_update_plan(body, admin_username):
    """Cập nhật gói (plan) của người dùng."""
    user_id = body.get('userId')
    new_plan = body.get('plan')
    
    if not user_id or not new_plan:
        return create_cors_response(400, {'error': 'Thiếu userId hoặc plan'})

    cognito_client.admin_update_user_attributes(
        UserPoolId=USER_POOL_ID,
        Username=user_id,
        UserAttributes=[
            {
                'Name': 'custom:user_plan',
                'Value': new_plan
            }
        ]
    )
    return create_cors_response(200, {'message': 'Cập nhật gói thành công'})

def handle_delete_user(body, admin_username):
    """Xóa một người dùng khỏi User Pool."""
    user_id = body.get('userId')
    if not user_id:
        return create_cors_response(400, {'error': 'Thiếu userId'})

    cognito_client.admin_delete_user(
        UserPoolId=USER_POOL_ID,
        Username=user_id
    )
    return create_cors_response(200, {'message': 'Xóa người dùng thành công'})

def handle_toggle_user_status(body, admin_username):
    """Kích hoạt hoặc vô hiệu hóa một người dùng."""
    user_id = body.get('userId')
    user_action = body.get('userAction') # 'enable' or 'disable'
    
    if not user_id or user_action not in ['enable', 'disable']:
        return create_cors_response(400, {'error': 'Thiếu userId hoặc userAction không hợp lệ'})

    if user_action == 'enable':
        cognito_client.admin_enable_user(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        message = 'Kích hoạt người dùng thành công'
    else: # disable
        cognito_client.admin_disable_user(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        message = 'Vô hiệu hóa người dùng thành công'
        
    return create_cors_response(200, {'message': message})

def handle_list_upgrade_requests(body, admin_username):
    """Lấy danh sách các yêu cầu nâng cấp đang chờ."""
    if not UPGRADE_REQUESTS_TABLE_NAME:
        return create_cors_response(500, {'error': 'Chức năng chưa được cấu hình (thiếu UPGRADE_REQUESTS_TABLE).'})
    
    table = dynamodb_client.Table(UPGRADE_REQUESTS_TABLE_NAME)
    response = table.scan(
        FilterExpression=Attr('status').eq('pending') # ✨ [SỬA LỖI] Sử dụng Attr đã được import
    )
    return create_cors_response(200, {'requests': response.get('Items', [])})

def handle_process_upgrade_request(body, admin_username):
    """Xử lý một yêu cầu nâng cấp (phê duyệt hoặc từ chối)."""
    user_id = body.get('userId')
    new_plan = body.get('plan')
    approved = body.get('approved')

    if not user_id or approved is None:
        return create_cors_response(400, {'error': 'Thiếu userId hoặc trạng thái phê duyệt (approved).'})

    table = dynamodb_client.Table(UPGRADE_REQUESTS_TABLE_NAME)

    if approved:
        if not new_plan:
            return create_cors_response(400, {'error': 'Thiếu thông tin gói mới (plan) khi phê duyệt.'})
        
        # 1. Cập nhật thuộc tính trong Cognito
        cognito_client.admin_update_user_attributes(
            UserPoolId=USER_POOL_ID,
            Username=user_id,
            UserAttributes=[{'Name': 'custom:user_plan', 'Value': new_plan}]
        )
        # 2. Xóa yêu cầu khỏi bảng
        table.delete_item(Key={'userId': user_id})
        message = 'Phê duyệt yêu cầu thành công.'
    else: # Từ chối
        # Chỉ cần xóa yêu cầu
        table.delete_item(Key={'userId': user_id})
        message = 'Từ chối yêu cầu thành công.'
        
    return create_cors_response(200, {'message': message})

def lambda_handler(event, context):
    try:
        http_method = event.get('requestContext', {}).get('http', {}).get('method')
        
        if http_method == 'OPTIONS':
            return create_cors_response(200, {})

        if not USER_POOL_ID:
            return create_cors_response(500, {'error': 'Hàm Lambda chưa được cấu hình (thiếu USER_POOL_ID).'})

        # 1. Xác thực Admin
        headers = event.get('headers', {})
        auth_header = headers.get('authorization', headers.get('Authorization', ''))
        admin_username = get_user_from_token(auth_header) 
        
        # 2. Định tuyến hành động (Action Routing)
        body = json.loads(event.get('body', '{}'))
        action = body.get('action')
        
        if action == 'LIST_USERS':
            return handle_list_users(body, admin_username)
        elif action == 'UPDATE_PLAN':
            return handle_update_plan(body, admin_username)
        elif action == 'DELETE_USER':
            return handle_delete_user(body, admin_username)
        elif action == 'TOGGLE_USER_STATUS':
            return handle_toggle_user_status(body, admin_username)
        elif action == 'LIST_UPGRADE_REQUESTS':
            return handle_list_upgrade_requests(body, admin_username)
        elif action == 'PROCESS_UPGRADE_REQUEST':
            return handle_process_upgrade_request(body, admin_username)
        else:
            return create_cors_response(400, {'error': 'Hành động không hợp lệ.'})

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Token không hợp lệ hoặc không có quyền Admin.'})
    except cognito_client.exceptions.UserNotFoundException:
        return create_cors_response(404, {'error': 'User not found for token.'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})