locals {
  infra_name = "speedshop-dotcom"
}

terraform {
  backend "s3" {
    bucket = "speedshop-terraform"
    key    = "#{local.infra_name}-prod.tfstate"
    region = "us-east-1"
  }
}

provider "netlify" {}

# Create a new deploy key for this specific website
resource "netlify_deploy_key" "key" {}

# Define your site
resource "netlify_site" "main" {
  name = local.infra_name

  repo {
    repo_branch   = "master"
    command       = "jekyll build"
    deploy_key_id = netlify_deploy_key.key.id
    dir           = "_site"
    provider      = "github"
    repo_path     = "speedshop/speedshop"
  }

  custom_domain = "www.speedshop.co"
}

output "netlify_deploy_pubkey" {
  value = netlify_deploy_key.key.public_key
}
