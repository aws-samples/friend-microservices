import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Integration tests for friend workflow
 * These tests verify the complete friend request/accept/reject/unfriend flows
 *
 * Note: These tests require a real DynamoDB table or DynamoDB Local
 * Set TABLE_NAME environment variable to run these tests
 */

describe("Friend Workflow Integration Tests", () => {
  let db: DynamoDBDocumentClient;
  const tableName = process.env.TABLE_NAME || "Friend";

  beforeAll(() => {
    const clientConfig = process.env.DYNAMODB_ENDPOINT
      ? { endpoint: process.env.DYNAMODB_ENDPOINT, region: "us-east-1" }
      : {};
    db = DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
  });

  afterEach(async () => {
    if (process.env.TABLE_NAME) {
      const testPlayers = ["test-player1", "test-player2", "test-player3"];
      for (const player of testPlayers) {
        for (const friend of testPlayers) {
          if (player !== friend) {
            try {
              await db.send(new DeleteCommand({
                TableName: tableName,
                Key: { player_id: player, friend_id: friend },
              }));
            } catch (e) {
              // Ignore errors during cleanup
            }
          }
        }
      }
    }
  });

  describe("Friend Request Flow", () => {
    it("should create a friend request", async () => {
      if (!process.env.TABLE_NAME) {
        console.log("Skipping integration test - TABLE_NAME not set");
        return;
      }

      const player1 = "test-player1";
      const player2 = "test-player2";

      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          player_id: player1,
          friend_id: player2,
          state: "Requested",
          last_updated: Date.now(),
        },
      }));

      const result = await db.send(new GetCommand({
        TableName: tableName,
        Key: { player_id: player1, friend_id: player2 },
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item!.state).toBe("Requested");
    });

    it("should create pending request for receiver", async () => {
      if (!process.env.TABLE_NAME) {
        console.log("Skipping integration test - TABLE_NAME not set");
        return;
      }

      const player1 = "test-player1";
      const player2 = "test-player2";

      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          player_id: player2,
          friend_id: player1,
          state: "Pending",
          last_updated: Date.now(),
        },
      }));

      const result = await db.send(new GetCommand({
        TableName: tableName,
        Key: { player_id: player2, friend_id: player1 },
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item!.state).toBe("Pending");
    });
  });

  describe("Accept Friend Request Flow", () => {
    it("should accept a pending friend request", async () => {
      if (!process.env.TABLE_NAME) {
        console.log("Skipping integration test - TABLE_NAME not set");
        return;
      }

      const player1 = "test-player1";
      const player2 = "test-player2";

      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          player_id: player2,
          friend_id: player1,
          state: "Pending",
          last_updated: Date.now(),
        },
      }));

      await db.send(new UpdateCommand({
        TableName: tableName,
        Key: { player_id: player2, friend_id: player1 },
        UpdateExpression: "SET #state = :friends, #last_updated = :timestamp",
        ConditionExpression: "#state = :pending",
        ExpressionAttributeNames: {
          "#state": "state",
          "#last_updated": "last_updated",
        },
        ExpressionAttributeValues: {
          ":pending": "Pending",
          ":friends": "Friends",
          ":timestamp": Date.now(),
        },
      }));

      const result = await db.send(new GetCommand({
        TableName: tableName,
        Key: { player_id: player2, friend_id: player1 },
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item!.state).toBe("Friends");
    });
  });

  describe("Reject Friend Request Flow", () => {
    it("should reject a pending friend request", async () => {
      if (!process.env.TABLE_NAME) {
        console.log("Skipping integration test - TABLE_NAME not set");
        return;
      }

      const player1 = "test-player1";
      const player2 = "test-player2";

      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          player_id: player2,
          friend_id: player1,
          state: "Pending",
          last_updated: Date.now(),
        },
      }));

      await db.send(new DeleteCommand({
        TableName: tableName,
        Key: { player_id: player2, friend_id: player1 },
        ConditionExpression: "#state = :pending",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":pending": "Pending" },
      }));

      const result = await db.send(new GetCommand({
        TableName: tableName,
        Key: { player_id: player2, friend_id: player1 },
      }));

      expect(result.Item).toBeUndefined();
    });
  });

  describe("Unfriend Flow", () => {
    it("should unfriend an existing friend", async () => {
      if (!process.env.TABLE_NAME) {
        console.log("Skipping integration test - TABLE_NAME not set");
        return;
      }

      const player1 = "test-player1";
      const player2 = "test-player2";

      await db.send(new PutCommand({
        TableName: tableName,
        Item: {
          player_id: player1,
          friend_id: player2,
          state: "Friends",
          last_updated: Date.now(),
        },
      }));

      await db.send(new DeleteCommand({
        TableName: tableName,
        Key: { player_id: player1, friend_id: player2 },
        ConditionExpression: "#state = :friends",
        ExpressionAttributeNames: { "#state": "state" },
        ExpressionAttributeValues: { ":friends": "Friends" },
      }));

      const result = await db.send(new GetCommand({
        TableName: tableName,
        Key: { player_id: player1, friend_id: player2 },
      }));

      expect(result.Item).toBeUndefined();
    });
  });

  describe("Query Friends", () => {
    it("should query all friends for a player", async () => {
      if (!process.env.TABLE_NAME) {
        console.log("Skipping integration test - TABLE_NAME not set");
        return;
      }

      const player1 = "test-player1";
      const friends = ["test-player2", "test-player3"];

      for (const friend of friends) {
        await db.send(new PutCommand({
          TableName: tableName,
          Item: {
            player_id: player1,
            friend_id: friend,
            state: "Friends",
            last_updated: Date.now(),
          },
        }));
      }

      const result = await db.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#player_id = :player_id",
        ExpressionAttributeNames: { "#player_id": "player_id" },
        ExpressionAttributeValues: { ":player_id": player1 },
      }));

      expect(result.Items).toBeDefined();
      expect(result.Items!.length).toBe(2);
      expect(result.Items!.every((item) => item.state === "Friends")).toBe(true);
    });
  });
});
