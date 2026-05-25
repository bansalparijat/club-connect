# ─── Root terragrunt.hcl ──────────────────────────────────────────────────────
# Shared remote state backend + common inputs

remote_state {
  backend = "s3"

  config = {
    bucket         = "club-connect-tf-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "ap-south-1"
    encrypt        = true
    dynamodb_table = "club-connect-tf-locks"
  }

  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
EOF
}

inputs = {
  app_name   = "club-connect"
  aws_region = "ap-south-1"
}
