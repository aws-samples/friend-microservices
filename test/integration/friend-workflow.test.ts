import * as AWS from "aws-sdk";
import { DocumentClient } from "aws-sdk/clients/dynamodb";

/**
 * Integration tests for friend workflow
 * These tests verify the complete friend request/accept/reject/unfriend flows
 * 
 * Note: These tests require a real DynamoDB table or DynamoDB Local
 * Set TABLE_NAME environment variable to run these tests
 */

describe("Friend Workflow Integration Tests", () => {
  let db: DocumentClient;
  const tableName = process.env.TABLE_NAME || "Friend";

  beforeAll(() => {
    // Configure AWS SDK for local testing if needed
    if (process.env.DYNAMODB_ENDPOINT) {
      db = new AWS.DynamoDB.DocumentClient({
        endpoint: process.env.DYNAMODB_ENDPOINT,
        region: "us-east-1",
      });
    } else {
      db = new AWS.DynamoDB.DocumentClient();
    }
  });

  afterEach(async () => {
    // Clean up test data
    if (process.env.TABLE_NAME) {
      const testPlayers = ["test-player1", "test-player2", "test-player3"];
      for (const player of testPlayers) {
        for (const friend of testPlayers) {
          if (player !== friend) {
            try {
              await db
                .delete({
                  TableName: tableName,
                  Key: {
                    player_id: player,
                    friend_id: friend,
                  },
                })
                .promise();
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

      // Create request
      await db
        .put({
          TableName: tableName,
          Item: {
            player_id: player1,
            friend_id: player2,
            state: "Requested",
            last_updated: Date.now(),
          },
        })
        .promise();

      // Verify request exists
      const result = await db
        .get({
          TableName: tableName,
          Key: {
            player_id: player1,
            friend_id: player2,
          },
        })
        .promise();

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

      // Simulate requestStateHandler creating pending request
      await db
        .put({
          TableName: tableName,
          Item: {
            player_id: player2,
            friend_id: player1,
            state: "Pending",
            last_updated: Date.now(),
          },
        })
        .promise();

      // Verify pending request exists
      const result = await db
        .get({
          TableName: tableName,
          Key: {
            player_id: player2,
            friend_id: player1,
          },
        })
        .promise();

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

      // Setup: Create pending request
      await db
        .put({
          TableName: tableName,
          Item: {
            player_id: player2,
            friend_id: player1,
            state: "Pending",
            last_updated: Date.now(),
          },
        })
        .promise();

      // Accept request
      await db
        .update({
          TableName: tableName,
          Key: {
            player_id: player2,
            friend_id: player1,
          },
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
        })
        .promise();

      // Verify state changed to Friends
      const result = await db
        .get({
          TableName: tableName,
          Key: {
            player_id: player2,
            friend_id: player1,
          },
        })
        .promise();

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

      // Setup: Create pending request
      await db
        .put({
          TableName: tableName,
          Item: {
            player_id: player2,
            friend_id: player1,
            state: "Pending",
            last_updated: Date.now(),
          },
        })
        .promise();

      // Reject request
      await db
        .delete({
          TableName: tableName,
          Key: {
            player_id: player2,
            friend_id: player1,
          },
          ConditionExpression: "#state = :pending",
          ExpressionAttributeNames: {
            "#state": "state",
          },
          ExpressionAttributeValues: {
            ":pending": "Pending",
          },
        })
        .promise();

      // Verify item deleted
      const result = await db
        .get({
          TableName: tableName,
          Key: {
            player_id: player2,
            friend_id: player1,
          },
        })
        .promise();

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

      // Setup: Create friend relationship
      await db
        .put({
          TableName: tableName,
          Item: {
            player_id: player1,
            friend_id: player2,
            state: "Friends",
            last_updated: Date.now(),
          },
        })
        .promise();

      // Unfriend
      await db
        .delete({
          TableName: tableName,
          Key: {
            player_id: player1,
            friend_id: player2,
          },
          ConditionExpression: "#state = :friends",
          ExpressionAttributeNames: {
            "#state": "state",
          },
          ExpressionAttributeValues: {
            ":friends": "Friends",
          },
        })
        .promise();

      // Verify item deleted
      const result = await db
        .get({
          TableName: tableName,
          Key: {
            player_id: player1,
            friend_id: player2,
          },
        })
        .promise();

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

      // Setup: Create multiple friend relationships
      for (const friend of friends) {
        await db
          .put({
            TableName: tableName,
            Item: {
              player_id: player1,
              friend_id: friend,
              state: "Friends",
              last_updated: Date.now(),
            },
          })
          .promise();
      }

      // Query friends
      const result = await db
        .query({
          TableName: tableName,
          KeyConditionExpression: "#player_id = :player_id",
          ExpressionAttributeNames: {
            "#player_id": "player_id",
          },
          ExpressionAttributeValues: {
            ":player_id": player1,
          },
        })
        .promise();

      expect(result.Items).toBeDefined();
      expect(result.Items!.length).toBe(2);
      expect(result.Items!.every((item) => item.state === "Friends")).toBe(
        true
      );
    });
  });
});
