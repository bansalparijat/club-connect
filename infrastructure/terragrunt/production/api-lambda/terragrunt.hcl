include "root" {
  path = find_in_parent_folders()
}

include "env" {
  path = "${get_terragrunt_dir()}/../../_env/production.hcl"
}

terraform {
  source = "../../../terraform/modules/api-lambda"
}

dependency "sqs" {
  config_path = "../sqs"

  mock_outputs = {
    queue_url = "https://sqs.ap-south-1.amazonaws.com/000000000000/mock-queue"
    queue_arn = "arn:aws:sqs:ap-south-1:000000000000:mock-queue"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

dependency "dynamodb" {
  config_path = "../dynamodb"

  mock_outputs = {
    table_name = "club-connect-production"
    table_arn  = "arn:aws:dynamodb:ap-south-1:000000000000:table/club-connect-production"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  sqs_queue_url       = dependency.sqs.outputs.queue_url
  sqs_queue_arn       = dependency.sqs.outputs.queue_arn
  dynamodb_table_name = dependency.dynamodb.outputs.table_name
  dynamodb_table_arn  = dependency.dynamodb.outputs.table_arn
}
