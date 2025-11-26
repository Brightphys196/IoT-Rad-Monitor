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
GEMINI_MODEL = "gemini-2.5-flash"

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
    """Gọi Gemini API với một hệ thống chỉ thị (system prompt) mạnh mẽ."""
    
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

    4. Nếu người dùng muốn lấy TRẠNG THÁI của MỘT thiết bị (ví dụ: "trạm 1 còn online không"):
    {{
      "action": "GET_DEVICE_STATUS",
      "station": "<station_id>"
    }}
    
    5. Nếu người dùng muốn lấy TRẠNG THÁI của TẤT CẢ thiết bị (ví dụ: "trạm nào đang hoạt động?", "kiểm tra các trạm"):
    {{
      "action": "GET_ALL_DEVICE_STATUS"
    }}

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
        with urllib.request.urlopen(req, timeout=20) as response:
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
        raise Exception(f"HTTP Error {he.code}: {body}")
    except urllib.error.URLError as ue:
        print(f"URLError calling Gemini: {ue}")
        raise Exception(f"URL Error: {ue}")
    except Exception as e:
        print(f"Unexpected error calling Gemini: {e}")
        raise

def summarize_with_gemini(context_prompt, data_to_summarize):
    """Gọi Gemini để tóm tắt dữ liệu đã thu thập."""
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY chưa được cấu hình")

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    
    full_prompt = f"{context_prompt}\n\nDữ liệu:\n```json\n{json.dumps(data_to_summarize, indent=2, cls=DecimalEncoder)}\n```"
    
    payload = { "contents": [{"role": "user", "parts": [{"text": full_prompt}]}] }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(api_url, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            response_body = response.read().decode('utf-8')
            result = json.loads(response_body)
            if response.status != 200:
                print(f"Lỗi từ Gemini (summarize): status={response.status}, body={response_body}")
                raise Exception(f"Gemini summarize returned status {response.status}: {response_body}")
            return result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')
    except urllib.error.HTTPError as he:
        try:
            body = he.read().decode('utf-8')
        except Exception:
            body = str(he)
        print(f"HTTPError calling Gemini (summarize): {he.code} {he.reason} - {body}")
        raise Exception(f"HTTP Error {he.code}: {body}")
    except urllib.error.URLError as ue:
        print(f"URLError calling Gemini (summarize): {ue}")
        raise Exception(f"URL Error: {ue}")
    except Exception as e:
        print(f"Unexpected error calling Gemini (summarize): {e}")
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
        try:
            ai_response_text = call_gemini_api(prompt)
            print(f"AI response (raw): {ai_response_text}")
        except Exception as e:
            # Lỗi khi gọi dịch vụ bên ngoài (Gemini/API). Trả về 502 để chỉ ra lỗi bên thứ ba.
            print(f"Lỗi khi gọi Gemini: {e}")
            return create_cors_response(502, {'error': f'Lỗi dịch vụ AI: {str(e)}'})
        
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
            
            summary_prompt = f"Bạn là trợ lý, hãy tóm tắt dữ liệu cảm biến cho trạm {station_id} trong khoảng thời gian '{range_str}' một cách tự nhiên, thân thiện bằng Tiếng Việt. Nếu không có dữ liệu, hãy thông báo cho người dùng. Nhấn mạnh các chỉ số quan trọng."
            final_response = summarize_with_gemini(summary_prompt, data)

        elif action == "LIST_USERS":
            # Gửi token của admin để xác thực
            lambda_payload = {
                'headers': {'Authorization': f'Bearer {access_token}'},
                'body': json.dumps({'action': 'LIST_USERS'})
            }
            data = invoke_lambda(ADMIN_API_LAMBDA_NAME, lambda_payload)
            
            summary_prompt = "Bạn là trợ lý, hãy thông báo cho người dùng về số lượng người dùng trong hệ thống một cách thân thiện bằng Tiếng Việt."
            final_response = summarize_with_gemini(summary_prompt, data)

        elif action == "GET_SYSTEM_LOGS":
            station_id = ai_command.get('station', 'all')
            lambda_payload = {'queryStringParameters': {'station': station_id}}
            data = invoke_lambda(SYSTEM_LOGS_LAMBDA_NAME, lambda_payload)
            summary_prompt = "Bạn là trợ lý, hãy tóm tắt tình hình nhật ký hệ thống dựa trên dữ liệu sau. Nếu có lỗi (ERROR), hãy nhấn mạnh điều đó. Trả lời bằng Tiếng Việt."
            final_response = summarize_with_gemini(summary_prompt, data)

        elif action == "GET_DEVICE_STATUS":
            station_id = ai_command.get('station', 'station_01')
            lambda_payload = {'queryStringParameters': {'station': station_id}}
            data = invoke_lambda(DEVICE_STATUS_LAMBDA_NAME, lambda_payload)
            final_response = f"Trạng thái {station_id}: {data.get('status')}. {data.get('details')}"
            
        elif action == "GET_ALL_DEVICE_STATUS":
            all_statuses = []
            station_ids = ["station_01", "station_02", "station_03", "station_04"]
            for sid in station_ids:
                try:
                    # ✨ [SỬA LỖI] Đơn giản hóa payload để khớp với cách hàm invoke_lambda hoạt động.
                    # Hàm invoke_lambda sẽ tự động bọc payload này trong json.dumps.
                    # Cấu trúc đúng cho API Gateway Lambda Proxy là một chuỗi JSON chứa queryStringParameters.
                    payload = json.dumps({'queryStringParameters': {'station': sid}})
                    status_data = invoke_lambda(DEVICE_STATUS_LAMBDA_NAME, payload)
                    all_statuses.append({'station': sid, 'status': status_data.get('status', 'unknown')})
                except Exception as e:
                    all_statuses.append({'station': sid, 'status': 'error', 'reason': str(e)})
            
            # Gửi tất cả trạng thái cho Gemini để tóm tắt
            summary_prompt = "Bạn là trợ lý, hãy tóm tắt trạng thái của các trạm quan trắc sau đây bằng một câu trả lời tự nhiên, thân thiện bằng Tiếng Việt. Nhấn mạnh các trạm đang offline nếu có."
            final_response = summarize_with_gemini(summary_prompt, all_statuses)

        elif action == "SAY":
            final_response = ai_command.get('response')

        return create_cors_response(200, {'response': final_response})

    except cognito_client.exceptions.NotAuthorizedException:
        return create_cors_response(401, {'error': 'Token không hợp lệ hoặc đã hết hạn.'})
    except json.JSONDecodeError:
        # Bắt lỗi nếu body của request không phải là JSON hợp lệ
        return create_cors_response(400, {'error': 'Yêu cầu phải ở định dạng JSON.'})
    except Exception as e:
        print(f"Lỗi: {e}")
        return create_cors_response(500, {'error': str(e)})