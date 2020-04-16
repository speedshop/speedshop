provider "aws" {
  region = "us-east-1"
}

terraform {
  backend "s3" {
    bucket = "speedshop-terraform"
    key    = "speedshop-dotcom-prod.tfstate"
    region = "us-east-1"
  }
}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    actions = ["s3:GetObject"]
    sid = "AllowPublicRead"
    resources = ["arn:aws:s3:::speedshop-dotcom/*"]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

resource "aws_s3_bucket" "website" {
  bucket = "speedshop-dotcom"
  region = "us-east-1"
  acl    = "public-read"
  policy = data.aws_iam_policy_document.bucket_policy.json

  website {
    index_document = "index.html"
    error_document = "error.html"
  }
}