require "json"
require "nokogiri"

module Speedshop
  class GeneratedSiteValidator
    class ValidationError < StandardError; end

    def initialize(site_dir:, data_dir:, archive_source_configured: false)
      @site_dir = site_dir
      @data_dir = data_dir
      @archive_source_configured = archive_source_configured
    end

    def validate!
      errors = []
      validate_status(errors)
      validate_holidays(errors)
      validate_four_line_archive(errors)

      raise ValidationError, error_message(errors) if errors.any?

      puts "All generated site validations passed!"
    end

    private

    def validate_status(errors)
      content = read_file("status.html", errors)
      return unless content

      errors << "status.html: SLA policy is empty - data generation likely failed" if content.include?("<b>Policy: </b></p>") || content.include?("<b>Policy: </b>\n")
      errors << "status.html: Performance percentages are empty - data generation likely failed" if content.match?(/<span class="stat-value[^"]*">\s*%\s*<\/span>/)
      errors << "status.html: statusData is null - days data was not generated" if content.include?("var statusData = null;")
      errors << "status.html: Start/end dates are empty - data generation likely failed" if content.include?("new Date('');")

      puts "Validated status.html"
    end

    def validate_holidays(errors)
      content = read_file("holidays.ics", errors)
      return unless content

      if content.length < 100 || !content.include?("BEGIN:VCALENDAR")
        errors << "holidays.ics: File is empty or invalid"
      else
        puts "Validated holidays.ics"
      end
    end

    def validate_four_line_archive(errors)
      content = read_file("four-line-fridays.html", errors)
      return unless content

      archive = read_archive(errors)
      return unless archive

      lines = archive["lines"]
      unless lines.is_a?(Array) && archive["line_count"] == lines.length
        errors << "four-line-fridays.html: Archive data has an invalid line count"
        return
      end

      if @archive_source_configured && lines.empty?
        errors << "four-line-fridays.html: FLF archive is empty despite an archive source being configured"
        return
      end

      document = Nokogiri::HTML(content)
      results = document.at_css("#four-line-results")
      unless results
        errors << "four-line-fridays.html: Rendered archive list is missing"
        return
      end

      entries = results.css("li.four-line-result")
      errors << "four-line-fridays.html: Expected #{lines.length} rendered lines, found #{entries.length}" unless entries.length == lines.length

      entries_by_id = entries.to_h { |entry| [entry["id"], entry] }
      lines.each do |line|
        validate_rendered_line(line, entries_by_id, errors)
      end

      puts "Validated four-line-fridays.html" if errors.none? { |error| error.start_with?("four-line-fridays.html:") }
    end

    def validate_rendered_line(line, entries_by_id, errors)
      id = line["id"]
      entry = entries_by_id[id]
      unless id.is_a?(String) && !id.empty? && entry
        errors << "four-line-fridays.html: Rendered line #{id.inspect} is missing"
        return
      end

      expected_search = "#{line["line_text"]} #{line["issue_date"]}".downcase
      errors << "four-line-fridays.html: Rendered line #{id} has invalid search data" unless entry["data-search"] == expected_search

      permalink = entry.at_css("a.four-line-permalink")
      errors << "four-line-fridays.html: Rendered line #{id} has an invalid permalink" unless permalink && permalink["href"] == "##{id}"
    end

    def read_archive(errors)
      path = File.join(@data_dir, "four_line_archive.json")
      unless File.file?(path)
        errors << "four-line-fridays.html: Generated archive data is missing"
        return
      end

      JSON.parse(File.read(path))
    rescue JSON::ParserError => error
      errors << "four-line-fridays.html: Generated archive data is invalid JSON (#{error.message})"
      nil
    end

    def read_file(name, errors)
      path = File.join(@site_dir, name)
      unless File.file?(path)
        errors << "#{name} not found in #{@site_dir}"
        return
      end

      File.read(path)
    end

    def error_message(errors)
      <<~ERROR
        Generated site validation failed with #{errors.length} error(s):

        #{errors.map { |error| "  - #{error}" }.join("\n")}

        This usually means the data generation or site build step failed.
      ERROR
    end
  end
end
