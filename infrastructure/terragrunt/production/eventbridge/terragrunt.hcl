include "root" {
  path = find_in_parent_folders()
}

include "env" {
  path = "${get_terragrunt_dir()}/../../_env/production.hcl"
}

terraform {
  source = "../../../terraform/modules/eventbridge"
}

dependency "worker_lambda" {
  config_path = "../worker-lambda"

  mock_outputs = {
    lambda_arn = "arn:aws:lambda:ap-south-1:000000000000:function:club-connect-worker-production"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  worker_lambda_arn = dependency.worker_lambda.outputs.lambda_arn
}
