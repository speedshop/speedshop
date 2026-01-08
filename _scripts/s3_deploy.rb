#!/usr/bin/env ruby
# frozen_string_literal: true

# Deploys _site/ to S3 with correct Content-Type headers based on .s3-headers.yml

require 'yaml'
require 'shellwords'

SITE_DIR = '_site'
CONFIG_FILE = '.s3-headers.yml'

def main
  bucket = ENV.fetch('S3_BUCKET') { abort 'S3_BUCKET environment variable required' }
  config = YAML.safe_load_file(CONFIG_FILE)
  content_types = config.fetch('content_types', [])

  puts "Deploying #{SITE_DIR}/ to s3://#{bucket}"

  # Build exclusion patterns for the main sync
  exclude_args = content_types.map { |ct| "--exclude #{ct['pattern'].shellescape}" }.join(' ')

  cache_control = 'max-age=86400'

  # Sync everything except files needing special Content-Type, with --delete
  puts "\n=> Syncing standard files..."
  run "aws s3 sync #{SITE_DIR} s3://#{bucket} --acl public-read --delete " \
      "--cache-control #{cache_control} #{exclude_args}"

  # Sync each special pattern with its Content-Type
  content_types.each do |ct|
    pattern = ct['pattern']
    content_type = ct['content_type']

    puts "\n=> Syncing #{pattern} with Content-Type: #{content_type}"
    run "aws s3 sync #{SITE_DIR} s3://#{bucket} --acl public-read " \
        "--exclude \"*\" --include #{pattern.shellescape} " \
        "--content-type #{content_type.shellescape} " \
        "--cache-control #{cache_control}"
  end

  puts "\nDeploy complete."
end

def run(cmd)
  puts "  $ #{cmd}"
  system(cmd) || abort("Command failed: #{cmd}")
end

main
