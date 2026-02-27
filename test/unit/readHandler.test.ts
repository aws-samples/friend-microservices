import { handler } from "../../lambda/readHandler";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

// Mock AWS SDK v3
const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn(() => ({})),
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn(() => ({ send: (...args: any[]) => mockSend(...args) })) },
  GetCommand: jest.fn((params: any) => ({ ...params, _type: "Get" })),
  QueryCommand: jest.fn((params: any) => ({ ...params, _type: "Query" })),
}));

describe("readHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /friends/{playerId}", () => {
    it("should return all friends for a player", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "GET",
        path: "/friends/player1",
        pathParameters: {
          playerId: "player1",
        },
      };

      const mockItems = [
        { player_id: "player1", friend_id: "player2", state: "Friends" },
        { player_id: "player1", friend_id: "player3", state: "Pending" },
      ];

      mockSend.mockResolvedValue({ Items: mockItems });

      const result = (await handler(
        event as APIGatewayProxyEvent,
        {} as any,
        {} as any
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(mockItems);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "Friend",
          KeyConditionExpression: "#player_id = :player_id",
          ExpressionAttributeValues: {
            ":player_id": "player1",
          },
        })
      );
    });

    it("should return empty array when player has no friends", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "GET",
        path: "/friends/player1",
        pathParameters: {
          playerId: "player1",
        },
      };

      mockSend.mockResolvedValue({ Items: [] });

      const result = (await handler(
        event as APIGatewayProxyEvent,
        {} as any,
        {} as any
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual([]);
    });
  });

  describe("GET /friends/{playerId}/isFriend/{friendId}", () => {
    it("should return friendship state when relationship exists", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "GET",
        path: "/friends/player1/isFriend/player2",
        pathParameters: {
          playerId: "player1",
          friendId: "player2",
        },
      };

      mockSend.mockResolvedValue({ Item: { state: "Friends" } });

      const result = (await handler(
        event as APIGatewayProxyEvent,
        {} as any,
        {} as any
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe("Friends");
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          TableName: "Friend",
          Key: {
            player_id: "player1",
            friend_id: "player2",
          },
        })
      );
    });

    it("should handle pending friendship state", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "GET",
        path: "/friends/player1/isFriend/player2",
        pathParameters: {
          playerId: "player1",
          friendId: "player2",
        },
      };

      mockSend.mockResolvedValue({ Item: { state: "Pending" } });

      const result = (await handler(
        event as APIGatewayProxyEvent,
        {} as any,
        {} as any
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe("Pending");
    });

    it("should handle requested friendship state", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "GET",
        path: "/friends/player1/isFriend/player2",
        pathParameters: {
          playerId: "player1",
          friendId: "player2",
        },
      };

      mockSend.mockResolvedValue({ Item: { state: "Requested" } });

      const result = (await handler(
        event as APIGatewayProxyEvent,
        {} as any,
        {} as any
      )) as APIGatewayProxyResult;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBe("Requested");
    });
  });

  describe("Error handling", () => {
    it("should throw error for non-GET methods", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "POST",
        path: "/friends/player1",
        pathParameters: {
          playerId: "player1",
        },
      };

      await expect(
        handler(event as APIGatewayProxyEvent, {} as any, {} as any)
      ).rejects.toThrow("friends only accept GET method, you tried: POST");
    });

    it("should handle DynamoDB errors", async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: "GET",
        path: "/friends/player1",
        pathParameters: {
          playerId: "player1",
        },
      };

      mockSend.mockRejectedValue(new Error("DynamoDB error"));

      await expect(
        handler(event as APIGatewayProxyEvent, {} as any, {} as any)
      ).rejects.toThrow("DynamoDB error");
    });
  });
});
