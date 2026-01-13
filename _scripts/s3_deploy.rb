#!/usr/bin/env ruby
# frozen_string_literal: true

# Deploys _site/ to S3 with correct Content-Type headers based on .s3-headers.yml

require "yaml"
require "shellwords"

SITE_DIR = "_site"
CONFIG_FILE = ".s3-headers.yml"

CACHE_CONTROL = {
  immutable: "max-age=31536000, immutable",
  one_day: "max-age=86400",
  one_hour: "max-age=3600"
}.freeze

# File patterns and their cache control settings
CACHE_RULES = [
  # Images - immutable (1 year)
  {patterns: %w[*.jpg *.jpeg *.png *.gif *.svg *.ico], cache: :immutable},
  # JS/CSS - 1 day (no fingerprinting yet)
  {patterns: %w[*.js *.css], cache: :one_day},
  # Feeds/data - 1 hour
  {patterns: %w[*.xml *.json *.ics], cache: :one_hour}
  # Everything else gets :one_day as default
].freeze

def main
  bucket = ENV.fetch("S3_BUCKET") { abort "S3_BUCKET environment variable required" }
  config = YAML.safe_load_file(CONFIG_FILE)
  content_types = config.fetch("content_types", [])

  puts "Deploying #{SITE_DIR}/ to s3://#{bucket}"

  # Build exclusion patterns for content-type overrides
  content_type_excludes = content_types.map { |ct| "--exclude #{ct["pattern"].shellescape}" }.join(" ")

  # Build exclusion patterns for cache-control rules
  cache_rule_patterns = CACHE_RULES.flat_map { |rule| rule[:patterns] }
  cache_excludes = cache_rule_patterns.map { |p| "--exclude #{p.shellescape}" }.join(" ")

  # Sync files with special cache rules first
  CACHE_RULES.each do |rule|
    cache_value = CACHE_CONTROL[rule[:cache]]
    includes = rule[:patterns].map { |p| "--include #{p.shellescape}" }.join(" ")

    puts "\n=> Syncing #{rule[:patterns].join(", ")} with Cache-Control: #{cache_value}"
    run "aws s3 sync #{SITE_DIR} s3://#{bucket} --acl public-read " \
        "--exclude \"*\" #{includes} " \
        "--cache-control #{cache_value.shellescape}"
  end

  # Sync standard files (excluding cache-rule patterns and content-type patterns)
  puts "\n=> Syncing standard files with Cache-Control: #{CACHE_CONTROL[:one_day]}"
  run "aws s3 sync #{SITE_DIR} s3://#{bucket} --acl public-read --delete " \
      "--cache-control #{CACHE_CONTROL[:one_day].shellescape} #{cache_excludes} #{content_type_excludes}"

  # Sync files with special Content-Type
  content_types.each do |ct|
    pattern = ct["pattern"]
    content_type = ct["content_type"]
    cache_value = cache_for_pattern(pattern)

    puts "\n=> Syncing #{pattern} with Content-Type: #{content_type}, Cache-Control: #{cache_value}"
    run "aws s3 sync #{SITE_DIR} s3://#{bucket} --acl public-read " \
        "--exclude \"*\" --include #{pattern.shellescape} " \
        "--content-type #{content_type.shellescape} " \
        "--cache-control #{cache_value.shellescape}"
  end

  puts "\nDeploy complete."
end

def cache_for_pattern(pattern)
  CACHE_RULES.each do |rule|
    return CACHE_CONTROL[rule[:cache]] if rule[:patterns].any? { |p| File.fnmatch(p, pattern) }
  end
  CACHE_CONTROL[:one_day]
end

def run(cmd)
  puts "  $ #{cmd}"
  system(cmd) || abort("Command failed: #{cmd}")
end

main
