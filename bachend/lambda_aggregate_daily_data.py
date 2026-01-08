import json
import boto3
from datetime import datetime, timedelta, timezone
from decimal import Decimal

# Khởi tạo kết nối
dynamodb = boto3.resource('dynamodb')
source_table = dynamodb.Table('IoT_Sensor_Data') # Bảng dữ liệu gốc
dest_table = dynamodb.Table('DailyAggregates')   # Bảng dữ liệu tổng hợp

# ✨ [CẬP NHẬT] Danh sách tất cả các thiết bị cần được tổng hợp dữ liệu
DEVICE_IDS = [
    'ESP8266_Station_1',
    'ESP8266_Station_2',
    'ESP8266_Station_3',
    'ESP8266_Station_4'
]

def lambda_handler(event, context):
    try:
        # Xác định múi giờ UTC+7
        tz = timezone(timedelta(hours=7))

        # Lấy ngày hôm qua theo múi giờ UTC+7
        yesterday = datetime.now(tz) - timedelta(days=1)
        date_str = yesterday.strftime('%Y-%m-%d')

        # Xác định timestamp bắt đầu và kết thúc của ngày hôm qua (tính bằng giây)
        start_of_day = int(datetime(yesterday.year, yesterday.month, yesterday.day, 0, 0, 0, tzinfo=tz).timestamp())
        end_of_day = int(datetime(yesterday.year, yesterday.month, yesterday.day, 23, 59, 59, tzinfo=tz).timestamp())

        # ✨ [CẬP NHẬT] Lặp qua từng thiết bị để xử lý
        for device_id in DEVICE_IDS:
            print(f"Bat dau tong hop du lieu cho thiet bi {device_id} trong ngay {date_str}...")

            all_items = []
            last_evaluated_key = None

            # ✨ [CẢI TIẾN] Bổ sung logic phân trang để lấy hết dữ liệu trong ngày
            while True:
                query_kwargs = {
                    'KeyConditionExpression': 'deviceId = :id AND #ts BETWEEN :start AND :end',
                    'ExpressionAttributeNames': {'#ts': 'timestamp'},
                    'ExpressionAttributeValues': {
                        ':id': device_id,
                        ':start': start_of_day,
                        ':end': end_of_day
                    }
                }
                if last_evaluated_key:
                    query_kwargs['ExclusiveStartKey'] = last_evaluated_key

                response = source_table.query(**query_kwargs)
                items = response.get('Items', [])
                all_items.extend(items)
                
                last_evaluated_key = response.get('LastEvaluatedKey', None)
                if not last_evaluated_key:
                    break
            
            if not all_items:
                print(f"Khong co du lieu de tong hop cho {device_id}.")
                continue # Bỏ qua và chuyển sang thiết bị tiếp theo

            # Tính toán các giá trị trung bình
            total_temp = sum(item.get('temperature', Decimal(0)) for item in all_items)
            total_humi = sum(item.get('humidity', Decimal(0)) for item in all_items)
            total_usv = sum(item.get('uSv', Decimal(0)) for item in all_items)
            count = len(all_items)

            avg_temp = round(total_temp / count, 2)
            avg_humi = round(total_humi / count, 2)
            avg_usv = round(total_usv / count, 4)

            # Ghi bản tóm tắt vào bảng DailyAggregates
            dest_table.put_item(
                Item={
                    'deviceId': device_id,
                    'date': date_str,
                    # Chuyển đổi sang Decimal để ghi vào DynamoDB một cách an toàn
                    'avgTemperature': Decimal(str(avg_temp)),
                    'avgHumidity': Decimal(str(avg_humi)),
                    'avgUSv': Decimal(str(avg_usv)),
                    'dataPoints': count
                }
            )
            print(f"Tong hop thanh cong cho {device_id}! {count} diem du lieu. Nhiet do TB: {avg_temp}")

        return {'statusCode': 200, 'body': json.dumps('Aggregation successful for all devices!')}

    except Exception as e:
        print(f"Error: {e}")
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}
