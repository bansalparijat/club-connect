# Club Connect — CI/CD & Deployment Plan

## Overview

This plan covers AWS account setup, GitHub Actions CI/CD pipelines, git hooks, database migration strategy, and security practices for deploying the API/backend to two environments: **dev** and **production**.

- **Dev**: Auto-deploys on every push/merge to `main`
- **Production**: Manual trigger only (workflow_dispatch)

---

## 1. AWS Account & Credentials Setup

### 1.1 AWS Account Structure

Use a single AWS account with environment isolation via resource naming (`-dev` / `-production` suffixes). All resources in `ap-south-1` (Mumbai).

> If budget allows later, consider AWS Organizations with separate dev/prod accounts for stronger blast-radius isolation.

### 1.2 IAM Setup (One-Time, Manual via Console/CLI)

#### A. GitHub Actions OIDC Provider (Recommended over long-lived keys)

GitHub Actions supports OpenID Connect (OIDC) to assume AWS IAM roles without storing `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as secrets. This is the **strongly recommended** approach.

```bash
# 1. Create the OIDC identity provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# 2. Create IAM role for GitHub Actions (dev)
aws iam create-role \
  --role-name club-connect-github-actions-dev \
  --assume-role-policy-document file://trust-policy-dev.json

# 3. Create IAM role for GitHub Actions (production)
aws iam create-role \
  --role-name club-connect-github-actions-production \
  --assume-role-policy-document file://trust-policy-production.json
```

**`trust-policy-dev.json`** — allows any push to `main` branch:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:bansalparijat/club-connect:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

**`trust-policy-production.json`** — restrict to manual workflow_dispatch on `main` (or tags):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:bansalparijat/club-connect:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

#### B. IAM Policies for GitHub Actions Roles

Both roles need the same permissions (scoped to their environment's resources):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECR",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "arn:aws:ecr:ap-south-1:ACCOUNT_ID:repository/club-connect-api-ENV"
    },
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "Lambda",
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:UpdateFunctionConfiguration"
      ],
      "Resource": [
        "arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:club-connect-api-ENV",
        "arn:aws:lambda:ap-south-1:ACCOUNT_ID:function:club-connect-worker-ENV"
      ]
    },
    {
      "Sid": "SecretsRead",
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": "arn:aws:secretsmanager:ap-south-1:ACCOUNT_ID:secret:club-connect/ENV-*"
    },
    {
      "Sid": "TerraformState",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::club-connect-tf-state",
        "arn:aws:s3:::club-connect-tf-state/*"
      ]
    },
    {
      "Sid": "TerraformLocks",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      "Resource": "arn:aws:dynamodb:ap-south-1:ACCOUNT_ID:table/club-connect-tf-locks"
    },
    {
      "Sid": "TerraformManageResources",
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "iam:GetRole", "iam:PassRole",
        "sqs:*",
        "apigateway:*",
        "execute-api:*",
        "scheduler:*",
        "logs:*",
        "ecr:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-south-1"
        }
      }
    }
  ]
}
```

> **Note**: The `TerraformManageResources` statement is broad because Terragrunt needs to create/modify many resource types. Tighten with resource ARN conditions once infrastructure stabilizes.

### 1.3 AWS Secrets Manager (Per Environment)

Create two secrets, one per environment:

```bash
# Dev
aws secretsmanager create-secret \
  --name club-connect/dev \
  --region ap-south-1 \
  --secret-string '{
    "JWT_SECRET": "...",
    "JWT_REFRESH_SECRET": "...",
    "DATABASE_URL": "postgresql://...@pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1",
    "DIRECT_URL": "postgresql://...@db.supabase.com:5432/postgres",
    "SUPABASE_SERVICE_KEY": "...",
    "TWILIO_ACCOUNT_SID": "...",
    "TWILIO_AUTH_TOKEN": "...",
    "TWILIO_VERIFY_SERVICE_SID": "...",
    "WHATSAPP_PROVIDER": "meta",
    "META_WHATSAPP_TOKEN": "...",
    "META_PHONE_NUMBER_ID": "...",
    "SENTRY_DSN": "..."
  }'

# Production (same structure, different values)
aws secretsmanager create-secret \
  --name club-connect/production \
  --region ap-south-1 \
  --secret-string '{...}'
```

