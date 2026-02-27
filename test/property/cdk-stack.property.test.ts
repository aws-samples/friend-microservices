import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as fc from "fast-check";
import { FriendMicroservicesStack } from "../../lib/friend-microservices-stack";

// Shared stack synthesis — deterministic, so we synthesize once
const app = new cdk.App();
const stack = new FriendMicroservicesStack(app, "PropertyTestStack");
const template = Template.fromStack(stack);

// Feature: cdk-modernization, Property 1: All Lambda functions use NODEJS_22_X runtime
describe("Property 1: All Lambda functions use NODEJS_22_X runtime", () => {
  /** Validates: Requirements 1.1, 1.2 */
  it("every AWS::Lambda::Function has Runtime nodejs22.x", () => {
    const lambdas = template.findResources("AWS::Lambda::Function");
    const lambdaEntries = Object.entries(lambdas);

    expect(lambdaEntries.length).toBeGreaterThan(0);

    fc.assert(
      fc.property(
        fc.constantFrom(...lambdaEntries),
        ([logicalId, resource]: [string, any]) => {
          expect(resource.Properties.Runtime).toBe("nodejs22.x");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: cdk-modernization, Property 3: Resource type counts are preserved after modernization
describe("Property 3: Resource type counts are preserved after modernization", () => {
  /** Validates: Requirements 9.1 */
  it("synthesized template has exactly 7 Lambda functions, 1 DynamoDB table, 2 SQS queues, 2 REST APIs", () => {
    // TableV2 synthesizes as AWS::DynamoDB::GlobalTable in CloudFormation
    const expectedCounts: [string, number][] = [
      ["AWS::Lambda::Function", 7],
      ["AWS::DynamoDB::GlobalTable", 1],
      ["AWS::SQS::Queue", 2],
      ["AWS::ApiGateway::RestApi", 2],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...expectedCounts),
        ([resourceType, expectedCount]: [string, number]) => {
          const resources = template.findResources(resourceType);
          expect(Object.keys(resources).length).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// Unit tests for DynamoDB table properties
describe("DynamoDB table properties", () => {
  /** Validates: Requirements 2.2, 2.3, 2.4, 2.5 */
  // TableV2 synthesizes as AWS::DynamoDB::GlobalTable
  const tables = template.findResources("AWS::DynamoDB::GlobalTable");
  const tableLogicalIds = Object.keys(tables);
  const tableResource = tables[tableLogicalIds[0]];

  it("has correct partition key (player_id, S)", () => {
    const keySchema = tableResource.Properties.KeySchema;
    const partitionKey = keySchema.find(
      (k: any) => k.KeyType === "HASH"
    );
    expect(partitionKey.AttributeName).toBe("player_id");

    const attrDefs = tableResource.Properties.AttributeDefinitions;
    const pkAttr = attrDefs.find(
      (a: any) => a.AttributeName === "player_id"
    );
    expect(pkAttr.AttributeType).toBe("S");
  });

  it("has correct sort key (friend_id, S)", () => {
    const keySchema = tableResource.Properties.KeySchema;
    const sortKey = keySchema.find((k: any) => k.KeyType === "RANGE");
    expect(sortKey.AttributeName).toBe("friend_id");

    const attrDefs = tableResource.Properties.AttributeDefinitions;
    const skAttr = attrDefs.find(
      (a: any) => a.AttributeName === "friend_id"
    );
    expect(skAttr.AttributeType).toBe("S");
  });

  it("has PAY_PER_REQUEST billing mode", () => {
    expect(tableResource.Properties.BillingMode).toBe("PAY_PER_REQUEST");
  });

  it("has NEW_AND_OLD_IMAGES stream view type", () => {
    expect(
      tableResource.Properties.StreamSpecification.StreamViewType
    ).toBe("NEW_AND_OLD_IMAGES");
  });

  it("has Delete deletion policy", () => {
    expect(tableResource.DeletionPolicy).toBe("Delete");
  });
});
