import * as AWS from "aws-sdk";
import Aigle from "aigle";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBStreamEvent,
  DynamoDBStreamHandler,
} from "aws-lambda";
import { Friend, State } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";

const db = new AWS.DynamoDB.DocumentClient();

const friendTableName = tableMap.get(Friend)!;
const friendPk = keyMap.get(Friend)!.get(Keys.PK)!;
const friendSk = keyMap.get(Friend)!.get(Keys.SK)!;

export const handler: DynamoDBStreamHandler = async ({
  Records,
}: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
  const batchItemFailures: DynamoDBBatchItemFailure[] = [];
  await Aigle.forEach(Records, async ({ dynamodb }) => {
    const { OldImage, SequenceNumber } = dynamodb!;
    try {
      await reject(OldImage![friendPk]["S"]!, OldImage![friendSk]["S"]!);
    } catch (e: any) {
      batchItemFailures.push({
        itemIdentifier: SequenceNumber!,
      });
      console.log(e);
    }
  });
  return { batchItemFailures };
};

async function reject(playerId: string, friendId: string) {
  const rejectParam: DocumentClient.DeleteItemInput = {
    TableName: friendTableName,
    Key: {
      [friendPk]: friendId,
      [friendSk]: playerId,
    },
    ConditionExpression: "#state = :requested",
    ExpressionAttributeNames: {
      "#state": "state",
    },
    ExpressionAttributeValues: {
      ":requested": State.Requested,
    },
  };
  try {
    await db.delete(rejectParam).promise();
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      console.log(`could not reject, state is not ${State.Requested}`);
      return;
    }
    throw e;
  }
}