### 1.4 Supabase Projects

Two separate Supabase projects:
- `club-connect-dev` — dev database
- `club-connect-prod` — production database

Each has its own pooler URL (for Lambda) and direct URL (for migrations).

### 1.5 GitHub Repository Secrets & Variables

Set these in GitHub repo Settings > Secrets and variables > Actions:

**Secrets:**
| Secret | Description |
|---|---|
| `AWS_ACCOUNT_ID` | AWS account number |
| `DEV_DATABASE_URL` | Supabase direct URL for dev (used by migration step) |
| `PROD_DATABASE_URL` | Supabase direct URL for production (used by migration step) |

**Variables:**
| Variable | Value |
|---|---|
| `AWS_REGION` | `ap-south-1` |
| `DEV_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/club-connect-github-actions-dev` |
| `PROD_ROLE_ARN` | `arn:aws:iam::ACCOUNT_ID:role/club-connect-github-actions-production` |

> Database URLs are secrets because they contain credentials. Role ARNs are variables (not sensitive).

---

## 2. Git Hooks (Local Developer Experience)

### 2.1 Install Husky

```bash
pnpm add -Dw husky
npx husky init
```

### 2.2 Pre-Commit Hook (`.husky/pre-commit`)

Fast checks only — must complete in < 5 seconds:

```bash
#!/bin/sh

# Lint staged files only (requires lint-staged)
npx lint-staged

# Prevent committing .env files with real secrets
if git diff --cached --name-only | grep -E '\.env\.local|\.env\.production'; then
  echo "ERROR: Do not commit .env.local or .env.production files"
  exit 1
fi
```

### 2.3 Lint-Staged Config (`package.json` addition)

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --no-warn-ignored"],
    "*.{ts,tsx,json,md}": ["prettier --write"]
  }
}
```

### 2.4 Pre-Push Hook (`.husky/pre-push`)

Slightly heavier checks before code leaves the machine:

```bash
#!/bin/sh

# Typecheck the entire project
pnpm turbo typecheck

# Ensure Prisma schema is valid
cd packages/db && npx prisma validate
```

### 2.5 Commit Message Convention (`.husky/commit-msg`)

Enforce conventional commits for clean changelogs:

```bash
#!/bin/sh

npx --no -- commitlint --edit "$1"
```

Install: `pnpm add -Dw @commitlint/cli @commitlint/config-conventional`

`commitlint.config.js`:
```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

Valid prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, `perf:`

---

## 3. CI/CD Pipeline (GitHub Actions)

### 3.1 Pipeline Architecture

```
Push to main ──┐
               v
         ┌──────────┐
         │   CI      │  lint, typecheck, test, prisma validate, docker build test
         └────┬─────┘
              │ (on success)
              v
         ┌──────────────┐
         │  Deploy Dev   │  docker build+push, prisma migrate, update lambdas,
         │  (automatic)  │  terragrunt apply, smoke test
         └──────────────┘

Manual trigger (workflow_dispatch) ──┐
                                    v
                              ┌──────────────────┐
                              │ Deploy Production  │  same steps, production env,
                              │ (manual, gated)    │  requires approval
                              └──────────────────┘
```

### 3.2 Workflow: CI (`ci.yml`)

Runs on every push to `main` and every PR.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 8.15.1

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Prisma generate
        run: pnpm run db:generate

      - name: Lint
        run: pnpm turbo lint

      - name: Typecheck
        run: pnpm turbo typecheck

      - name: Test
        run: pnpm turbo test

      - name: Prisma validate
        run: cd packages/db && npx prisma validate

      - name: Docker build (smoke test)
        run: docker build -f apps/api/Dockerfile -t club-connect-api:ci .
