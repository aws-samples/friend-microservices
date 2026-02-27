import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Aigle from "aigle";
import {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBStreamEvent,
  DynamoDBStreamHandler,
} from "aws-lambda";
import { Friend, State } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
      await accept(
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

async function accept(playerId: string, friendId: string, timeStamp: number) {
  const updateReceiverParams = {
    TableName: friendTableName,
    Key: {
      [friendPk]: friendId,
      [friendSk]: playerId,
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
  };

  try {
    await db.send(new UpdateCommand(updateReceiverParams));
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      console.log(`could not accept, state is not ${State.Requested}`);
      return;
    }
    // Re-throw other errors so they can be caught by the handler
    throw e;
  }
}
