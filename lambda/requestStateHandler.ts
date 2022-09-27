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
  const timeStamp = Date.now();
  const batchItemFailures: DynamoDBBatchItemFailure[] = [];
  await Aigle.forEach(Records, async ({ dynamodb }) => {
    const { NewImage, SequenceNumber } = dynamodb!;
    try {
      await request(
        NewImage![friendPk]["S"]!,
        NewImage![friendSk]["S"]!,
        timeStamp
      );
    } catch (e: any) {
      batchItemFailures.push({
        itemIdentifier: SequenceNumber!,
      });
      console.log(e);
    }
  });
  return { batchItemFailures };
};

async function request(
  requesterId: string,
  receiverId: string,
  timeStamp: number
) {
  const friendParam: DocumentClient.PutItemInput = {
    TableName: friendTableName,
    Item: {
      [friendPk]: receiverId,
      [friendSk]: requesterId,
      state: State.Pending,
      last_updated: timeStamp,
    },
    ConditionExpression: `attribute_not_exists(${friendPk})`,
  };
  try {
    await db.put(friendParam).promise();
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      await failedToRequest(requesterId, receiverId, timeStamp);
      return;
    }
    throw e;
  }
}

async function failedToRequest(
  requesterId: string,
  receiverId: string,
  timeStamp: number
) {
  const updateReceiverParams: DocumentClient.TransactWriteItem = {
    Update: {
      TableName: friendTableName,
      Key: {
        [friendPk]: receiverId,
        [friendSk]: requesterId,
      },
      ConditionExpression: "#state = :requested",
      UpdateExpression: "SET #state = :friends, #last_updated = :last_updated",
      ExpressionAttributeNames: {
        "#state": "state",
        "#last_updated": "last_updated",
      },
      ExpressionAttributeValues: {
        ":requested": State.Requested,
        ":friends": State.Friends,
        ":last_updated": timeStamp,
      },
    },
  };

  const updateRequesterParam: DocumentClient.TransactWriteItem = {
    Update: {
      TableName: friendTableName,
      Key: {
        [friendPk]: requesterId,
        [friendSk]: receiverId,
      },
      ConditionExpression: "#state = :requested",
      UpdateExpression: "SET #state = :friends, #last_updated = :last_updated",
      ExpressionAttributeNames: {
        "#state": "state",
        "#last_updated": "last_updated",
      },
      ExpressionAttributeValues: {
        ":requested": State.Requested,
        ":friends": State.Friends,
        ":last_updated": timeStamp,
      },
    },
  };

  try {
    await db
      .transactWrite({
        TransactItems: [updateReceiverParams, updateRequesterParam],
      })
      .promise();
  } catch (e: any) {
    if (e.name == "TransactionCanceledException") {
      if (e.message.includes("TransactionConflict")) {
        console.log(`transact write failed, transaction has conflicted, retry`);
        throw e;
      }
      console.log(
        `transact write failed, either requester or receiver has different state, no dead lock`
      );
      return;
    }
    throw e;
  }
}
