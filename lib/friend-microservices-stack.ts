import {
  AttributeType,
  BillingMode,
  StreamViewType,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import {
  CfnEventSourceMapping,
  EventSourceMapping,
  EventSourceMappingOptions,
  Runtime,
  StartingPosition,
} from "aws-cdk-lib/aws-lambda";
import { Friend, State } from "../models/friend";
import { keyMap, Keys, tableMap } from "../models/tableDecorator";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { SqsDlq, SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { LambdaRestApi } from "aws-cdk-lib/aws-apigateway";

const friendTableName = tableMap.get(Friend)!;
const friendPk = keyMap.get(Friend)!.get(Keys.PK)!;
const friendSk = keyMap.get(Friend)!.get(Keys.SK)!;

export class FriendMicroservicesStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const functionProp: NodejsFunctionProps = {
      runtime: Runtime.NODEJS_14_X,
      memorySize: 1024,
    };

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

    const friendTable = new Table(this, "Friend", {
      tableName: friendTableName,
      partitionKey: {
        name: friendPk,
        type: AttributeType.STRING,
      },
      sortKey: {
        name: friendSk,
        type: AttributeType.STRING,
      },
      billingMode: BillingMode.PAY_PER_REQUEST,
      stream: StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: RemovalPolicy.DESTROY,
    });

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

    const frontQueue = new Queue(this, "frontQueue");
    frontHandler.addEventSource(
      new SqsEventSource(frontQueue, {
        reportBatchItemFailures: true,
        batchSize: 5,
      })
    );

    const stateHandleDLQ = new SqsDlq(new Queue(this, "stateHandleDLQ"));

    const eventSourceMappingOptions: EventSourceMappingOptions = {
      startingPosition: StartingPosition.LATEST,
      batchSize: 5,
      eventSourceArn: friendTable.tableStreamArn,
      retryAttempts: 1,
      onFailure: stateHandleDLQ,
      reportBatchItemFailures: true,
    };

    const requestStateSourceMapping = new EventSourceMapping(
      this,
      "requestStateHandlerSourceMapping",
      {
        target: requestStateHandler,
        ...eventSourceMappingOptions,
      }
    );
    const requestCfnSourceMapping = requestStateSourceMapping.node
      .defaultChild as CfnEventSourceMapping;
    requestCfnSourceMapping.addPropertyOverride("FilterCriteria", {
      Filters: [
        {
          Pattern: JSON.stringify({
            dynamodb: {
              NewImage: {
                state: { S: [State.Requested] },
              },
            },
            eventName: ["INSERT"],
          }),
        },
      ],
    });

    const acceptStateSourceMapping = new EventSourceMapping(
      this,
      "acceptStateHandlerSourceMapping",
      {
        target: acceptStateHandler,
        ...eventSourceMappingOptions,
      }
    );
    const acceptCfnSourceMapping = acceptStateSourceMapping.node
      .defaultChild as CfnEventSourceMapping;
    acceptCfnSourceMapping.addPropertyOverride("FilterCriteria", {
      Filters: [
        {
          Pattern: JSON.stringify({
            dynamodb: {
              NewImage: {
                state: { S: [State.Friends] },
              },
              OldImage: {
                state: { S: [State.Pending] },
              },
            },
            eventName: ["MODIFY"],
          }),
        },
      ],
    });

    const rejectStateSourceMapping = new EventSourceMapping(
      this,
      "rejectStateHandlerSourceMapping",
      {
        target: rejectStateHandler,
        ...eventSourceMappingOptions,
      }
    );
    const rejectCfnSourceMapping = rejectStateSourceMapping.node
      .defaultChild as CfnEventSourceMapping;
    rejectCfnSourceMapping.addPropertyOverride("FilterCriteria", {
      Filters: [
        {
          Pattern: JSON.stringify({
            dynamodb: {
              OldImage: {
                state: { S: [State.Pending] },
              },
            },
            eventName: ["REMOVE"],
          }),
        },
      ],
    });

    const unfriendStateSourceMapping = new EventSourceMapping(
      this,
      "unfriendStateHandlerSourceMapping",
      {
        target: unfriendStateHandler,
        ...eventSourceMappingOptions,
      }
    );
    const unfriendCfnSourceMapping = unfriendStateSourceMapping.node
      .defaultChild as CfnEventSourceMapping;
    unfriendCfnSourceMapping.addPropertyOverride("FilterCriteria", {
      Filters: [
        {
          Pattern: JSON.stringify({
            dynamodb: {
              OldImage: {
                state: { S: [State.Friends] },
              },
            },
            eventName: ["REMOVE"],
          }),
        },
      ],
    });

    const readAPI = new LambdaRestApi(this, "readAPI", {
      handler: readHandler,
      proxy: false,
    });

    const friends = readAPI.root.addResource("friends");
    friends.addResource("{playerId}").addMethod("GET");
    friends
      .addResource("isFriend")
      .addResource("{playerId}")
      .addResource("{friendId}")
      .addMethod("GET");
  }
}
