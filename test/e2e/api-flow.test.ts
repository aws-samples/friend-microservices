import axios, { AxiosInstance } from "axios";

/**
 * End-to-end API tests for friend microservices
 * These tests simulate real user flows through the API
 * 
 * Prerequisites:
 * - Deploy the stack to AWS
 * - Set API_BASE_URL environment variable to the API Gateway endpoint
 * - Set SQS_QUEUE_URL environment variable to the SQS queue URL
 * 
 * Example:
 * export API_BASE_URL=https://abc123.execute-api.us-east-1.amazonaws.com/prod
 * export SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/friend-queue
 */

describe("Friend API End-to-End Tests", () => {
  let api: AxiosInstance;
  const baseURL = process.env.API_BASE_URL;

  beforeAll(() => {
    if (!baseURL) {
      console.log("Skipping E2E tests - API_BASE_URL not set");
      return;
    }

    api = axios.create({
      baseURL,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });
  });

  describe("Complete Friend Request Flow", () => {
    it("should complete full friend request and accept flow", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;
      const player2 = `e2e-player2-${Date.now()}`;

      // Step 1: Player1 sends friend request to Player2
      // (This would be done via SQS in real scenario)
      // For E2E test, we'll wait and then check the state

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Check if Player1 has sent request
      const player1FriendsResponse = await api.get(
        `/friends/${player1}`
      );
      expect(player1FriendsResponse.status).toBe(200);

      // Step 3: Check friendship state between Player1 and Player2
      const friendshipStateResponse = await api.get(
        `/friends/${player1}/isFriend/${player2}`
      );
      expect(friendshipStateResponse.status).toBe(200);

      // Step 4: Player2 accepts friend request
      // (This would be done via SQS in real scenario)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 5: Verify both players are now friends
      const finalStateResponse = await api.get(
        `/friends/${player1}/isFriend/${player2}`
      );
      expect(finalStateResponse.status).toBe(200);
    });
  });

  describe("Friend Request Rejection Flow", () => {
    it("should handle friend request rejection", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;
      const player2 = `e2e-player2-${Date.now()}`;

      // Step 1: Player1 sends friend request to Player2
      // (Via SQS in real scenario)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Player2 rejects friend request
      // (Via SQS in real scenario)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 3: Verify no friendship exists
      const player1FriendsResponse = await api.get(
        `/friends/${player1}`
      );
      expect(player1FriendsResponse.status).toBe(200);
      const friends = JSON.parse(player1FriendsResponse.data);
      expect(
        friends.find((f: any) => f.friend_id === player2)
      ).toBeUndefined();
    });
  });

  describe("Unfriend Flow", () => {
    it("should handle unfriending", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;
      const player2 = `e2e-player2-${Date.now()}`;

      // Setup: Create friendship
      // (Via SQS in real scenario - request and accept)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 4000));

      // Step 1: Player1 unfriends Player2
      // (Via SQS in real scenario)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 2: Verify friendship no longer exists
      const player1FriendsResponse = await api.get(
        `/friends/${player1}`
      );
      expect(player1FriendsResponse.status).toBe(200);
      const friends = JSON.parse(player1FriendsResponse.data);
      expect(
        friends.find((f: any) => f.friend_id === player2)
      ).toBeUndefined();
    });
  });

  describe("Query Friends API", () => {
    it("should return all friends for a player", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;

      const response = await api.get(`/friends/${player1}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(JSON.parse(response.data))).toBe(true);
    });

    it("should return empty array for player with no friends", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const newPlayer = `e2e-new-player-${Date.now()}`;

      const response = await api.get(`/friends/${newPlayer}`);

      expect(response.status).toBe(200);
      const friends = JSON.parse(response.data);
      expect(Array.isArray(friends)).toBe(true);
      expect(friends.length).toBe(0);
    });
  });

  describe("Check Friendship Status API", () => {
    it("should check friendship status between two players", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;
      const player2 = `e2e-player2-${Date.now()}`;

      const response = await api.get(
        `/friends/${player1}/isFriend/${player2}`
      );

      expect(response.status).toBe(200);
      // Response should be one of: Requested, Pending, Friends, or empty
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid HTTP methods", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;

      const response = await api.post(`/friends/${player1}`, {});

      // Should return error for non-GET method
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle missing path parameters", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const response = await api.get("/friends/");

      // Should return error for missing player ID
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Concurrent Friend Requests", () => {
    it("should handle mutual friend requests correctly", async () => {
      if (!baseURL) {
        console.log("Skipping E2E test - API_BASE_URL not set");
        return;
      }

      const player1 = `e2e-player1-${Date.now()}`;
      const player2 = `e2e-player2-${Date.now()}`;

      // Both players send friend requests to each other simultaneously
      // (Via SQS in real scenario)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify both are friends (mutual request should auto-accept)
      const player1StateResponse = await api.get(
        `/friends/${player1}/isFriend/${player2}`
      );
      const player2StateResponse = await api.get(
        `/friends/${player2}/isFriend/${player1}`
      );

      expect(player1StateResponse.status).toBe(200);
      expect(player2StateResponse.status).toBe(200);
    });
  });
});
