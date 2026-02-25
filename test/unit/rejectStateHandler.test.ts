import { handler } from "../../lambda/rejectStateHandler";
import { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";
import * as AWS from "aws-sdk";

// Mock AWS SDK
jest.mock("aws-sdk", () => {
  const mockDelete = jest.fn().mockReturnValue({ promise: jest.fn() });

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        delete: mockDelete,
      })),
    },
  };
});

describe("rejectStateHandler", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = new AWS.DynamoDB.DocumentClient();
  });

  it("should delete pending request for receiver", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "REMOVE",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            OldImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Pending" },
            },
          },
        },
      ],
    };

    mockDb.delete.mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    });

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockDb.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "Friend",
        Key: {
          player_id: "player2",
          friend_id: "player1",
        },
        ConditionExpression: "#state = :requested",
      })
    );
  });

  it("should handle conditional check failure gracefully", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "REMOVE",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            OldImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Pending" },
            },
          },
        },
      ],
    };

    const error: any = new Error("Conditional check failed");
    error.name = "ConditionalCheckFailedException";
    mockDb.delete.mockReturnValue({
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
          eventName: "REMOVE",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            OldImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Pending" },
            },
          },
        },
      ],
    };

    mockDb.delete.mockReturnValue({
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
          eventName: "REMOVE",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            OldImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Pending" },
            },
          },
        },
        {
          eventID: "2",
          eventName: "REMOVE",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-2",
            OldImage: {
              player_id: { S: "player3" },
              friend_id: { S: "player4" },
              state: { S: "Pending" },
            },
          },
        },
      ],
    };

    mockDb.delete.mockReturnValue({
      promise: jest.fn().mockResolvedValue({}),
    });

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockDb.delete).toHaveBeenCalledTimes(2);
  });
});
