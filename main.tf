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
  acl           = "public-read"
  policy        = data.aws_iam_policy_document.bucket_policy.json
  force_destroy = true

  website {
    index_document = "index.html"
    error_document = "error.html"
  }
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
