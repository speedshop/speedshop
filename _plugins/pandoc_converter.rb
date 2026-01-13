Jekyll::Hooks.register :site, :post_write do |site|
  post_paths = Dir["#{site.dest}/**/*"].select { |p| p.end_with?(".html") }
  next if post_paths.empty?

  pandoc_opts = "--lua-filter #{site.source}/_pandoc/url_filter.lua --resource-path=#{site.dest} --pdf-engine=xelatex"

  errors = []
  mutex = Mutex.new

  threads = post_paths.flat_map do |pp|
    base_path = pp.sub(/\.html$/, "")

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

  if errors.any?
    Jekyll.logger.error "Pandoc", "Errors during conversion:"
    errors.each { |e| Jekyll.logger.error "Pandoc", e }
  else
    Jekyll.logger.info "Pandoc", "Converted #{post_paths.size} HTML files to epub/md/pdf"
  end
end
