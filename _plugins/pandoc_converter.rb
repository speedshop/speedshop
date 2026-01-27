require "fileutils"

Jekyll::Hooks.register :site, :post_write do |site|
  post_paths = Dir["#{site.dest}/**/*"].select { |p| p.end_with?(".html") }
  next if post_paths.empty?

  pandoc_opts = "--lua-filter #{site.source}/_pandoc/url_filter.lua --resource-path=#{site.dest} --pdf-engine=xelatex"

  errors = []
  alias_md_paths = []
  mutex = Mutex.new

  threads = post_paths.flat_map do |pp|
    base_path = pp.sub(/\.html$/, "")

    if (match = pp.match(%r{/blog/([^/]+)/index\.html$}))
      alias_md_paths << {
        source: "#{base_path}.md",
        target: File.join(site.dest, "blog", "#{match[1]}.md")
      }
    end

    [
      Thread.new do
        output = `pandoc #{pandoc_opts} -o #{base_path}.epub #{pp} 2>&1`
        mutex.synchronize { errors << "EPUB #{pp}: #{output}" } unless $?.success?
      end,
      Thread.new do
        output = `pandoc #{pandoc_opts} -o #{base_path}.md #{pp} 2>&1`
        mutex.synchronize { errors << "MD #{pp}: #{output}" } unless $?.success?
      end,
      Thread.new do
        output = `pandoc #{pandoc_opts} -o #{base_path}.pdf #{pp} 2>&1`
        mutex.synchronize { errors << "PDF #{pp}: #{output}" } unless $?.success?
      end
    ]
  end

  threads.map(&:join)

  alias_md_paths.each do |paths|
    next unless File.exist?(paths[:source])

    begin
      FileUtils.cp(paths[:source], paths[:target])
    rescue => e
      errors << "MD alias #{paths[:target]}: #{e.message}"
    end
  end

  if errors.any?
    Jekyll.logger.error "Pandoc", "Errors during conversion:"
    errors.each { |e| Jekyll.logger.error "Pandoc", e }
  else
    Jekyll.logger.info "Pandoc", "Converted #{post_paths.size} HTML files to epub/md/pdf"
  end
end
