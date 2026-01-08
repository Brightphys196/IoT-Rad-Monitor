// Import AWS SDK v3 clients
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

// Khởi tạo DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const RAW_DATA_TABLE = "IoT_Sensor_Data";
const AGGREGATE_TABLE = "DailyAggregates";

const stationIdToDeviceIdMap = {
    'station_01': 'ESP8266_Station_1',
    'station_02': 'ESP8266_Station_2',
    'station_03': 'ESP8266_Station_3',
    'station_04': 'ESP8266_Station_4'
};

export const handler = async (event) => {
    console.log("Received event:", JSON.stringify(event, null, 2));

    const queryParams = event.queryStringParameters || {};
    const range = queryParams.range || '1d';
    const stationId = queryParams.station || 'station_01';

    const customStart = queryParams.start;
    const customEnd = queryParams.end;

    const deviceIdValue = stationIdToDeviceIdMap[stationId];

    if (!deviceIdValue) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Invalid station ID." })
        };
    }

    let startTimeValue, endTimeValue, useAggregateTable, targetTable;

    if (customStart && customEnd) {
        // --- XỬ LÝ CHO TRANG PHÂN TÍCH (start/end) ---
        console.log(`Custom date range specified: ${customStart} to ${customEnd}`);
        useAggregateTable = false;
        targetTable = RAW_DATA_TABLE;

        // ✨ [SỬA LỖI] Giá trị 'start' và 'end' từ data-analysis.js đã ở định dạng giây.
        // Chỉ cần chuyển đổi chúng thành số nguyên, KHÔNG chia cho 1000.
        startTimeValue = parseInt(customStart);
        endTimeValue = parseInt(customEnd);

    } else {
        // --- XỬ LÝ CHO DASHBOARD (range) ---
        console.log(`Predefined range specified: ${range}`);
        useAggregateTable = range !== 'live' && range !== '1d';
        targetTable = useAggregateTable ? AGGREGATE_TABLE : RAW_DATA_TABLE;

        const now = Date.now();
        let startTime;
        switch (range) {
            case 'live': startTime = now - (2 * 60 * 60 * 1000); break;
            case '1d': startTime = now - (24 * 60 * 60 * 1000); break;
            case '5d': startTime = now - (5 * 24 * 60 * 60 * 1000); break;
            case '1m': startTime = now - (30 * 24 * 60 * 60 * 1000); break;
            case '6m': startTime = now - (180 * 24 * 60 * 60 * 1000); break;
            case '1y': startTime = now - (365 * 24 * 60 * 60 * 1000); break;
            default: startTime = now - (24 * 60 * 60 * 1000); break;
        }

        startTimeValue = useAggregateTable
            ? new Date(startTime).toISOString().split('T')[0] // Định dạng YYYY-MM-DD
            : Math.floor(startTime / 1000);                   // Định dạng timestamp (giây)
    }

    console.log(`Querying table: ${targetTable} for device: ${deviceIdValue} between ${startTimeValue} and ${endTimeValue || 'now'}`);

    let queryDDBParams; // Đổi tên biến để tránh nhầm lẫn với queryParams của event
    if (useAggregateTable) {
        // ... (Logic truy vấn bảng tổng hợp) ...
        queryDDBParams = {
            TableName: targetTable,
            KeyConditionExpression: `deviceId = :did AND #dt >= :start_time`,
            ExpressionAttributeNames: { "#dt": "date" },
            ExpressionAttributeValues: { ":did": deviceIdValue, ":start_time": startTimeValue },
            ProjectionExpression: "#dt, avgTemperature, avgHumidity, avgUSv"
        };
    } else {
        // ... (Logic truy vấn bảng dữ liệu thô) ...
        const keyCondition = (customStart && customEnd)
            ? `deviceId = :did AND #ts BETWEEN :start_time AND :end_time`
            : `deviceId = :did AND #ts >= :start_time`;

        const expressionValues = (customStart && customEnd)
            ? { ":did": deviceIdValue, ":start_time": startTimeValue, ":end_time": endTimeValue }
            : { ":did": deviceIdValue, ":start_time": startTimeValue };

        queryDDBParams = {
            TableName: targetTable,
            KeyConditionExpression: keyCondition,
            ExpressionAttributeNames: { "#ts": "timestamp" },
            ExpressionAttributeValues: expressionValues,
            ProjectionExpression: "#ts, temperature, humidity, uSv, cps, counts"
        };
    }

    let allItems = [];
    let lastEvaluatedKey;

    try {
        do {
            const command = new QueryCommand({ ...queryDDBParams, ExclusiveStartKey: lastEvaluatedKey });
            const { Items, LastEvaluatedKey } = await docClient.send(command);
            if (Items) {
                allItems.push(...Items);
            }
            lastEvaluatedKey = LastEvaluatedKey;
        } while (lastEvaluatedKey);

        console.log(`Found a total of ${allItems.length} items for ${stationId}.`);

        let responseItems;
        if (useAggregateTable) {
            responseItems = allItems.map(item => ({
                timestamp: new Date(item.date).getTime(),
                temperature: item.avgTemperature,
                humidity: item.avgHumidity,
                uSv: item.avgUSv
            }));
        } else {
            responseItems = allItems.map(item => ({
                ...item,
                timestamp: item.timestamp * 1000
            }));
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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

