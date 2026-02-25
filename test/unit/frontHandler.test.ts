import { handler } from "../../lambda/frontHandler";
import { SQSEvent, SQSBatchResponse } from "aws-lambda";
import * as AWS from "aws-sdk";

// Mock AWS SDK
jest.mock("aws-sdk", () => {
  const mockPut = jest.fn().mockReturnValue({ promise: jest.fn() });
  const mockUpdate = jest.fn().mockReturnValue({ promise: jest.fn() });
  const mockDelete = jest.fn().mockReturnValue({ promise: jest.fn() });

  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        put: mockPut,
        update: mockUpdate,
        delete: mockDelete,
      })),
    },
  };
});

describe("frontHandler", () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = new AWS.DynamoDB.DocumentClient();
  });

  describe("Request action", () => {
    it("should create a friend request successfully", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Request",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      mockDb.put.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockDb.put).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "Friend",
          Item: expect.objectContaining({
            player_id: "player1",
            friend_id: "player2",
            state: "Requested",
          }),
        })
      );
    });

    it("should handle duplicate request gracefully", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Request",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      const error: any = new Error("Conditional check failed");
      error.name = "ConditionalCheckFailedException";
      mockDb.put.mockReturnValue({
        promise: jest.fn().mockRejectedValue(error),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
    });

    it("should reject self-friend request", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player1",
              friend_action: "Request",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      const error: any = new Error("Conditional check failed");
      error.name = "ConditionalCheckFailedException";
      mockDb.put.mockReturnValue({
        promise: jest.fn().mockRejectedValue(error),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });

  describe("Accept action", () => {
    it("should accept a pending friend request", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Accept",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      mockDb.update.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockDb.update).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "Friend",
          Key: {
            player_id: "player1",
            friend_id: "player2",
          },
          ConditionExpression: "#state = :pending",
        })
      );
    });

    it("should handle accept when state is not pending", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Accept",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      const error: any = new Error("Conditional check failed");
      error.name = "ConditionalCheckFailedException";
      mockDb.update.mockReturnValue({
        promise: jest.fn().mockRejectedValue(error),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
    });
  });

  describe("Reject action", () => {
    it("should reject a pending friend request", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Reject",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      mockDb.delete.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockDb.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "Friend",
          Key: {
            player_id: "player1",
            friend_id: "player2",
          },
          ConditionExpression: "#state = :pending",
        })
      );
    });
  });

  describe("Unfriend action", () => {
    it("should unfriend an existing friend", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Unfriend",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      mockDb.delete.mockReturnValue({
        promise: jest.fn().mockResolvedValue({}),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(0);
      expect(mockDb.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "Friend",
          Key: {
            player_id: "player1",
            friend_id: "player2",
          },
          ConditionExpression: "#state = :friends",
        })
      );
    });
  });

  describe("Error handling", () => {
    it("should return batch item failures for unexpected errors", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: JSON.stringify({
              player_id: "player1",
              friend_id: "player2",
              friend_action: "Request",
            }),
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      mockDb.put.mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error("DynamoDB error")),
      });

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(1);
      expect(result.batchItemFailures[0].itemIdentifier).toBe("msg-1");
    });

    it("should handle invalid JSON in message body", async () => {
      const event: SQSEvent = {
        Records: [
          {
            messageId: "msg-1",
            body: "invalid json",
            receiptHandle: "receipt-1",
            attributes: {} as any,
            messageAttributes: {},
            md5OfBody: "",
            eventSource: "aws:sqs",
            eventSourceARN: "",
            awsRegion: "us-east-1",
          },
        ],
      };

      const result = (await handler(event, {} as any, {} as any)) as SQSBatchResponse;

      expect(result.batchItemFailures).toHaveLength(1);
    });
  });
});
