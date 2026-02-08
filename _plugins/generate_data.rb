require "fileutils"
require "json"

module Speedshop
  module GenerateDataDefaults
    module_function

    def sla_status
      {
        "sla_policy" => "",
        "generated_at" => "1970-01-01",
        "start_date" => "1970-01-01",
        "end_date" => "1970-01-01",
        "performance" => {
          "last_30_days" => 0,
          "last_90_days" => 0,
          "last_6_months" => 0
        },
        "days" => []
      }
    end

    def availability
      {
        "months" => [
          {"label" => "Jan 1970", "status" => "available"},
          {"label" => "Feb 1970", "status" => "available"},
          {"label" => "Mar 1970", "status" => "available"}
        ]
      }
    end

    def holidays_ics
      <<~ICS
        BEGIN:VCALENDAR
        VERSION:2.0
        PRODID:-//speedshop//generated//EN
        END:VCALENDAR
      ICS
    end
  end
end

Jekyll::Hooks.register :site, :after_init do |site|
  client_notes_path = ENV["CLIENT_NOTES_PATH"]

  data_dir = File.join(site.source, "_data")
  FileUtils.mkdir_p(data_dir)

  sla_status_path = File.join(data_dir, "sla_status.json")
  availability_path = File.join(data_dir, "availability.json")
  holidays_path = File.join(site.source, "holidays.ics")

  unless client_notes_path && Dir.exist?(client_notes_path)
    # CI and local dev often don't have the private client notes repo checked out.
    # Ensure required build artifacts exist so the built site is stable and tests pass.
    File.write(sla_status_path, "#{JSON.pretty_generate(Speedshop::GenerateDataDefaults.sla_status)}\n") unless File.exist?(sla_status_path)
    File.write(availability_path, "#{JSON.pretty_generate(Speedshop::GenerateDataDefaults.availability)}\n") unless File.exist?(availability_path)
    File.write(holidays_path, Speedshop::GenerateDataDefaults.holidays_ics) unless File.exist?(holidays_path)
    next
  end

  Jekyll.logger.info "Generating SLA/availability data from #{client_notes_path}..."

  def run_command(cmd, description)
    return if system(cmd)

    raise "Failed to #{description}: command '#{cmd}' exited with status #{$?.exitstatus}"
  end

  Bundler.with_unbundled_env do
    Dir.chdir(client_notes_path) do
      run_command("bundle install --quiet", "install client_notes dependencies")
      run_command("bundle exec rake sla:generate_json[#{data_dir}/sla_status.json]", "generate SLA status JSON")
      run_command("bundle exec rake sla:generate_holidays_ics[#{site.source}/holidays.ics]", "generate holidays ICS")
      run_command("bundle exec rake availability:generate_json[#{data_dir}/availability.json]",
        "generate availability JSON")
    end
  end
end
