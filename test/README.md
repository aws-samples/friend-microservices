# Friend Microservices Tests

This directory contains comprehensive tests for the friend-microservices project.

## Test Structure

```
test/
├── unit/                           # Unit tests for individual Lambda handlers
│   ├── frontHandler.test.ts       # Tests for SQS message processing
│   ├── readHandler.test.ts        # Tests for API Gateway read operations
│   ├── requestStateHandler.test.ts # Tests for DynamoDB Stream request handling
│   ├── acceptStateHandler.test.ts  # Tests for DynamoDB Stream accept handling
│   ├── rejectStateHandler.test.ts  # Tests for DynamoDB Stream reject handling
│   └── unfriendStateHandler.test.ts # Tests for DynamoDB Stream unfriend handling
├── integration/                    # Integration tests for DynamoDB operations
│   └── friend-workflow.test.ts    # Tests for complete friend workflows
├── e2e/                           # End-to-end API tests
│   └── api-flow.test.ts          # Tests for real user API flows
└── friend-microservices.test.ts  # CDK infrastructure tests
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Unit Tests Only
```bash
pnpm test -- test/unit
```

### Integration Tests Only
```bash
# Requires DynamoDB table or DynamoDB Local
export TABLE_NAME=Friend
export DYNAMODB_ENDPOINT=http://localhost:8000  # Optional, for DynamoDB Local
pnpm test -- test/integration
```

### E2E Tests Only
```bash
# Requires deployed stack
export API_BASE_URL=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com/prod
export SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/friend-queue
pnpm test -- test/e2e
```

### With Coverage
```bash
pnpm test -- --coverage
```

### Watch Mode
```bash
pnpm test -- --watch
```

## Test Coverage

The test suite aims for 90%+ coverage across:
- All Lambda handlers (frontHandler, readHandler, requestStateHandler, acceptStateHandler, rejectStateHandler, unfriendStateHandler)
- Data models (Friend, tableDecorator)
- Complete friend workflows (request, accept, reject, unfriend)
- API endpoints (GET /friends/{playerId}, GET /friends/{playerId}/isFriend/{friendId})
- Error handling and edge cases

## Unit Tests

Unit tests mock AWS SDK calls and test individual Lambda handler logic:
- Request creation and validation
- Accept/reject/unfriend operations
- Conditional check handling
- Error handling and batch failures
- SQS and DynamoDB Stream event processing

## Integration Tests

Integration tests verify DynamoDB operations against a real or local DynamoDB instance:
- Complete friend request flow
- Accept and reject workflows
- Unfriend operations
- Query operations
- Data consistency

### Setting up DynamoDB Local

```bash
# Download and run DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# Create test table
aws dynamodb create-table \
  --table-name Friend \
  --attribute-definitions \
    AttributeName=player_id,AttributeType=S \
    AttributeName=friend_id,AttributeType=S \
  --key-schema \
    AttributeName=player_id,KeyType=HASH \
    AttributeName=friend_id,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:8000
```

## E2E Tests

E2E tests simulate real user flows through the deployed API:
- Complete friend request and accept flow
- Friend request rejection
- Unfriend operations
- Query friends API
- Check friendship status API
- Concurrent friend requests (mutual requests)
- Error handling

### Prerequisites for E2E Tests

1. Deploy the stack:
```bash
pnpm run cdk deploy
```

2. Set environment variables:
```bash
export API_BASE_URL=<your-api-gateway-url>
export SQS_QUEUE_URL=<your-sqs-queue-url>
```

## Coverage Thresholds

The project enforces minimum coverage thresholds:
- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

## Continuous Integration

Tests should be run in CI/CD pipeline:
1. Unit tests (always)
2. Integration tests (with DynamoDB Local)
3. E2E tests (after deployment to test environment)

## Troubleshooting

### Tests fail with "Cannot find module"
```bash
pnpm install
```

### Integration tests fail with connection error
Ensure DynamoDB Local is running or TABLE_NAME points to valid table.

### E2E tests skip all tests
Set API_BASE_URL environment variable to deployed API Gateway endpoint.

### Coverage below threshold
Run `pnpm test -- --coverage` to see which files need more tests.
