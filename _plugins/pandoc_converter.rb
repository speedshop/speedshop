require "fileutils"
require "etc"
require_relative "pandoc_cache"

Jekyll::Hooks.register :site, :post_write do |site|
  next if ENV["SKIP_PANDOC"] == "1"

  post_paths = Dir["#{site.dest}/**/*"].select { |p| p.end_with?(".html") }
  next if post_paths.empty?

  cache = Speedshop::PandocCache.new(site)
  pandoc_opts = ["--lua-filter", "#{site.source}/_pandoc/url_filter.lua", "--resource-path=#{site.dest}", "--pdf-engine=xelatex"]

  source_paths = {}
  site.posts.docs.each do |post|
    if post.url =~ %r{/blog/([^/]+)/?$}
      source_paths[$1] = File.join(site.source, post.relative_path)
    end
  end

  errors = []
  aliases = []
  mutex = Mutex.new
  queue = Queue.new

  post_paths.sort_by { |path| -File.size(path) }.each do |path|
    base_path = path.sub(/\.html$/, "")
    blog_match = path.match(%r{/blog/([^/]+)/index\.html$})

    if blog_match
      %w[md pdf epub].each do |format|
        aliases << ["#{base_path}.#{format}", File.join(site.dest, "blog", "#{blog_match[1]}.#{format}")]
      end
    end

    formats = %w[epub md pdf]
    if blog_match && source_paths[blog_match[1]]
      content = File.read(source_paths[blog_match[1]], encoding: "UTF-8")
      body = content.sub(/\A---\n.+?\n---\n*/m, "")
      File.write("#{base_path}.md", body, encoding: "UTF-8")
      formats = %w[epub pdf]
    end

    formats.each { |format| queue << [path, "#{base_path}.#{format}", format] }
  end

  queue.close
  Array.new([Etc.nprocessors, queue.size].min) do
    Thread.new do
      while (job = queue.pop)
        input, destination, format = job
        cache.fetch(input, destination) do
          output, status = Open3.capture2e("pandoc", *pandoc_opts, "-o", destination, input)
          mutex.synchronize { errors << "#{format.upcase} #{input}: #{output}" } unless status.success?
          status.success?
        end
      end
    end
  end.each(&:value)

  aliases.each do |source, target|
    next unless File.exist?(source)

    begin
      FileUtils.cp(source, target)
    rescue => e
      errors << "#{File.extname(target).delete_prefix(".").upcase} alias #{target}: #{e.message}"
    end
  end

  if errors.any?
    Jekyll.logger.error "Pandoc", "Errors during conversion:"
    errors.each { |e| Jekyll.logger.error "Pandoc", e }
  else
    Jekyll.logger.info "Pandoc", "Converted #{post_paths.size} HTML files to epub/md/pdf"
  end
end
