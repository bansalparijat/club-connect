import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const globalForDynamo = globalThis as unknown as { docClient: DynamoDBDocumentClient }

function createDocClient(): DynamoDBDocumentClient {
  const endpoint = process.env.DYNAMODB_ENDPOINT
  const region = process.env.AWS_REGION ?? 'ap-south-1'

  const rawClient = new DynamoDBClient({
    region,
    ...(endpoint ? { endpoint } : {}),
  })

  return DynamoDBDocumentClient.from(rawClient, {
    marshallOptions: { removeUndefinedValues: true },
  })
}

export const docClient =
  globalForDynamo.docClient || createDocClient()

if (process.env.NODE_ENV !== 'production') {
  globalForDynamo.docClient = docClient
}

export function getTableName(): string {
  return process.env.DYNAMODB_TABLE_NAME ?? 'club-connect-dev'
}
