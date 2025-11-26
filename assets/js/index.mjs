// Import AWS SDK v3 clients
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Khởi tạo DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Tên các bảng DynamoDB
const RAW_DATA_TABLE = "IoT_Sensor_Data";
const AGGREGATE_TABLE = "DailyAggregates";

// Ánh xạ stationId sang deviceId
const stationIdToDeviceIdMap = {
    'station_01': 'ESP8266_Station_1',
    //'station_02': 'ESP8266_Station_2'
};

export const handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    const range = event.queryStringParameters?.range || '1d';
    const stationId = event.queryStringParameters?.station || 'station_01';
    const deviceIdValue = stationIdToDeviceIdMap[stationId];

    if (!deviceIdValue) {
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid station ID." }) };
    }

    // Tính toán mốc thời gian bắt đầu
    const now = Date.now(); // Lấy timestamp hiện tại bằng mili giây
    let startTime;

    switch (range) {
        case 'live': startTime = now - (2 * 60 * 60 * 1000); break;      // 2 giờ
        case '1d':   startTime = now - (24 * 60 * 60 * 1000); break;     // 24 giờ
        case '5d':   startTime = now - (5 * 24 * 60 * 60 * 1000); break;  // 5 ngày
        case '1m':   startTime = now - (30 * 24 * 60 * 60 * 1000); break; // 30 ngày (ước tính)
        case '6m':   startTime = now - (180 * 24 * 60 * 60 * 1000); break;// 6 tháng
        case '1y':   startTime = now - (365 * 24 * 60 * 60 * 1000); break;// 1 năm
        default:     startTime = now - (24 * 60 * 60 * 1000); break;
    }

    // ✨ [TỐI ƯU HÓA] Lựa chọn bảng và xây dựng câu lệnh truy vấn một cách linh hoạt
    const useAggregateTable = range !== 'live' && range !== '1d';
    const targetTable = useAggregateTable ? AGGREGATE_TABLE : RAW_DATA_TABLE;
    const sortKeyName = useAggregateTable ? 'date' : 'timestamp';
    
    const startTimeValue = useAggregateTable 
        ? new Date(startTime).toISOString().split('T')[0] // Định dạng YYYY-MM-DD cho bảng tổng hợp.
        : startTime;                                      // ✨ [SỬA LỖI] Giữ nguyên startTime ở đơn vị mili giây cho bảng dữ liệu thô.

    console.log(`Querying table: ${targetTable} for range: ${range} with start time: ${startTimeValue}`);

    let queryParams;

    if (useAggregateTable) {
        queryParams = {
            TableName: targetTable,
            // ✨ [SỬA LỖI] Sửa lại KeyConditionExpression để sử dụng đúng alias và cú pháp.
            // DynamoDB yêu cầu điều kiện bằng (=) cho partition key (deviceId) và có thể có điều kiện so sánh (>=) cho sort key (date).
            KeyConditionExpression: `deviceId = :did AND #date >= :start_time`,
            ExpressionAttributeNames: { "#date": "date" },
            ExpressionAttributeValues: { ":did": deviceIdValue, ":start_time": startTimeValue },
            ProjectionExpression: "#date, avgTemperature, avgHumidity, avgUSv" // Giữ nguyên các trường cần lấy
        };
    } else {
        // ✨ [SỬA LỖI] Đối với dữ liệu thô (1d, live), sử dụng Query với ScanIndexForward: false để lấy dữ liệu mới nhất
        // và lọc lại trong Lambda thay vì dùng điều kiện không hợp lệ trên timestamp.
        // ✨ [SỬA LỖI] Sửa lại query để lấy đúng dữ liệu trong 24 giờ thay vì chỉ 2000 điểm dữ liệu mới nhất.
        // Điều này đảm bảo chế độ xem "1 ngày" hiển thị đủ 24 tiếng.
        queryParams = {
            TableName: targetTable,
            KeyConditionExpression: `deviceId = :did AND #ts >= :start_time`,
            ExpressionAttributeValues: { ":did": deviceIdValue, ":start_time": startTimeValue },
            ProjectionExpression: "#ts, temperature, humidity, uSv",
            ExpressionAttributeNames: { "#ts": "timestamp" },
            ScanIndexForward: false // ✨ [SỬA LỖI] Lấy dữ liệu mới nhất trước để đảm bảo tính nhất quán
        }
    }

    try {
        const { Items } = await docClient.send(new QueryCommand(queryParams));
        console.log(`Found ${Items.length} items for ${stationId} in range ${range}.`);

        // Chuẩn hóa dữ liệu trả về
        let responseItems;

        if (useAggregateTable) {
            responseItems = Items.map(item => ({
                timestamp: new Date(item.date).getTime(),
                temperature: item.avgTemperature,
                humidity: item.avgHumidity,
                uSv: item.avgUSv
            }));
        } else {
            // ✨ [SỬA LỖI] Không cần lọc lại vì query đã lấy đúng khoảng thời gian. Chỉ cần chuyển đổi timestamp.
            responseItems = Items.map(item => ({
                ...item, // Giữ nguyên các trường temperature, humidity, uSv
                timestamp: item.timestamp // Timestamp đã là mili giây
            }));
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify(responseItems.sort((a, b) => a.timestamp - b.timestamp)),
        };
    } catch (error) {
        console.error("Error processing request:", error);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Failed to retrieve data.", error: error.message }),
        };
    }
};