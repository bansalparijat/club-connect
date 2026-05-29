include "root" {
  path = find_in_parent_folders()
}

include "env" {
  path = "${get_terragrunt_dir()}/../../_env/staging.hcl"
}

terraform {
  source = "${get_terragrunt_dir()}/../../../terraform/modules/dynamodb"
}
