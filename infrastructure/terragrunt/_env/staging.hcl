inputs = {
  env       = "staging"
  image_tag = "latest"

  # Secrets Manager ARN for staging — replace with real ARN after first deploy
  secrets_arn = "arn:aws:secretsmanager:ap-south-1:ACCOUNT_ID:secret:club-connect/staging-XXXXXX"
}