```

### 3.3 Workflow: Deploy Dev (`deploy-dev.yml`)

Auto-triggers on push to `main` after CI passes.

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy Dev

on:
  push:
    branches: [main]

concurrency:
  group: deploy-dev
  cancel-in-progress: false  # never cancel an in-progress deploy

permissions:
  id-token: write   # required for OIDC
  contents: read

env:
  AWS_REGION: ap-south-1
  ENV: dev
  ECR_REPO: club-connect-api-dev

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: dev

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 8.15.1

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # --- AWS Auth via OIDC ---
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.DEV_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      # --- Docker Build & Push to ECR ---
      - name: Login to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -f apps/api/Dockerfile \
            -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPO:latest \
            .
          docker push $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPO:latest

      # --- Database Migration ---
      - name: Run Prisma migrations
        env:
          DATABASE_URL: ${{ secrets.DEV_DATABASE_URL }}
          DIRECT_URL: ${{ secrets.DEV_DATABASE_URL }}
        run: |
          cd packages/db
          npx prisma migrate deploy

      # --- Update Lambda Functions ---
      - name: Update API Lambda
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          aws lambda update-function-code \
            --function-name club-connect-api-dev \
            --image-uri $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
            --no-cli-pager
          aws lambda wait function-updated \
            --function-name club-connect-api-dev

      - name: Update Worker Lambda
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          aws lambda update-function-code \
            --function-name club-connect-worker-dev \
            --image-uri $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
            --no-cli-pager
          aws lambda wait function-updated \
            --function-name club-connect-worker-dev

      # --- Smoke Test ---
      - name: Smoke test
        run: |
          API_URL=$(aws apigatewayv2 get-apis --query "Items[?Name=='club-connect-dev'].ApiEndpoint" --output text)
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" --max-time 30)
          if [ "$STATUS" != "200" ]; then
            echo "Smoke test failed: HTTP $STATUS"
            exit 1
          fi
          echo "Smoke test passed: HTTP $STATUS"
```

### 3.4 Workflow: Deploy Production (`deploy-production.yml`)

Manual trigger only. Requires environment protection rules (approval).

```yaml
# .github/workflows/deploy-production.yml
name: Deploy Production

on:
  workflow_dispatch:
    inputs:
      commit_sha:
        description: 'Git SHA to deploy (default: HEAD of main)'
        required: false
        default: ''
      skip_migrations:
        description: 'Skip database migrations'
        required: false
        type: boolean
        default: false

concurrency:
  group: deploy-production
  cancel-in-progress: false

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: ap-south-1
  ENV: production
  ECR_REPO: club-connect-api-production

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: production  # requires approval via GitHub environment protection rules

    steps:
      - name: Determine ref
        id: ref
        run: |
          if [ -n "${{ inputs.commit_sha }}" ]; then
            echo "sha=${{ inputs.commit_sha }}" >> $GITHUB_OUTPUT
          else
            echo "sha=${{ github.sha }}" >> $GITHUB_OUTPUT
          fi

      - uses: actions/checkout@v4
        with:
          ref: ${{ steps.ref.outputs.sha }}

      - uses: pnpm/action-setup@v4
        with:
          version: 8.15.1

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # --- AWS Auth via OIDC ---
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.PROD_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      # --- Docker Build & Push to ECR ---
      - name: Login to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ steps.ref.outputs.sha }}
        run: |
          docker build -f apps/api/Dockerfile \
            -t $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
            -t $ECR_REGISTRY/$ECR_REPO:stable \
            .
          docker push $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG
          docker push $ECR_REGISTRY/$ECR_REPO:stable

      # --- Database Migration ---
      - name: Run Prisma migrations
        if: ${{ !inputs.skip_migrations }}
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}
          DIRECT_URL: ${{ secrets.PROD_DATABASE_URL }}
        run: |
          cd packages/db
          npx prisma migrate deploy

      # --- Update Lambda Functions ---
      - name: Update API Lambda
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ steps.ref.outputs.sha }}
        run: |
          aws lambda update-function-code \
            --function-name club-connect-api-production \
            --image-uri $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
            --no-cli-pager
          aws lambda wait function-updated \
            --function-name club-connect-api-production

      - name: Update Worker Lambda
        env:
          ECR_REGISTRY: ${{ steps.ecr-login.outputs.registry }}
          IMAGE_TAG: ${{ steps.ref.outputs.sha }}
        run: |
          aws lambda update-function-code \
            --function-name club-connect-worker-production \
            --image-uri $ECR_REGISTRY/$ECR_REPO:$IMAGE_TAG \
            --no-cli-pager
          aws lambda wait function-updated \
            --function-name club-connect-worker-production

      # --- Smoke Test ---
      - name: Smoke test
        run: |
          API_URL=$(aws apigatewayv2 get-apis --query "Items[?Name=='club-connect-production'].ApiEndpoint" --output text)
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" --max-time 30)
          if [ "$STATUS" != "200" ]; then
            echo "Smoke test failed: HTTP $STATUS"
            exit 1
          fi
          echo "Smoke test passed: HTTP $STATUS"
```

