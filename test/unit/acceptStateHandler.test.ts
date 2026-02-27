import { handler } from "../../lambda/acceptStateHandler";
import { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";

// Mock AWS SDK v3
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: (...args: any[]) => mockSend(...args) })) },
  UpdateCommand: jest.fn((params: any) => ({ ...params, _type: "Update" })),
}));

describe("acceptStateHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockSend.mockRejectedValue(error);

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

    mockSend.mockResolvedValue({});

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
