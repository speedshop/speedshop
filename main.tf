locals {
  infra_name    = "speedshop-dotcom"
  s3_origin_id  = "#{infra_name}-cloudfront"
  region        = "us-east-1"
}

provider "aws" {
  region = local.region
}

terraform {
  backend "s3" {
    bucket = "speedshop-terraform"
    key    = "#{local.infra_name}-prod.tfstate"
    region = "us-east-1"
  }
}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    actions = ["s3:GetObject"]
    sid = "AllowPublicRead"
    resources = ["arn:aws:s3:::${local.infra_name}/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket" "website" {
  bucket = local.infra_name
  region = local.region
  acl    = "public-read"
  policy = data.aws_iam_policy_document.bucket_policy.json
  force_destroy = true

  website {
    index_document = "index.html"
    error_document = "error.html"
  }
}

resource "aws_cloudfront_distribution" "s3_distribution" {
  origin {
    domain_name = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id   = local.s3_origin_id
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = local.s3_origin_id

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "allow-all"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
