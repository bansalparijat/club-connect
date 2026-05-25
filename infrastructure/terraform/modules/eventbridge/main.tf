variable "app_name"         { type = string }
variable "env"              { type = string }
variable "worker_lambda_arn" { type = string }

# ─── IAM Role for EventBridge Scheduler ───────────────────────────────────────

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${var.app_name}-scheduler-${var.env}"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json

  tags = {
    Environment = var.env
    App         = var.app_name
  }
}

resource "aws_iam_role_policy" "scheduler_invoke" {
  name = "scheduler-invoke-lambda"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = var.worker_lambda_arn
    }]
  })
}

# ─── Fee Reminder — daily 09:00 IST (03:30 UTC) ───────────────────────────────

resource "aws_scheduler_schedule" "fee_reminder" {
  name                         = "${var.app_name}-fee-reminder-${var.env}"
  schedule_expression          = "cron(30 3 * * ? *)"
  schedule_expression_timezone = "Asia/Kolkata"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.worker_lambda_arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "fee_reminder" })
  }
}

# ─── Match Reminder — daily 08:00 IST (02:30 UTC) ────────────────────────────

resource "aws_scheduler_schedule" "match_reminder" {
  name                         = "${var.app_name}-match-reminder-${var.env}"
  schedule_expression          = "cron(30 2 * * ? *)"
  schedule_expression_timezone = "Asia/Kolkata"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = var.worker_lambda_arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "match_reminder" })
  }
}
