terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.27.0"
    }
  }

  backend "s3" {
    bucket = "speedshop-terraform"
    key    = "#{local.infra_name}-prod.tfstate"
    region = "us-east-1"
  }
}

locals {
  infra_name = "www.speedshop.co"
  region     = "us-east-1"
}

provider "aws" {
  region = local.region
}

provider "cloudflare" {}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    actions   = ["s3:GetObject"]
    sid       = "AllowPublicRead"
    resources = ["arn:aws:s3:::${local.infra_name}/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket" "website" {
  bucket        = local.infra_name
  policy        = data.aws_iam_policy_document.bucket_policy.json
  force_destroy = true

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }

  website {
    index_document = "index.html"
    error_document = "error.html"
  }
}

resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "cloudflare_zone" "cdn" {
  zone       = "speedshop.co"
  account_id = var.cloudflare_account_id
}

resource "cloudflare_ruleset" "blog_legacy_redirects" {
  kind    = "zone"
  name    = "default"
  phase   = "http_request_dynamic_redirect"
  zone_id = cloudflare_zone.cdn.id

  rules {
    action      = "redirect"
    description = "Tune page to retainer"
    enabled     = true
    expression  = <<-EOT
      (http.request.uri.path eq "/tune.html")
    EOT

    action_parameters {
      from_value {
        preserve_query_string = true
        status_code           = 301
        target_url {
          value = "https://www.speedshop.co/retainer.html"
        }
      }
    }
  }

  rules {
    action      = "redirect"
    description = "Legacy blog URLs to /blog/:slug/"
    enabled     = true
    expression  = <<-EOT
      (http.request.full_uri wildcard r"https://www.speedshop.co/20*/*/*/*.html")
    EOT

    action_parameters {
      from_value {
        preserve_query_string = true
        status_code           = 301
        target_url {
          expression = <<-EOT
            wildcard_replace(
              http.request.full_uri,
              r"https://www.speedshop.co/*/*/*/*.html",
              r"https://www.speedshop.co/blog/$${4}/"
            )
          EOT
        }
      }
    }
  }
}

# Business card Cloudflare Worker
# If these resources already exist in Cloudflare, import them first:
# terraform import cloudflare_worker_script.card_worker {account_id}/card-worker
# terraform import cloudflare_worker_route.card_route {zone_id}/{route_id}

resource "cloudflare_worker_script" "card_worker" {
  account_id = var.cloudflare_account_id
  name       = "card-worker"
  content    = file("${path.module}/worker.js")
  module     = true
}

resource "cloudflare_worker_route" "card_route" {
  zone_id     = cloudflare_zone.cdn.id
  pattern     = "www.speedshop.co/card*"
  script_name = cloudflare_worker_script.card_worker.name
}

# Agent-ready content negotiation worker
# Implements Mintlify's agent-ready documentation pattern:
# - Serves markdown when Accept: text/markdown header is present
# - Adds Link header advertising llms.txt on all responses
# - Adds X-Robots-Tag: noindex, nofollow on markdown responses

resource "cloudflare_worker_script" "agent_worker" {
  account_id = var.cloudflare_account_id
  name       = "agent-worker"
  content    = file("${path.module}/agent-worker.js")
  module     = true
}

resource "cloudflare_worker_route" "agent_route" {
  zone_id     = cloudflare_zone.cdn.id
  pattern     = "www.speedshop.co/*"
  script_name = cloudflare_worker_script.agent_worker.name
}