### 3.5 Workflow: Terraform Plan/Apply (`infra.yml`)

Separate workflow for infrastructure changes. Only triggers when `infrastructure/` files change.

```yaml
# .github/workflows/infra.yml
name: Infrastructure

on:
  pull_request:
    paths: ['infrastructure/**']
  push:
    branches: [main]
    paths: ['infrastructure/**']

permissions:
  id-token: write
  contents: read
  pull-requests: write  # to post plan output as PR comment

env:
  AWS_REGION: ap-south-1
  TERRAGRUNT_VERSION: 0.55.0
  TERRAFORM_VERSION: 1.7.0

jobs:
  plan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.DEV_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TERRAFORM_VERSION }}

      - name: Install Terragrunt
        run: |
          curl -sL "https://github.com/gruntwork-io/terragrunt/releases/download/v$TERRAGRUNT_VERSION/terragrunt_linux_amd64" \
            -o /usr/local/bin/terragrunt && chmod +x /usr/local/bin/terragrunt

      - name: Terragrunt plan (dev)
        working-directory: infrastructure/terragrunt/staging
        run: terragrunt run-all plan --terragrunt-non-interactive 2>&1 | tee plan-output.txt

      - name: Post plan to PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('infrastructure/terragrunt/staging/plan-output.txt', 'utf8');
            const body = `### Terraform Plan (dev)\n\`\`\`\n${plan.slice(-3000)}\n\`\`\``;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body
            });

  apply-dev:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: dev
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.DEV_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TERRAFORM_VERSION }}

      - name: Install Terragrunt
        run: |
          curl -sL "https://github.com/gruntwork-io/terragrunt/releases/download/v$TERRAGRUNT_VERSION/terragrunt_linux_amd64" \
            -o /usr/local/bin/terragrunt && chmod +x /usr/local/bin/terragrunt

      - name: Terragrunt apply (dev)
        working-directory: infrastructure/terragrunt/staging
        run: terragrunt run-all apply --terragrunt-non-interactive
```

---

## 4. Database Migration Strategy

### 4.1 Migration Approach

Prisma Migrate is used for all schema changes. Two commands exist:

| Command | When | Description |
|---|---|---|
| `prisma migrate dev` | Local development | Creates new migration files, applies them, regenerates client |
| `prisma migrate deploy` | CI/CD pipeline | Applies pending migrations only, no new files, no prompts |

### 4.2 Migration Flow

```
Developer locally:
  1. Edit schema.prisma
  2. Run: cd packages/db && dotenv -e ../../apps/api/.env.local -- npx prisma migrate dev --name describe_change
  3. Commit the new migration file in packages/db/prisma/migrations/
  4. Push to main

CI/CD pipeline:
  1. Checkout code (includes new migration files)
  2. Run: npx prisma migrate deploy (uses DIRECT_URL, not pooler)
  3. If migration fails → pipeline fails, Lambda not updated (safe)
  4. If migration succeeds → proceed to Lambda update
