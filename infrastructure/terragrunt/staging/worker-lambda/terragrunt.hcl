include "root" {
  path = find_in_parent_folders()
}

include "env" {
  path = "${get_terragrunt_dir()}/../../_env/staging.hcl"
}

terraform {
  source = "../../../terraform/modules/worker-lambda"
}

dependency "sqs" {
  config_path = "../sqs"

  mock_outputs = {
    queue_url = "https://sqs.ap-south-1.amazonaws.com/000000000000/mock-queue"
    queue_arn = "arn:aws:sqs:ap-south-1:000000000000:mock-queue"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "api_lambda" {
  config_path = "../api-lambda"

  mock_outputs = {
    ecr_repository_url = "000000000000.dkr.ecr.ap-south-1.amazonaws.com/mock"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  sqs_queue_url      = dependency.sqs.outputs.queue_url
  sqs_queue_arn      = dependency.sqs.outputs.queue_arn
  ecr_repository_url = dependency.api_lambda.outputs.ecr_repository_url
}
