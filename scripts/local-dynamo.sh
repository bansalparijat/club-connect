#!/bin/bash
# Start DynamoDB Local and create the table

set -e

TABLE_NAME="${DYNAMODB_TABLE_NAME:-club-connect-dev}"
ENDPOINT="http://localhost:8000"

echo "==> Starting DynamoDB Local..."
docker run -d --name dynamodb-local \
  -p 8000:8000 \
  amazon/dynamodb-local:latest \
  -jar DynamoDBLocal.jar -sharedDb 2>/dev/null || echo "Container already running"

sleep 1

echo "==> Creating table: $TABLE_NAME"
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
    AttributeName=GSI1PK,AttributeType=S \
    AttributeName=GSI1SK,AttributeType=S \
    AttributeName=GSI2PK,AttributeType=S \
    AttributeName=GSI2SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "GSI1",
        "KeySchema": [{"AttributeName":"GSI1PK","KeyType":"HASH"},{"AttributeName":"GSI1SK","KeyType":"RANGE"}],
        "Projection": {"ProjectionType":"ALL"}
      },
      {
        "IndexName": "GSI2",
        "KeySchema": [{"AttributeName":"GSI2PK","KeyType":"HASH"},{"AttributeName":"GSI2SK","KeyType":"RANGE"}],
        "Projection": {"ProjectionType":"ALL"}
      }
    ]' \
  --billing-mode PAY_PER_REQUEST \
  --no-cli-pager 2>/dev/null && echo "Table created" || echo "Table already exists"

echo "==> DynamoDB Local ready at $ENDPOINT"
echo "==> Table: $TABLE_NAME"
echo ""
echo "Next steps:"
echo "  1. Run: pnpm db:seed"
echo "  2. Run: pnpm --filter @club-connect/api dev"
