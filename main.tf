locals {
  infra_name = "www.speedshop.co"
  region     = "us-east-1"
}

provider "aws" {
  region = local.region
}

provider "cloudflare" {}

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 1.0"
    }
  } 
  
  backend "s3" {
    bucket = "speedshop-terraform"
    key    = "#{local.infra_name}-prod.tfstate"
    region = "us-east-1"
  }
}

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
  region        = local.region
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