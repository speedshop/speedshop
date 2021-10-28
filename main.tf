terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 3.0"
    }
    cloudflare = {
      source = "cloudflare/cloudflare"
      version = "~> 3.0"
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

# Someday I will do a complete cloudflare import
resource "cloudflare_zone" "cdn" {
  zone = "speedshop.co"
}