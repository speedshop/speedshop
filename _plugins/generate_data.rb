Jekyll::Hooks.register :site, :after_init do |site|
  client_notes_path = ENV['CLIENT_NOTES_PATH']
  next unless client_notes_path && Dir.exist?(client_notes_path)

  Jekyll.logger.info "Generating SLA/availability data from #{client_notes_path}..."

  data_dir = File.join(site.source, '_data')
  FileUtils.mkdir_p(data_dir)

  Bundler.with_unbundled_env do
    Dir.chdir(client_notes_path) do
      system('bundle install --quiet')
      system("bundle exec rake sla:generate_json[#{data_dir}/sla_status.json]")
      system("bundle exec rake sla:generate_holidays_ics[#{site.source}/holidays.ics]")
      system("bundle exec rake availability:generate_json[#{data_dir}/availability.json]")
    end
  end
end
