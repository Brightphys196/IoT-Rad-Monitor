import json
import boto3
import time
from decimal import Decimal

# Khởi tạo kết nối đến các bảng DynamoDB
dynamodb = boto3.resource('dynamodb')
sensor_table = dynamodb.Table('IoT_Sensor_Data')
status_table = dynamodb.Table('DeviceStatus')
logs_table = dynamodb.Table('SystemLogs')  

def log_event(device_id, level, message):
    """Hàm trợ giúp để ghi log vào bảng SystemLogs."""
    try:
        logs_table.put_item(
            Item={
                'deviceId': device_id,
                'timestamp': int(time.time()),
                'level': level,
                'message': message
            }
        )
    except Exception as e:
        print(f"Could not log event: {e}")

def lambda_handler(event, context):
    try:
        device_id = event.get('deviceId', 'unknown_device')

        # Chuyển đổi các giá trị float sang Decimal để tương thích với DynamoDB
        event['temperature'] = Decimal(str(event.get('temperature', 0)))
        event['humidity'] = Decimal(str(event.get('humidity', 0)))
        event['uSv'] = Decimal(str(event.get('uSv', 0)))
        event['cps'] = Decimal(str(event.get('cps', 0)))
        
        # DynamoDB không xử lý tốt trường 'counts' kiểu float, nên chúng ta chuyển nó thành int
        if 'counts' in event:
            event['counts'] = int(event['counts'])

        # 1. Ghi dữ liệu chính vào bảng IoT_Sensor_Data
        sensor_table.put_item(Item=event)

        # 2. Cập nhật "nhịp tim" vào bảng DeviceStatus
        status_table.put_item(
            Item={
                'deviceId': device_id,
                'lastSeen': event['timestamp']
            }
        )

        # 3. Ghi log sự kiện nhận dữ liệu thành công
        log_event(device_id, 'INFO', f"Received data: Temp={event.get('temperature')} C, Humi={event.get('humidity')} %, Rad={event.get('uSv')} uSv/h")

        # Kiểm tra và ghi log cảnh báo nếu cần
        radiation_level = float(event.get('uSv', 0))
        if radiation_level >= 10:
            log_event(device_id, 'ERROR', f"High radiation level detected: {radiation_level} uSv/h")
        elif radiation_level >= 1:
            log_event(device_id, 'WARN', f"Elevated radiation level detected: {radiation_level} uSv/h")

        return { 'statusCode': 200, 'body': json.dumps('Data processed successfully!') }
    except Exception as e:
        # Ghi log lỗi nghiêm trọng nếu quá trình xử lý thất bại
        log_event(event.get('deviceId', 'unknown_device'), 'CRITICAL', f"Failed to process data. Error: {str(e)}")
        return { 'statusCode': 500, 'body': json.dumps('Error processing data.') }
