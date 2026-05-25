variable "app_name"      { type = string }
variable "env"           { type = string }
variable "image_tag"     { type = string }
variable "secrets_arn"   { type = string }
variable "sqs_queue_url" { type = string }
variable "sqs_queue_arn" { type = string }

# ─── ECR Repository ────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "api" {
  name                 = "${var.app_name}-api-${var.env}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Environment = var.env
    App         = var.app_name
  }
}

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

resource "aws_iam_role" "api_lambda" {
  name               = "${var.app_name}-api-lambda-${var.env}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Environment = var.env
    App         = var.app_name
  }
}

data "aws_iam_policy_document" "api_permissions" {
  statement {
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.secrets_arn]
  }
  statement {
    actions   = ["sqs:SendMessage"]
    resources = [var.sqs_queue_arn]
  }
}

resource "aws_iam_role_policy" "api_lambda" {
  name   = "api-lambda-policy"
  role   = aws_iam_role.api_lambda.id
  policy = data.aws_iam_policy_document.api_permissions.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.api_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ─── Lambda Function ───────────────────────────────────────────────────────────

resource "aws_lambda_function" "api" {
  function_name = "${var.app_name}-api-${var.env}"
  role          = aws_iam_role.api_lambda.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  timeout       = 30
  memory_size   = 512

  environment {
    variables = {
      AWS_SECRETS_ARN = var.secrets_arn
      SQS_QUEUE_URL   = var.sqs_queue_url
      NODE_ENV        = var.env
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

# ─── CloudWatch Log Group ──────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 14
}

# ─── Outputs ───────────────────────────────────────────────────────────────────

output "lambda_arn"          { value = aws_lambda_function.api.arn }
output "lambda_invoke_arn"   { value = aws_lambda_function.api.invoke_arn }
output "lambda_name"         { value = aws_lambda_function.api.function_name }
output "ecr_repository_url"  { value = aws_ecr_repository.api.repository_url }
