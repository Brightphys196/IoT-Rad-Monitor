import json
import boto3 # type: ignore
import os

# Khởi tạo client IoT Data và Cognito
iot_client = boto3.client('iot-data', region_name='ap-southeast-1')
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1')

USER_POOL_ID = os.environ.get('USER_POOL_ID')

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

def verify_admin(auth_header):
    """Xác thực token và đảm bảo người dùng là Admin"""
    if not auth_header.startswith('Bearer '):
        raise Exception('Invalid token')
    access_token = auth_header.split(' ')[1]
    
    # Lấy thông tin user
    user = cognito_client.get_user(AccessToken=access_token)
    username = user['Username']
    
    # Kiểm tra group
    groups_resp = cognito_client.admin_list_groups_for_user(
        UserPoolId=USER_POOL_ID, Username=username
    )
    groups = [g['GroupName'] for g in groups_resp.get('Groups', [])]
    
    if 'admin' not in groups:
        raise Exception('Unauthorized: Admin access required')
    return username

def lambda_handler(event, context):
    # 1. Xử lý CORS
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return create_cors_response(200, {})

    try:
        # 2. Xác thực Admin
        headers = event.get('headers', {})
        auth_header = headers.get('authorization', headers.get('Authorization', ''))
        verify_admin(auth_header)

        # 3. Lấy dữ liệu từ Body
        body = json.loads(event.get('body', '{}'))
        station_id = body.get('stationId')
        command = body.get('command') # RESET, INTERVAL, ALERT, UPDATE_FIRMWARE, SET_WIFI
        payload = body.get('payload', {}) # Các tham số đi kèm (val, url, ssid, pass...)

        if not station_id or not command:
            return create_cors_response(400, {'error': 'Missing stationId or command'})

        # 4. Tạo bản tin MQTT
        # Topic: station/{station_id}/control
        topic = f"station/{station_id}/control"
        
        mqtt_message = {
            "command": command,
            **payload # Merge payload vào message (vd: {"val": 10} hoặc {"url": "..."})
        }
        
        # 5. Gửi lệnh xuống IoT Core
        print(f"Publishing to {topic}: {mqtt_message}")
        iot_client.publish(
            topic=topic,
            qos=1,
            payload=json.dumps(mqtt_message)
        )

        return create_cors_response(200, {'message': f'Command {command} sent to {station_id}'})

    except Exception as e:
        print(f"Error: {e}")
        return create_cors_response(500, {'error': str(e)})
