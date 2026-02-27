import { handler } from "../../lambda/requestStateHandler";
import { DynamoDBStreamEvent, DynamoDBBatchResponse } from "aws-lambda";

// Mock AWS SDK v3
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: (...args: any[]) => mockSend(...args) })) },
  PutCommand: jest.fn((params: any) => ({ ...params, _type: "Put" })),
  TransactWriteCommand: jest.fn((params: any) => ({ ...params, _type: "TransactWrite" })),
}));

describe("requestStateHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create pending request for receiver", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Requested" },
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
        Item: expect.objectContaining({
          player_id: "player2",
          friend_id: "player1",
          state: "Pending",
        }),
      })
    );
  });

  it("should handle mutual friend request with transaction", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Requested" },
            },
          },
        },
      ],
    };

    const error: any = new Error("Conditional check failed");
    error.name = "ConditionalCheckFailedException";
    mockSend
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({});

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        TransactItems: expect.arrayContaining([
          expect.objectContaining({
            Update: expect.objectContaining({
              Key: {
                player_id: "player2",
                friend_id: "player1",
              },
              ConditionExpression: "#state = :requested",
            }),
          }),
          expect.objectContaining({
            Update: expect.objectContaining({
              Key: {
                player_id: "player1",
                friend_id: "player2",
              },
              ConditionExpression: "#state = :requested",
            }),
          }),
        ]),
      })
    );
  });

  it("should handle transaction conflict and retry", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Requested" },
            },
          },
        },
      ],
    };

    const putError: any = new Error("Conditional check failed");
    putError.name = "ConditionalCheckFailedException";

    const transactError: any = new Error(
      "Transaction cancelled: TransactionConflict"
    );
    transactError.name = "TransactionCanceledException";

    mockSend
      .mockRejectedValueOnce(putError)
      .mockRejectedValueOnce(transactError);

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0].itemIdentifier).toBe("seq-1");
  });

  it("should handle transaction cancellation without conflict", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Requested" },
            },
          },
        },
      ],
    };

    const putError: any = new Error("Conditional check failed");
    putError.name = "ConditionalCheckFailedException";

    const transactError: any = new Error("Transaction cancelled");
    transactError.name = "TransactionCanceledException";

    mockSend
      .mockRejectedValueOnce(putError)
      .mockRejectedValueOnce(transactError);

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(0);
  });

  it("should handle unexpected errors", async () => {
    const event: DynamoDBStreamEvent = {
      Records: [
        {
          eventID: "1",
          eventName: "INSERT",
          eventVersion: "1.1",
          eventSource: "aws:dynamodb",
          awsRegion: "us-east-1",
          dynamodb: {
            SequenceNumber: "seq-1",
            NewImage: {
              player_id: { S: "player1" },
              friend_id: { S: "player2" },
              state: { S: "Requested" },
            },
          },
        },
      ],
    };

    mockSend.mockRejectedValue(new Error("DynamoDB error"));

    const result = (await handler(event, {} as any, {} as any)) as DynamoDBBatchResponse;

    expect(result.batchItemFailures).toHaveLength(1);
  });
});
