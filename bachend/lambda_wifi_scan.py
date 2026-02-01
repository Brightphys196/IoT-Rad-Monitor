import json
import boto3  # type: ignore
import os
from datetime import datetime, timedelta

# Khởi tạo clients - nhất quán với lambda_device_control.py
iot_client = boto3.client('iot-data', region_name='ap-southeast-1')
cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1')
dynamodb = boto3.resource('dynamodb', region_name='ap-southeast-1')

# Environment variables
USER_POOL_ID = os.environ.get('USER_POOL_ID')
WIFI_SCAN_TABLE = os.environ.get('WIFI_SCAN_TABLE', 'wifi_scan_results')

def create_cors_response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'OPTIONS, POST'
        },
        'body': json.dumps(body, default=str)
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
    # 1. Xử lý CORS (chỉ áp dụng cho API Gateway)
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return create_cors_response(200, {})

    try:
        # 2. Detect nguồn gọi: IoT Rule vs API Gateway
        # IoT Rule gửi trực tiếp payload, không có 'body' field
        # API Gateway gửi có 'body' là JSON string
        
        if 'body' in event:
            # Từ API Gateway
            headers = event.get('headers', {})
            auth_header = headers.get('authorization', headers.get('Authorization', ''))
            body = json.loads(event.get('body', '{}'))
        else:
            # Từ IoT Rule - không cần auth, data trực tiếp trong event
            auth_header = None
            body = event
            # IoT Rule SELECT topic(2) as stationId, networks
            # Nên stationId và networks nằm trực tiếp trong event
            if 'stationId' in event and 'networks' in event:
                body['action'] = 'SAVE_SCAN_RESULT'  # Auto set action cho IoT Rule
        
        action = body.get('action', 'GET_SCAN_RESULT')
        station_id = body.get('stationId')
        
        if not station_id:
            return create_cors_response(400, {'error': 'Missing stationId'})

        table = dynamodb.Table(WIFI_SCAN_TABLE)
        
        if action == 'SAVE_SCAN_RESULT':
            # Được gọi bởi IoT Rule khi ESP gửi kết quả scan
            # Không cần xác thực admin (IoT Rule gọi trực tiếp)
            wifi_networks = body.get('networks', [])
            
            table.put_item(Item={
                'station_id': station_id,
                'networks': wifi_networks,
                'scan_time': datetime.utcnow().isoformat(),
                'ttl': int((datetime.utcnow() + timedelta(minutes=5)).timestamp())
            })
            
            return create_cors_response(200, {
                'message': f'Saved {len(wifi_networks)} networks for {station_id}'
            })
        
        elif action == 'GET_SCAN_RESULT':
            # Được gọi bởi Admin Frontend - cần xác thực
            verify_admin(auth_header)
            
            response = table.get_item(Key={'station_id': station_id})
            item = response.get('Item')
            
            if not item:
                return create_cors_response(200, {
                    'stationId': station_id,
                    'networks': [],
                    'message': 'No scan results available. Please scan first.'
                })
            
            # Kiểm tra xem kết quả có quá cũ không
            scan_time = datetime.fromisoformat(item.get('scan_time', '2000-01-01'))
            if datetime.utcnow() - scan_time > timedelta(minutes=5):
                return create_cors_response(200, {
                    'stationId': station_id,
                    'networks': [],
                    'message': 'Scan results expired. Please scan again.',
                    'expired': True
                })
            
            return create_cors_response(200, {
                'stationId': station_id,
                'networks': item.get('networks', []),
                'scanTime': item.get('scan_time')
            })
        
        elif action == 'REQUEST_SCAN':
            # Gửi lệnh scan xuống thiết bị - cần xác thực admin
            verify_admin(auth_header)
            
            # Topic: station/{station_id}/control - nhất quán với lambda_device_control.py
            topic = f"station/{station_id}/control"
            mqtt_message = {"command": "SCAN_WIFI"}
            
            print(f"Publishing to {topic}: {mqtt_message}")
            iot_client.publish(
                topic=topic,
                qos=1,
                payload=json.dumps(mqtt_message)
            )
            
            return create_cors_response(200, {
                'message': f'Scan command sent to {station_id}',
                'stationId': station_id
            })
        
        else:
            return create_cors_response(400, {'error': f'Unknown action: {action}'})

    except Exception as e:
        print(f"Error: {e}")
        return create_cors_response(500, {'error': str(e)})