```

### 4.3 Critical Rules

1. **Migration runs BEFORE Lambda update** — the new code expects the new schema, so the DB must be ready first
2. **Use `prisma migrate deploy`** in CI, never `prisma migrate dev` — `deploy` is non-interactive and safe for automation
3. **Use the direct Supabase URL** for migrations (port 5432), not the pooler URL (port 6543) — PgBouncer doesn't support DDL transactions
4. **Never skip migrations without understanding the risk** — the production deploy has a `skip_migrations` escape hatch, but use it only when the deploy contains zero schema changes
5. **Backward-compatible migrations** — when possible, make migrations additive (add column, add table) rather than destructive (drop column). For breaking changes, use a two-phase deploy:
   - Phase 1: Add new column (nullable), deploy code that writes to both old and new
   - Phase 2: Backfill data, drop old column, deploy code that uses only new

### 4.4 Rollback Strategy

Prisma doesn't natively support down-migrations. If a migration breaks production:

1. **Immediate**: Roll back the Lambda to the previous image (deploy the prior git SHA)
2. **Fix forward**: Create a new migration that reverses the damage, push, deploy
3. **Nuclear option**: `prisma migrate resolve --rolled-back <migration_name>` then manual SQL

---

## 5. Security Practices

### 5.1 Secrets Management

| Layer | Approach |
|---|---|
| AWS credentials | OIDC — no long-lived keys stored anywhere |
| App secrets (JWT, DB, Twilio) | AWS Secrets Manager, fetched on Lambda cold start |
| DB URLs for migrations | GitHub Actions secrets (encrypted at rest, masked in logs) |
| Local dev | `apps/api/.env.local` (gitignored) |

### 5.2 .gitignore Verification

Ensure these patterns are in `.gitignore`:
```
.env
.env.local
.env.*.local
*.pem
*.key
```

### 5.3 Secret Scanning

- **GitHub**: Enable "Secret scanning" and "Push protection" in repo Settings > Code security
- **Local**: Existing pre-push hook (`~/.security-hooks/dispatcher.sh`) scans for secrets
- **CI**: Add `trufflehog` or `gitleaks` scan step (optional, GitHub's built-in may suffice)

### 5.4 Dependency Security

Add to CI workflow:
```yaml
- name: Audit dependencies
  run: pnpm audit --audit-level=high
  continue-on-error: true  # advisory, don't block deploys for non-critical
```

### 5.5 ECR Image Scanning

Already enabled in Terraform (`image_scanning_configuration { scan_on_push = true }`). Add a post-push check:
```yaml
- name: Check ECR scan results
  run: |
    aws ecr describe-image-scan-findings \
      --repository-name $ECR_REPO \
      --image-id imageTag=$IMAGE_TAG \
      --query 'imageScanFindings.findingSeverityCounts' \
      --no-cli-pager || true
```

### 5.6 Least Privilege

- GitHub Actions roles are scoped to specific resources (ECR repo, Lambda functions, secrets)
- Lambda execution roles only have permissions they need (CloudWatch, SQS, Secrets Manager)
- Separate IAM roles for dev vs production — a dev deploy cannot touch production resources

### 5.7 Branch Protection

Configure on `main` branch:
- Require PR reviews (at least 1 approval) before merging
- Require CI status checks to pass
- No force pushes
- No deletions

---

## 6. Environment Configuration

### 6.1 Rename: Staging -> Dev

The existing Terragrunt config uses "staging". Rename to "dev" for clarity:

```
infrastructure/terragrunt/staging/  →  infrastructure/terragrunt/dev/
infrastructure/terragrunt/_env/staging.hcl  →  infrastructure/terragrunt/_env/dev.hcl
```

Update `_env/dev.hcl`:
```hcl
inputs = {
  env         = "dev"
  image_tag   = "latest"
  secrets_arn = "arn:aws:secretsmanager:ap-south-1:ACCOUNT_ID:secret:club-connect/dev-XXXXXX"
}
```

### 6.2 GitHub Environments

Create two environments in GitHub repo Settings > Environments:

**`dev`**:
- No approval required
- Secrets: `DEV_DATABASE_URL`
- Can deploy from `main` branch

**`production`**:
- Required reviewers: 1+ (you or trusted collaborators)
- Wait timer: 0 (approval is enough)
- Secrets: `PROD_DATABASE_URL`
- Can deploy from `main` branch only

### 6.3 Mobile App Configuration

The mobile app needs to know which API URL to hit per environment:

| Environment | API URL | Set via |
|---|---|---|
| Local dev | `http://localhost:3000` | `app.json` > `extra.apiUrl` |
| Dev | `https://<dev-api-gw>.execute-api.ap-south-1.amazonaws.com` | EAS Update channel `dev` |
| Production | `https://<prod-api-gw>.execute-api.ap-south-1.amazonaws.com` | EAS Update channel `production` |

