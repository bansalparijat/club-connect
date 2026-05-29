variable "app_name"          { type = string }
variable "env"               { type = string }
variable "image_tag"         { type = string }
variable "ecr_repository_url" { type = string }
variable "sqs_queue_arn"     { type = string }
variable "secrets_arn"       { type = string }
variable "sqs_queue_url"     { type = string }
variable "dynamodb_table_name" { type = string }
variable "dynamodb_table_arn"  { type = string }

# ─── IAM Role ──────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "worker_lambda" {
  name               = "${var.app_name}-worker-lambda-${var.env}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Environment = var.env
    App         = var.app_name
  }
}

data "aws_iam_policy_document" "worker_permissions" {
  statement {
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    actions   = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:SendMessage",
    ]
    resources = [var.sqs_queue_arn]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.secrets_arn]
  }
  statement {
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem"
    ]
    resources = [
      var.dynamodb_table_arn,
      "${var.dynamodb_table_arn}/index/*"
    ]
  }
}

resource "aws_iam_role_policy" "worker_lambda" {
  name   = "worker-lambda-policy"
  role   = aws_iam_role.worker_lambda.id
  policy = data.aws_iam_policy_document.worker_permissions.json
}

resource "aws_iam_role_policy_attachment" "worker_basic" {
  role       = aws_iam_role.worker_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ─── Lambda Function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "worker" {
  function_name = "${var.app_name}-worker-${var.env}"
  role          = aws_iam_role.worker_lambda.arn
  package_type  = "Image"
  image_uri     = "${var.ecr_repository_url}:${var.image_tag}"
  timeout       = 120
  memory_size   = 256

  image_config {
    command = ["apps/api/dist/worker/handler.handler"]
  }

  environment {
    variables = {
      AWS_SECRETS_ARN      = var.secrets_arn
      SQS_QUEUE_URL        = var.sqs_queue_url
      DYNAMODB_TABLE_NAME  = var.dynamodb_table_name
      NODE_ENV             = var.env
    }
  }

  tags = {
    Environment = var.env
    App         = var.app_name
  }

  lifecycle {
    ignore_changes = [image_uri]
  }
}

# ─── SQS Event Source Mapping ──────────────────────────────────────────────────

resource "aws_lambda_event_source_mapping" "sqs" {
  event_source_arn = var.sqs_queue_arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 10

  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 5
  }
}

# ─── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${aws_lambda_function.worker.function_name}"
  retention_in_days = 14
}

# ─── Outputs ───────────────────────────────────────────────────────────────────

output "lambda_arn"  { value = aws_lambda_function.worker.arn }
output "lambda_name" { value = aws_lambda_function.worker.function_name }
