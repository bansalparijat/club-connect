inputs = {
  env       = "production"
  image_tag = "stable"

  # Secrets Manager ARN for production — replace with real ARN after first deploy
  secrets_arn = "arn:aws:secretsmanager:ap-south-1:ACCOUNT_ID:secret:club-connect/production-XXXXXX"
}