---

## 7. Health Check Endpoint

The smoke test requires a health endpoint. Add to the API:

```
GET /api/health
Response: { status: "ok", version: "<git-sha>", environment: "<env>" }
```

This must:
- Return 200 when the app is running
- Optionally check DB connectivity (Prisma `$queryRaw`SELECT 1``)
- Be unauthenticated (no JWT required)
- Include the git SHA (injected via Docker build arg or env var) for deploy verification

---

## 8. Pre-Deployment Checklist (One-Time Setup)

Run these steps once before the first pipeline execution:

### 8.1 AWS Resources (Manual)

- [ ] Create AWS OIDC provider for GitHub Actions
- [ ] Create IAM roles (`club-connect-github-actions-dev`, `club-connect-github-actions-production`)
- [ ] Attach IAM policies to both roles
- [ ] Create S3 bucket for Terraform state (`club-connect-tf-state`)
- [ ] Create DynamoDB table for Terraform locks (`club-connect-tf-locks`)
- [ ] Create Secrets Manager secrets (`club-connect/dev`, `club-connect/production`)
- [ ] Run `terragrunt run-all apply` for dev from local machine (bootstraps ECR, Lambda, SQS, API GW, EventBridge)
- [ ] Run `terragrunt run-all apply` for production from local machine

### 8.2 Supabase

- [ ] Create `club-connect-dev` Supabase project
- [ ] Create `club-connect-prod` Supabase project
- [ ] Note down pooler URLs and direct URLs for both
- [ ] Run initial `prisma migrate deploy` against both databases

### 8.3 GitHub

- [ ] Add secrets: `AWS_ACCOUNT_ID`, `DEV_DATABASE_URL`, `PROD_DATABASE_URL`
- [ ] Add variables: `AWS_REGION`, `DEV_ROLE_ARN`, `PROD_ROLE_ARN`
- [ ] Create environments: `dev`, `production` (with protection rules)
- [ ] Enable branch protection on `main`
- [ ] Enable secret scanning and push protection

### 8.4 Codebase

- [ ] Add `output: 'standalone'` to `next.config.mjs` (required for Dockerfile)
- [ ] Add `/api/health` endpoint
- [ ] Add `.github/workflows/ci.yml`
- [ ] Add `.github/workflows/deploy-dev.yml`
- [ ] Add `.github/workflows/deploy-production.yml`
- [ ] Add `.github/workflows/infra.yml`
- [ ] Install Husky and configure git hooks
- [ ] Install lint-staged, commitlint

---

## 9. Monitoring & Alerts (Post-Deploy)

Once pipelines are running:

- **CloudWatch Alarms**: Lambda errors > 5/min, API 5xx > 1%, SQS DLQ messages > 0
- **GitHub Actions notifications**: Slack/email on deploy failure
- **Sentry**: Already in secrets config — wire up `SENTRY_DSN` in Lambda env vars
- **Cost alerts**: AWS Budgets alarm at $10/month (free tier + low traffic expected initially)

---

## 10. Deployment Sequence Diagram

```
Developer pushes to main
        │
        v
  ┌─ CI (ci.yml) ─────────────────────────────┐
  │  pnpm install → lint → typecheck → test    │
  │  prisma validate → docker build (dry run)  │
  └────────────────────────┬───────────────────┘
                           │ pass
                           v
  ┌─ Deploy Dev (deploy-dev.yml) ──────────────┐
  │  1. OIDC → assume dev role                 │
  │  2. Docker build → push to ECR (:sha, :latest) │
  │  3. prisma migrate deploy (dev DB)         │
  │  4. aws lambda update-function-code (api)  │
  │  5. aws lambda update-function-code (worker)│
  │  6. Smoke test: GET /api/health → 200      │
  └────────────────────────────────────────────┘

        ... later, when ready ...

  Admin clicks "Run workflow" on deploy-production.yml
        │
        v
  ┌─ Deploy Production ───────────────────────────┐
  │  (requires GitHub environment approval)        │
  │  Same steps as dev, targeting production       │
  │  resources, production DB, production ECR      │
  └────────────────────────────────────────────────┘
```
