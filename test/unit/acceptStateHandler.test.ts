import { handler } from "../../lambda/acceptStateHandler";
import { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";
import * as AWS from "aws-sdk";

// Mock AWS SDK
jest.mock("aws-sdk", () => {
  const mockUpdate = jest.fn().mockReturnValue({ promise: jest.fn() });

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        update: mockUpdate,
      })),
    },
  };
});

describe("acceptStateHandler", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = new AWS.DynamoDB.DocumentClient();
  });

  it("should update friend state to Friends for receiver", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "MODIFY",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    mockDb.update.mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    });

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockDb.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "Friend",
        Key: {
          player_id: "player2",
          friend_id: "player1",
        },
        ConditionExpression: "#state = :requested",
        UpdateExpression: "SET #state = :friends, #last_updated = :last_updated",
      })
    );
  });

  it("should handle conditional check failure gracefully", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "MODIFY",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    const error: any = new Error("Conditional check failed");
    error.name = "ConditionalCheckFailedException";
    mockDb.update.mockReturnValue({
      promise: jest.fn().mockRejectedValue(error),
    });

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
  });

  it("should handle unexpected errors", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "MODIFY",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    mockDb.update.mockReturnValue({
      promise: jest.fn().mockRejectedValue(new Error("DynamoDB error")),
    });

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("seq-1");
  });

  it("should process multiple records", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "MODIFY",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Friends" },
            },
          },
        },
        {
          eventID: "2",
          eventName: "MODIFY",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-2",
            NewImage: {
              player_id: { S: "player3" },
              friend_id: { S: "player4" },
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    mockDb.update.mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    });

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });
});
