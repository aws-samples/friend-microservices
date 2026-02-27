import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { Friend } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const friendTableName = tableMap.get(Friend)!;
const friendPk = keyMap.get(Friend)!.get(Keys.PK)!;
const friendSk = keyMap.get(Friend)!.get(Keys.SK)!;

export const handler: APIGatewayProxyHandler = async ({
  httpMethod,
  path,
  pathParameters,
}: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (httpMethod != "GET") {
    throw new Error(`friends only accept GET method, you tried: ${httpMethod}`);
  }

  const playerId = pathParameters!["playerId"];
  if (path.includes("isFriend")) {
    const friendId = pathParameters!["friendId"];
    const getParam = {
      TableName: friendTableName,
      Key: {
        [friendPk]: playerId,
        [friendSk]: friendId,
      },
    };
    const result = await db.send(new GetCommand(getParam));
    return {
      statusCode: 200,
      body: result.Item!["state"],
    };
  }

  const queryParam = {
    TableName: friendTableName,
    KeyConditionExpression: "#player_id = :player_id",
    ExpressionAttributeNames: {
      "#player_id": friendPk,
    },
    ExpressionAttributeValues: {
      ":player_id": playerId,
    },
  };
  const result = await db.send(new QueryCommand(queryParam));
  return {
    statusCode: 200,
    body: JSON.stringify(result.Items!),
  };
};
