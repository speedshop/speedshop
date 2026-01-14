require "json"

namespace :validate do
  desc "Run all validations"
  task all: [:ruby_version, :generated_data]

  desc "Validate Ruby version matches .ruby-version"
  task :ruby_version do
    ruby_version_file = File.join(__dir__, ".ruby-version")
    unless File.exist?(ruby_version_file)
      puts "No .ruby-version file found, skipping version check"
      next
    end

    expected_version = File.read(ruby_version_file).strip
    current_version = RUBY_VERSION

    # Compare major.minor.patch - allow for exact match or compatible patch versions
    expected_parts = expected_version.split(".")
    current_parts = current_version.split(".")

    # Check major and minor must match exactly
    if expected_parts[0] != current_parts[0] || expected_parts[1] != current_parts[1]
      abort <<~ERROR
        Ruby version mismatch!
        Expected: #{expected_version} (from .ruby-version)
        Current:  #{current_version}

        Please install the correct Ruby version or update .ruby-version.
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

    unless Dir.exist?(site_dir)
      abort "Site directory not found at #{site_dir}. Run 'bundle exec jekyll build' first."
    end

    errors = []

    # Validate SLA status data is rendered in status.html
    status_file = File.join(site_dir, "status.html")
    if File.exist?(status_file)
      content = File.read(status_file)

      # Check that the policy text was rendered (not empty)
      if content.include?("<b>Policy: </b></p>") || content.include?("<b>Policy: </b>\n")
        errors << "status.html: SLA policy is empty - data generation likely failed"
      end

      # Check that performance stats have actual values
      if content.match?(/<span class="stat-value[^"]*">\s*%\s*<\/span>/)
        errors << "status.html: Performance percentages are empty - data generation likely failed"
      end

      # Check that statusData is not null in the JavaScript
      if content.include?("var statusData = null;")
        errors << "status.html: statusData is null - days data was not generated"
      end

      # Check that dates are not empty
      if content.include?("new Date('');")
        errors << "status.html: Start/end dates are empty - data generation likely failed"
      end

      puts "Validated status.html"
    else
      errors << "status.html not found in _site"
    end

    # Validate holidays.ics exists and has content
    holidays_file = File.join(site_dir, "holidays.ics")
    if File.exist?(holidays_file)
      content = File.read(holidays_file)
      if content.length < 100 || !content.include?("BEGIN:VCALENDAR")
        errors << "holidays.ics: File is empty or invalid"
      else
        puts "Validated holidays.ics"
      end
    else
      errors << "holidays.ics not found in _site"
    end

    if errors.any?
      abort <<~ERROR
        Data validation failed with #{errors.length} error(s):

        #{errors.map { |e| "  - #{e}" }.join("\n")}

        This usually means the data generation step failed during the Jekyll build.
        Check that CLIENT_NOTES_PATH is set and the rake tasks completed successfully.
      ERROR
    end

    puts "All data validations passed!"
  end
end
