import json
import os
import urllib.request
import urllib.error
import boto3 # type: ignore
from datetime import datetime
from decimal import Decimal

# =================================================================
#                      KHỞI TẠO CLIENT & CẤU HÌNH
# =================================================================
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
GEMINI_MODEL = "gemini-3-flash-preview"  # Gemini 3 - model mới nhất

cognito_client = boto3.client('cognito-idp', region_name='ap-southeast-1')
lambda_client = boto3.client('lambda', region_name='ap-southeast-1')

# Tên của các hàm Lambda khác mà "bộ não" này có thể gọi
USER_POOL_ID = os.environ.get('USER_POOL_ID')
GET_HISTORICAL_DATA_LAMBDA_NAME = os.environ.get('GET_HISTORICAL_DATA_LAMBDA_NAME')
ADMIN_API_LAMBDA_NAME = os.environ.get('ADMIN_API_LAMBDA_NAME')
SYSTEM_LOGS_LAMBDA_NAME = os.environ.get('SYSTEM_LOGS_LAMBDA_NAME')
DEVICE_STATUS_LAMBDA_NAME = os.environ.get('DEVICE_STATUS_LAMBDA_NAME')

# =================================================================
#                      CÁC HÀM TIỆN ÍCH
# =================================================================
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

def call_gemini_api(prompt):
    """
    Gọi Gemini API đơn giản - KHÔNG có retry logic ở đây.
    Frontend sẽ xử lý retry để tránh Lambda timeout.
    """
    
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY chưa được cấu hình")

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    
    # "Dạy" AI về các chức năng nó có thể thực hiện
    system_prompt = f"""
    Bạn là một trợ lý AI chuyên nghiệp cho hệ thống giám sát trạm IoT. 
    Nhiệm vụ của bạn là hiểu yêu cầu của người dùng và CHỈ trả lời bằng một trong các định dạng JSON sau:

    1. Nếu người dùng muốn lấy DỮ LIỆU CẢM BIẾN (ví dụ: "số liệu trạm 1", "trạm 2 tuần trước"):
    {{
      "action": "GET_SENSOR_DATA",
      "station": "<station_id>",
      "range": "<range_id>"
    }}
    - <station_id>: "station_01", "station_02", "station_03", "station_04".
    - <range_id>: "live", "1d", "5d", "1m", "1y".

    2. Nếu người dùng muốn lấy DANH SÁCH NGƯỜI DÙNG (ví dụ: "có bao nhiêu người dùng", "liệt kê user"):
    {{
      "action": "LIST_USERS"
    }}
    
    3. Nếu người dùng muốn lấy NHẬT KÝ HỆ THỐNG (ví dụ: "kiểm tra log", "có lỗi gì không"):
    {{
      "action": "GET_SYSTEM_LOGS"
    }}

    4. Nếu người dùng muốn lấy TRẠNG THÁI THIẾT BỊ (ví dụ: "trạm 1 còn online không", "kiểm tra trạng thái tất cả các trạm"):
    {{
      "action": "GET_DEVICE_STATUS",
      "station": "<station_id>"
    }}
    - <station_id>: "station_01", "station_02", "station_03", "station_04", hoặc "all" để kiểm tra TẤT CẢ các trạm.
    
    5. Nếu người dùng muốn PHÂN TÍCH, ĐÁNH GIÁ, hoặc hỏi về LƯU Ý/CẢNH BÁO/BẤT THƯỜNG của một trạm (ví dụ: "trạm 1 có lưu ý gì không?", "có vấn đề gì ở trạm 2?", "phân tích trạm 3"):
    {{
      "action": "ANALYZE_STATION",
      "station": "<station_id>"
    }}
    - Sử dụng action này khi người dùng hỏi về tình trạng, cảnh báo, bất thường, hoặc muốn biết có điều gì cần chú ý.
    
    6. Nếu người dùng hỏi chung chung, chào hỏi, hoặc yêu cầu không thể thực hiện:
    {{
      "action": "SAY",
      "response": "<văn bản trả lời thân thiện bằng Tiếng Việt>"
    }}
    
    Hôm nay là {datetime.now().strftime('%Y-%m-%d')}. Xử lý yêu cầu sau:
    """
    
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": system_prompt}]},
            {"role": "model", "parts": [{"text": "OK."}]},
            {"role": "user", "parts": [{"text": prompt}]}
        ]
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(api_url, data=data, headers={'Content-Type': 'application/json'})

    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            response_body = response.read().decode('utf-8')
            result = json.loads(response_body)
            if response.status != 200:
                print(f"Lỗi từ Gemini API: status={response.status}, body={response_body}")
                raise Exception(f"Gemini API returned status {response.status}: {response_body}")
            return result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')
    except urllib.error.HTTPError as he:
        try:
            body = he.read().decode('utf-8')
        except Exception:
            body = str(he)
        print(f"HTTPError calling Gemini: {he.code} {he.reason} - {body}")
        # Trả về lỗi rõ ràng cho frontend xử lý
        raise Exception(f"RATE_LIMIT" if he.code == 429 else f"HTTP Error {he.code}: {body}")
    except urllib.error.URLError as ue:
        print(f"URLError calling Gemini: {ue}")
        raise Exception(f"URL Error: {ue}")
    except Exception as e:
        print(f"Unexpected error calling Gemini: {e}")
        raise

