include "root" {
  path = find_in_parent_folders()
}

include "env" {
  path = "${get_terragrunt_dir()}/../../_env/staging.hcl"
}

terraform {
  source = "../../../terraform/modules/api-gateway"
}

dependency "api_lambda" {
  config_path = "../api-lambda"

  mock_outputs = {
    lambda_invoke_arn = "arn:aws:apigateway:ap-south-1:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-south-1:000000000000:function:mock/invocations"
    lambda_name       = "club-connect-api-staging"
  }
  mock_outputs_allowed_terraform_commands = ["validate", "plan"]
}

inputs = {
  lambda_invoke_arn    = dependency.api_lambda.outputs.lambda_invoke_arn
  lambda_function_name = dependency.api_lambda.outputs.lambda_name
}
