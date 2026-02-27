import { handler } from "../../lambda/unfriendStateHandler";
import { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";

// Mock AWS SDK v3
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: (...args: any[]) => mockSend(...args) })) },
  DeleteCommand: jest.fn((params: any) => ({ ...params, _type: "Delete" })),
}));

describe("unfriendStateHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should delete friend relationship for receiver", async () => {
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
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    mockSend.mockResolvedValue({});

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "Friend",
        Key: {
          player_id: "player2",
          friend_id: "player1",
        },
        ConditionExpression: "#state = :friends",
      })
    );
  });

  it("should handle conditional check failure gracefully (second unfriend call)", async () => {
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
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    const error: any = new Error("Conditional check failed");
    error.name = "ConditionalCheckFailedException";
    mockSend.mockRejectedValue(error);

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    // Should not fail because handler is called twice for both players
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
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    mockSend.mockRejectedValue(new Error("DynamoDB error"));

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
              state: { S: "Friends" },
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
              state: { S: "Friends" },
            },
          },
        },
      ],
    };

    mockSend.mockResolvedValue({});

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