def invoke_lambda(lambda_name, payload):
    """Hàm chung để gọi các Lambda function khác."""
    if not lambda_name:
        raise Exception(f"Tên Lambda chưa được cấu hình (ví dụ: {lambda_name})")
        
    # Nếu payload đã là chuỗi JSON (caller đã gọi json.dumps), gửi thẳng; nếu là dict/object, serial hóa
    if isinstance(payload, str):
        payload_to_send = payload
    else:
        payload_to_send = json.dumps(payload)

    response = lambda_client.invoke(
        FunctionName=lambda_name,
        InvocationType='RequestResponse',
        Payload=payload_to_send
    )

    response_payload = json.load(response['Payload'])
    
    if 'errorMessage' in response_payload or response_payload.get('statusCode') != 200:
        raise Exception(f"Hàm {lambda_name} báo lỗi: {response_payload.get('body') or response_payload.get('errorMessage')}")
        
    return json.loads(response_payload.get('body', '{}'))

# =================================================================
#                      HANDLER CHÍNH (BỘ ĐỊNH TUYẾN)
# =================================================================
def lambda_handler(event, context):
    try:
        # Xử lý CORS Preflight
        http_method = event.get('requestContext', {}).get('http', {}).get('method')
        if http_method == 'OPTIONS':
            return create_cors_response(200, {})
            
        # Kiểm tra Biến Môi trường
        if not USER_POOL_ID or not GEMINI_API_KEY or not GET_HISTORICAL_DATA_LAMBDA_NAME or not ADMIN_API_LAMBDA_NAME or not SYSTEM_LOGS_LAMBDA_NAME or not DEVICE_STATUS_LAMBDA_NAME:
            return create_cors_response(500, {'error': 'Hàm Lambda chưa được cấu hình (thiếu Biến Môi trường).'})

        # 1. Xác thực người dùng
        headers = event.get('headers', {})
        # Hỗ trợ cả 'authorization' và 'Authorization', và xử lý an toàn nếu header bị thiếu hoặc định dạng sai
        auth_header = headers.get('authorization', headers.get('Authorization', '')) or ''
        access_token = ''
        try:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                access_token = parts[1]
        except Exception:
            access_token = ''

        if not access_token:
            # Trả về 401 rõ ràng khi token không được cung cấp hoặc định dạng sai
            return create_cors_response(401, {'error': 'Thiếu hoặc sai định dạng Access Token (Authorization header)'} )

        # Lấy thông tin user từ Cognito (sẽ ném NotAuthorizedException nếu token không hợp lệ)
        user = cognito_client.get_user(AccessToken=access_token)
        
        # 2. Lấy prompt từ người dùng
        body = json.loads(event.get('body', '{}'))
        prompt = body.get('prompt')
        
        if not prompt:
            return create_cors_response(400, {'error': 'Thiếu "prompt" trong yêu cầu'})
            
        # 3. Gọi AI để "hiểu" ý định
        ai_response_text = call_gemini_api(prompt)
        print(f"AI response (raw): {ai_response_text}")
        
        try:
            cleaned_text = ai_response_text.strip().replace('```json', '').replace('```', '').strip()
            ai_command = json.loads(cleaned_text)
        except json.JSONDecodeError:
            print("AI không trả về JSON hợp lệ. Trả về văn bản thô.")
            return create_cors_response(200, {'response': ai_response_text})
            
        action = ai_command.get('action')
        final_response = "Tôi không hiểu yêu cầu của bạn." # Mặc định
        
        # 4. Thực thi hành động
        if action == "GET_SENSOR_DATA":
            station_id = ai_command.get('station', 'station_01')
            range_str = ai_command.get('range', '1d')
            lambda_payload = {'queryStringParameters': {'station': station_id, 'range': range_str}}
            data = invoke_lambda(GET_HISTORICAL_DATA_LAMBDA_NAME, lambda_payload)
            if not data:
                final_response = f"Không tìm thấy dữ liệu cho {station_id} trong khoảng {range_str}."
            else:
                latest = data[-1]
                final_response = f"Dữ liệu mới nhất cho {station_id} ({range_str}): Nhiệt độ {latest.get('temperature', 'N/A')}°C, Độ ẩm {latest.get('humidity', 'N/A')}%, Phóng xạ {latest.get('uSv', 'N/A')} µSv/h."

        elif action == "LIST_USERS":
            # Gửi token của admin để xác thực
            lambda_payload = {
                'headers': {'Authorization': f'Bearer {access_token}'},
                'body': json.dumps({'action': 'LIST_USERS'})
            }
            data = invoke_lambda(ADMIN_API_LAMBDA_NAME, lambda_payload)
            users_count = len(data.get('users', []))
            final_response = f"Hiện tại có tổng cộng {users_count} người dùng trong hệ thống."

        elif action == "GET_SYSTEM_LOGS":
            station_id = ai_command.get('station', 'all')
            lambda_payload = {'queryStringParameters': {'station': station_id}}
            data = invoke_lambda(SYSTEM_LOGS_LAMBDA_NAME, lambda_payload)
            logs_count = len(data)
            final_response = f"Tìm thấy {logs_count} nhật ký hệ thống gần đây."
            if logs_count > 0:
                final_response += f" Nhật ký mới nhất: {data[0].get('message')}"

        elif action == "GET_DEVICE_STATUS":
            station_id = ai_command.get('station', 'station_01')
            
            # Hỗ trợ kiểm tra TẤT CẢ các trạm
            if station_id == "all":
                all_stations = ['station_01', 'station_02', 'station_03', 'station_04']
                results = []
                online_count = 0
                offline_count = 0
                
                for sid in all_stations:
                    try:
                        lambda_payload = {'queryStringParameters': {'station': sid}}
                        data = invoke_lambda(DEVICE_STATUS_LAMBDA_NAME, lambda_payload)
                        status = data.get('status', 'unknown')
                        station_name = sid.replace('station_0', 'Trạm ')
                        
                        if status == 'online':
                            online_count += 1
                            results.append(f"✅ {station_name}: Online")
                        else:
                            offline_count += 1
                            results.append(f"❌ {station_name}: Offline - {data.get('details', '')}")
                    except Exception as e:
                        offline_count += 1
                        results.append(f"⚠️ {sid}: Lỗi khi kiểm tra")
                
                final_response = f"📊 Tổng quan: {online_count} online, {offline_count} offline\n" + "\n".join(results)
            else:
                lambda_payload = {'queryStringParameters': {'station': station_id}}
                data = invoke_lambda(DEVICE_STATUS_LAMBDA_NAME, lambda_payload)
                station_name = station_id.replace('station_0', 'Trạm ')
                status = data.get('status', 'unknown')
                status_emoji = "✅" if status == "online" else "❌"
                final_response = f"{status_emoji} {station_name}: {status}. {data.get('details')}"
        
        elif action == "ANALYZE_STATION":
            station_id = ai_command.get('station', 'station_01')
            station_name = station_id.replace('station_0', 'Trạm ')
            
            # Lấy dữ liệu 1 ngày gần nhất
            lambda_payload = {'queryStringParameters': {'station': station_id, 'range': '1d'}}
            try:
                data = invoke_lambda(GET_HISTORICAL_DATA_LAMBDA_NAME, lambda_payload)
            except Exception:
                data = []
            
            if not data:
                final_response = f"⚠️ Không có dữ liệu gần đây cho {station_name} để phân tích."
            else:
                # Lấy dữ liệu mới nhất
                latest = data[-1]
                temp = float(latest.get('temperature', 0))
                humidity = float(latest.get('humidity', 0))
                radiation = float(latest.get('uSv', 0))
                
                warnings = []
                safe_notes = []
                
                # Kiểm tra phóng xạ
                if radiation > 0.5:
                    warnings.append(f"⚠️ Phóng xạ CAO: {radiation} µSv/h (ngưỡng an toàn: < 0.5 µSv/h)")
                elif radiation > 0.3:
                    warnings.append(f"🔶 Phóng xạ tăng nhẹ: {radiation} µSv/h (theo dõi thêm)")
                else:
                    safe_notes.append(f"✅ Phóng xạ: {radiation} µSv/h - Bình thường")
                
                # Kiểm tra nhiệt độ
                if temp > 40:
                    warnings.append(f"🔥 Nhiệt độ RẤT CAO: {temp}°C")
                elif temp > 35:
                    warnings.append(f"⚠️ Nhiệt độ cao: {temp}°C")
                elif temp < 10:
                    warnings.append(f"❄️ Nhiệt độ thấp: {temp}°C")
                else:
                    safe_notes.append(f"✅ Nhiệt độ: {temp}°C - Bình thường")
                
                # Kiểm tra độ ẩm
                if humidity > 85:
                    warnings.append(f"💧 Độ ẩm cao: {humidity}%")
                elif humidity < 30:
                    warnings.append(f"🏜️ Độ ẩm thấp: {humidity}%")
                else:
                    safe_notes.append(f"✅ Độ ẩm: {humidity}% - Bình thường")
                
                # Tạo response
                if warnings:
                    final_response = f"🔔 **{station_name}** - CÓ LƯU Ý:\n" + "\n".join(warnings)
                    if safe_notes:
                        final_response += "\n\n" + "\n".join(safe_notes)
                else:
                    final_response = f"✅ **{station_name}** - Tất cả chỉ số BÌNH THƯỜNG:\n" + "\n".join(safe_notes)
            
        elif action == "SAY":
            final_response = ai_command.get('response')

        return create_cors_response(200, {'response': final_response})

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Token không hợp lệ hoặc đã hết hạn.'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})