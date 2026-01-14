Jekyll::Hooks.register :site, :after_init do |site|
  client_notes_path = ENV["CLIENT_NOTES_PATH"]
  next unless client_notes_path && Dir.exist?(client_notes_path)

  Jekyll.logger.info "Generating SLA/availability data from #{client_notes_path}..."

  data_dir = File.join(site.source, "_data")
  FileUtils.mkdir_p(data_dir)

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
