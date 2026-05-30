variable "app_name" { type = string }
variable "env"      { type = string }

resource "aws_sqs_queue" "dlq" {
  name                      = "${var.app_name}-notifications-dlq-${var.env}"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Environment = var.env
    App         = var.app_name
  }
}

resource "aws_sqs_queue" "main" {
  name                       = "${var.app_name}-notifications-${var.env}"
  visibility_timeout_seconds = 180  # must be >= worker Lambda timeout (120s)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Environment = var.env
    App         = var.app_name
  }
}

output "queue_arn" { value = aws_sqs_queue.main.arn }
output "queue_url" { value = aws_sqs_queue.main.url }
output "dlq_arn"   { value = aws_sqs_queue.dlq.arn }
