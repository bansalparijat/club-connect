#!/bin/bash
# One-time bootstrap: creates the S3 bucket and DynamoDB table for Terraform state.
# Run this ONCE from your laptop before any Terragrunt/GitHub Actions infra runs.
#
# Prerequisites:
#   - AWS CLI configured with admin credentials
#   - Region: ap-south-1
#
# Usage: AWS_PROFILE=clubconnect bash scripts/bootstrap-aws.sh

set -e

export AWS_PROFILE="${AWS_PROFILE:-clubconnect}"
REGION="ap-south-1"
STATE_BUCKET="club-connect-tf-state"
LOCK_TABLE="club-connect-tf-locks"

echo "Using AWS profile: $AWS_PROFILE"

echo "==> Creating S3 bucket for Terraform state..."
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" \
  --no-cli-pager 2>/dev/null && echo "Bucket created" || echo "Bucket already exists"

echo "==> Enabling versioning on state bucket..."
aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled \
  --no-cli-pager

echo "==> Enabling encryption on state bucket..."
aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
  }' \
  --no-cli-pager

echo "==> Blocking public access on state bucket..."
aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  --no-cli-pager

echo "==> Creating DynamoDB table for Terraform locks..."
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" \
  --no-cli-pager 2>/dev/null && echo "Lock table created" || echo "Lock table already exists"

echo ""
echo "==> Bootstrap complete!"
echo "    State bucket:  s3://$STATE_BUCKET"
echo "    Lock table:    $LOCK_TABLE"
echo ""
echo "Next steps:"
echo "  1. Create OIDC provider in AWS IAM for GitHub Actions"
echo "  2. Create IAM roles (club-connect-github-actions-dev, club-connect-github-actions-production)"
echo "  3. Add DEV_ROLE_ARN and PROD_ROLE_ARN as GitHub environment variables"
echo "  4. Run 'Infrastructure' workflow from GitHub Actions to provision all resources"
