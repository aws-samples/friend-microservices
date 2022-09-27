import * as AWS from "aws-sdk";
import Aigle from "aigle";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { Friend, State } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";
import {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
  SQSHandler,
} from "aws-lambda";

interface InMessage {
  player_id: string;
  friend_id: string;
  friend_action: FriendAction;
}

enum FriendAction {
  Request = "Request",
  Accept = "Accept",
  Reject = "Reject",
  Unfriend = "Unfriend",
}

const db = new AWS.DynamoDB.DocumentClient();

const friendTableName = tableMap.get(Friend)!;
const friendPk = keyMap.get(Friend)!.get(Keys.PK)!;
const friendSk = keyMap.get(Friend)!.get(Keys.SK)!;

export const handler: SQSHandler = async ({
  Records,
}: SQSEvent): Promise<SQSBatchResponse> => {
  const timeStamp = Date.now();
  const batchItemFailures: SQSBatchItemFailure[] = [];
  await Aigle.forEach(Records, async ({ body, messageId }) => {
    try {
      const message: InMessage = JSON.parse(body!);
      await processActions(messageId, message, timeStamp);
    } catch (e: any) {
      batchItemFailures.push({
        itemIdentifier: messageId,
      });
      console.log(e);
    }
  });
  return { batchItemFailures };
};

async function processActions(
  messageId: string,
  { player_id, friend_id, friend_action }: InMessage,
  timeStamp: number
) {
  switch (friend_action) {
    case FriendAction.Request: {
      await request(player_id, friend_id, timeStamp);
      break;
    }
    case FriendAction.Accept: {
      await accept(player_id, friend_id, timeStamp);
      break;
    }
    case FriendAction.Reject: {
      await reject(player_id, friend_id);
      break;
    }
    case FriendAction.Unfriend: {
      await unfriend(player_id, friend_id);
      break;
    }
    default:
      console.log("friend action not supported");
      return;
  }
}

async function request(
  player_id: string,
  friend_id: string,
  timeStamp: number
) {
  const requestParam: DocumentClient.PutItemInput = {
    TableName: friendTableName,
    Item: {
      [friendPk]: player_id,
      [friendSk]: friend_id,
      state: State.Requested,
      last_updated: timeStamp,
    },
    ConditionExpression: `attribute_not_exists(${friendPk}) AND :player_id <> :friend_id`,
    ExpressionAttributeValues: {
      ":player_id": player_id,
      ":friend_id": friend_id,
    },
  };
  try {
    await db.put(requestParam).promise();
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      console.log(
        `could not request, either item already exits or the same player id is used for friend id`
      );
      return;
    }
    throw e;
  }
}

async function accept(player_id: string, friend_id: string, timeStamp: number) {
  const acceptParam: DocumentClient.UpdateItemInput = {
    TableName: friendTableName,
    Key: {
      [friendPk]: player_id,
      [friendSk]: friend_id,
    },
    UpdateExpression: "SET #state = :friends, #last_updated = :timestamp",
    ConditionExpression: "#state = :pending",
    ExpressionAttributeNames: {
      "#state": "state",
      "#last_updated": "last_updated",
    },
    ExpressionAttributeValues: {
      ":pending": State.Pending,
      ":friends": State.Friends,
      ":timestamp": timeStamp,
    },
  };
  try {
    await db.update(acceptParam).promise();
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      console.log(`could not accept, state is not ${State.Pending}`);
      return;
    }
    throw e;
  }
}

async function reject(player_id: string, friend_id: string) {
  const rejectParam: DocumentClient.DeleteItemInput = {
    TableName: friendTableName,
    Key: {
      [friendPk]: player_id,
      [friendSk]: friend_id,
    },
    ConditionExpression: "#state = :pending",
    ExpressionAttributeNames: {
      "#state": "state",
    },
    ExpressionAttributeValues: {
      ":pending": State.Pending,
    },
  };
  try {
    await db.delete(rejectParam).promise();
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      console.log(`could not reject, state is not ${State.Pending}`);
      return;
    }
    throw e;
  }
}

async function unfriend(player_id: string, friend_id: string) {
  const unfriendParam: DocumentClient.DeleteItemInput = {
    TableName: friendTableName,
    Key: {
      [friendPk]: player_id,
      [friendSk]: friend_id,
    },
    ConditionExpression: "#state = :friends",
    ExpressionAttributeNames: {
      "#state": "state",
    },
    ExpressionAttributeValues: {
      ":friends": State.Friends,
    },
  };
  try {
    await db.delete(unfriendParam).promise();
  } catch (e: any) {
    if (e.name == "ConditionalCheckFailedException") {
      console.log(`could not unfriend, state is not ${State.Friends}`);
      return;
    }
    throw e;
  }
}
