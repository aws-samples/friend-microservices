import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import {
  FilterCriteria,
  FilterRule,
  Runtime,
  StartingPosition,
} from "aws-cdk-lib/aws-lambda";
import {
  PolicyDocument,
  PolicyStatement,
  AnyPrincipal,
  Effect,
} from "aws-cdk-lib/aws-iam";
import { Friend, State } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Alias, Version } from "aws-cdk-lib/aws-lambda";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import {
  DynamoEventSource,
  SqsDlq,
  SqsEventSource,
  StreamEventSourceProps,
} from "aws-cdk-lib/aws-lambda-event-sources";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";
import {
  LambdaDeploymentGroup,
  LambdaDeploymentConfig,
} from "aws-cdk-lib/aws-codedeploy";
import { StageOptions } from "aws-cdk-lib/aws-apigateway";

const friendTableNameDefault = tableMap.get(Friend)!;
const friendPk = keyMap.get(Friend)!.get(Keys.PK)!;
const friendSk = keyMap.get(Friend)!.get(Keys.SK)!;

export class FriendMicroservicesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- Lấy context theo môi trường ---
    const env = this.node.tryGetContext("env") || "dev";
    const friendTableName =
      this.node.tryGetContext("friendTableName") || `friend-table-${env}`;
    const queueName =
      this.node.tryGetContext("queueName") || `friend-queue-${env}`;
    const billingModeStr =
      this.node.tryGetContext("dynamodbBillingMode") || "PAY_PER_REQUEST";
    const billingMode =
      billingModeStr === "PROVISIONED"
        ? BillingMode.PROVISIONED
        : BillingMode.PAY_PER_REQUEST;
    const readCapacity =
      Number(this.node.tryGetContext("dynamodbReadCapacity")) || 1;
    const writeCapacity =
      Number(this.node.tryGetContext("dynamodbWriteCapacity")) || 1;
    const enableEncryption =
      this.node.tryGetContext("enableEncryption") === true ||
      this.node.tryGetContext("enableEncryption") === "true";
    const apiThrottling =
      this.node.tryGetContext("apiThrottling") === true ||
      this.node.tryGetContext("apiThrottling") === "true";
    const apiThrottlingRateLimit =
      Number(this.node.tryGetContext("apiThrottlingRateLimit")) || 100;
    const apiThrottlingBurstLimit =
      Number(this.node.tryGetContext("apiThrottlingBurstLimit")) || 20;
    const allowedIpRanges = this.node.tryGetContext("allowedIpRanges") || [];
    const canaryDeployment =
      this.node.tryGetContext("canaryDeployment") === true ||
      this.node.tryGetContext("canaryDeployment") === "true";

    // --- Lambda function props ---
    const functionProp: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_18_X,
      memorySize: 1024,
    };

    // --- Lambda Functions ---
    const frontHandler = new NodejsFunction(this, "frontHandler", {
      entry: "lambda/frontHandler.ts",
      ...functionProp,
    });
    const requestStateHandler = new NodejsFunction(
      this,
      "requestStateHandler",
      {
        entry: "lambda/requestStateHandler.ts",
        ...functionProp,
      }
    );
    const acceptStateHandler = new NodejsFunction(this, "acceptStateHandler", {
      entry: "lambda/acceptStateHandler.ts",
      ...functionProp,
    });
    const rejectStateHandler = new NodejsFunction(this, "rejectStateHandler", {
      entry: "lambda/rejectStateHandler.ts",
      ...functionProp,
    });
    const unfriendStateHandler = new NodejsFunction(
      this,
      "unfriendStateHandler",
      {
        entry: "lambda/unfriendStateHandler.ts",
        ...functionProp,
      }
    );
    const readHandler = new NodejsFunction(this, "readHandler", {
      entry: "lambda/readHandler.ts",
      ...functionProp,
    });

    // --- DynamoDB Table ---
    const friendTable = new Table(this, friendTableName, {
      tableName: friendTableName,
      partitionKey: {
        name: friendPk,
        type: AttributeType.STRING,
      },
      sortKey: {
        name: friendSk,
        type: AttributeType.STRING,
      },
      billingMode,
      ...(billingMode === BillingMode.PROVISIONED
        ? { readCapacity, writeCapacity }
        : {}),
      ...(enableEncryption ? { encryption: TableEncryption.AWS_MANAGED } : {}),
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Grant permissions ---
    friendTable.grantWriteData(frontHandler);
    friendTable.grantStreamRead(requestStateHandler);
    friendTable.grantWriteData(requestStateHandler);
    friendTable.grantStreamRead(acceptStateHandler);
    friendTable.grantWriteData(acceptStateHandler);
    friendTable.grantStreamRead(rejectStateHandler);
    friendTable.grantWriteData(rejectStateHandler);
    friendTable.grantStreamRead(unfriendStateHandler);
    friendTable.grantWriteData(unfriendStateHandler);
    friendTable.grantReadData(readHandler);

    // --- SQS Queue ---
    const frontQueue = new Queue(this, queueName);
    frontHandler.addEventSource(
      new SqsEventSource(frontQueue, {
        reportBatchItemFailures: true,
        batchSize: 5,
      })
    );
    const stateHandlerDLQ = new SqsDlq(
      new Queue(this, `stateHandleDLQ-${env}`)
    );

    const streamEventSourceProps: StreamEventSourceProps = {
      startingPosition: StartingPosition.LATEST,
      batchSize: 5,
      retryAttempts: 1,
      onFailure: stateHandlerDLQ,
      reportBatchItemFailures: true,
    };

    // --- DynamoDB Stream Event Sources ---
    requestStateHandler.addEventSource(
      new DynamoEventSource(friendTable, {
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual("INSERT"),
            dynamodb: {
              NewImage: {
                state: { S: FilterRule.isEqual(State.Requested) },
              },
            },
          }),
        ],
        ...streamEventSourceProps,
      })
    );
    acceptStateHandler.addEventSource(
      new DynamoEventSource(friendTable, {
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual("MODIFY"),
            dynamodb: {
              NewImage: {
                state: { S: FilterRule.isEqual(State.Friends) },
              },
              OldImage: {
                state: { S: FilterRule.isEqual(State.Pending) },
              },
            },
          }),
        ],
        ...streamEventSourceProps,
      })
    );
    rejectStateHandler.addEventSource(
      new DynamoEventSource(friendTable, {
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual("REMOVE"),
            dynamodb: {
              OldImage: {
                state: { S: FilterRule.isEqual(State.Pending) },
              },
            },
          }),
        ],
        ...streamEventSourceProps,
      })
    );
    unfriendStateHandler.addEventSource(
      new DynamoEventSource(friendTable, {
        filters: [
          FilterCriteria.filter({
            eventName: FilterRule.isEqual("REMOVE"),
            dynamodb: {
              OldImage: {
                state: { S: FilterRule.isEqual(State.Friends) },
              },
            },
          }),
        ],
        ...streamEventSourceProps,
      })
    );

    // --- API Gateway với throttling, IP restriction ---
    let apiPolicy;
    if (allowedIpRanges.length > 0) {
      apiPolicy = new PolicyDocument({
        statements: [
          new PolicyStatement({
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*/*/*"],
            effect: Effect.ALLOW,
            principals: [new AnyPrincipal()],
            conditions: {
              IpAddress: { "aws:SourceIp": allowedIpRanges },
            },
          }),
          new PolicyStatement({
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*/*/*"],
            effect: Effect.DENY,
            principals: [new AnyPrincipal()],
            conditions: {
              NotIpAddress: { "aws:SourceIp": allowedIpRanges },
            },
          }),
        ],
      });
    }

    const apiGwDeployOptions: StageOptions = apiThrottling
      ? {
          throttlingRateLimit: apiThrottlingRateLimit,
          throttlingBurstLimit: apiThrottlingBurstLimit,
        }
      : {};

    const readAPI = new LambdaRestApi(this, "readAPI", {
      handler: readHandler,
      proxy: false,
      ...(apiPolicy ? { policy: apiPolicy } : {}),
      deployOptions: apiGwDeployOptions,
    });

    const friends = readAPI.root.addResource("friends");
    friends.addResource("{playerId}").addMethod("GET");
    friends
      .addResource("isFriend")
      .addResource("{playerId}")
      .addResource("{friendId}")
      .addMethod("GET");

    // --- Canary deployment cho prod ---
    if (canaryDeployment) {
      const version = readHandler.currentVersion;
      const alias = new Alias(this, "ReadHandlerProdAlias", {
        aliasName: "Prod",
        version,
      });
      new LambdaDeploymentGroup(this, "ReadHandlerCanaryDeployment", {
        alias,
        deploymentConfig: LambdaDeploymentConfig.CANARY_10PERCENT_5MINUTES,
      });
    }
  }
}
