inputs = {
  env       = "production"
  image_tag = "stable"

  # Secrets Manager ARN for production — replace with real ARN after first deploy
  secrets_arn = "arn:aws:secretsmanager:ap-south-1:977574653892:secret:club-connect/production"
}
