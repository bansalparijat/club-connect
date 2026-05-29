import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { beforeAll, afterAll } from 'vitest'

const TABLE_NAME = 'club-connect-test'
const ENDPOINT = 'http://localhost:8000'

// MUST set env vars before any db module imports
process.env.DYNAMODB_TABLE_NAME = TABLE_NAME
process.env.DYNAMODB_ENDPOINT = ENDPOINT
process.env.AWS_REGION = 'ap-south-1'
process.env.AWS_ACCESS_KEY_ID = 'test'
process.env.AWS_SECRET_ACCESS_KEY = 'test'

const rawClient = new DynamoDBClient({ region: 'ap-south-1', endpoint: ENDPOINT })

beforeAll(async () => {
  // Recreate table fresh for each test file
  try {
    await rawClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }))
  } catch {
    // doesn't exist
  }

  await rawClient.send(new CreateTableCommand({
    TableName: TABLE_NAME,
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'GSI2PK', AttributeType: 'S' },
      { AttributeName: 'GSI2SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'GSI2',
        KeySchema: [
          { AttributeName: 'GSI2PK', KeyType: 'HASH' },
          { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  }))
})

afterAll(async () => {
  try {
    await rawClient.send(new DeleteTableCommand({ TableName: TABLE_NAME }))
  } catch {
    // ignore
  }
  rawClient.destroy()
})
