require "rake/testtask"
require "rbconfig"

require_relative "_scripts/generated_site_validator"

Rake::TestTask.new(:test) do |t|
  t.libs << "test/ruby"
  t.test_files = FileList["test/ruby/**/*_test.rb"]
  t.warning = false
end

desc "Run built-site link integrity checks"
Rake::TestTask.new("test:links") do |t|
  t.libs << "test/integration"
  t.test_files = FileList["test/integration/link_integrity_test.rb"]
end

desc "Run integration tests (set BASE_URL env var, default: http://localhost:4000)"
task :integration do
  sh "ruby test/integration/site_test.rb"
end

desc "Run StandardRB linter"
task :lint do
  sh "bundle exec standardrb"
end

task default: [:lint, :test]

namespace :site do
  desc "Build and validate the exact site artifact that is safe to upload"
  task :build_and_validate do
    sh RbConfig.ruby, "-S", "jekyll", "build"
    Rake::Task["validate:generated_data"].invoke
  end
end

namespace :validate do
  desc "Run all validations"
  task all: [:ruby_version, :generated_data]

  desc "Validate Ruby version matches mise.toml"
  task :ruby_version do
    mise_config_file = File.join(__dir__, "mise.toml")
    unless File.exist?(mise_config_file)
      puts "No mise.toml file found, skipping version check"
      next
    end

    expected_version = File.read(mise_config_file)[/^ruby\s*=\s*"([^"]+)"$/, 1]
    unless expected_version
      puts "No Ruby version configured in mise.toml, skipping version check"
      next
    end

    current_version = RUBY_VERSION

    # Compare major.minor.patch - allow for exact match or compatible patch versions
    expected_parts = expected_version.split(".")
    current_parts = current_version.split(".")

    # Check major and minor must match exactly
    if expected_parts[0] != current_parts[0] || expected_parts[1] != current_parts[1]
      abort <<~ERROR
        Ruby version mismatch!
        Expected: #{expected_version} (from mise.toml)
        Current:  #{current_version}

        Please install the correct Ruby version via mise or update mise.toml.
      ERROR
    end

    # Warn if patch version differs
    if expected_parts[2] && expected_parts[2] != current_parts[2]
      puts "Warning: Ruby patch version differs (expected #{expected_version}, running #{current_version})"
    end

    puts "Ruby version check passed: #{current_version}"
  end

  desc "Validate generated data files in _site exist and have required content"
  task :generated_data do
    site_dir = File.join(__dir__, "_site")
    abort "Site directory not found at #{site_dir}. Run 'bundle exec jekyll build' first." unless Dir.exist?(site_dir)

    archive_source_configured = [ENV["GENERATED_DATA_FIXTURES_PATH"], ENV["CLIENT_NOTES_PATH"]].compact.any? { |path| Dir.exist?(path) }
    validator = Speedshop::GeneratedSiteValidator.new(
      site_dir: site_dir,
      data_dir: File.join(__dir__, "_data"),
      archive_source_configured: archive_source_configured
    )
    validator.validate!
  rescue Speedshop::GeneratedSiteValidator::ValidationError => error
    abort error.message
  end
end
