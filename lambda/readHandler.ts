import * as AWS from "aws-sdk";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from "aws-lambda";
import { Friend } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";
import { DocumentClient } from "aws-sdk/clients/dynamodb";

const db = new AWS.DynamoDB.DocumentClient();

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
    const getParam: DocumentClient.GetItemInput = {
      TableName: friendTableName,
      Key: {
        [friendPk]: playerId,
        [friendSk]: friendId,
      },
    };
    const result = await db.get(getParam).promise();
    return {
      statusCode: 200,
      body: result.Item!["state"],
    };
  }

  const queryParam: DocumentClient.QueryInput = {
    TableName: friendTableName,
    KeyConditionExpression: "#player_id = :player_id",
    ExpressionAttributeNames: {
      "#player_id": friendPk,
    },
    ExpressionAttributeValues: {
      ":player_id": playerId,
    },
  };
  const result = await db.query(queryParam).promise();
  return {
    statusCode: 200,
    body: JSON.stringify(result.Items!),
  };
};
