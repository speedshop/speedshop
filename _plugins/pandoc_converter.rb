require "fileutils"

Jekyll::Hooks.register :site, :post_write do |site|
  post_paths = Dir["#{site.dest}/**/*"].select { |p| p.end_with?(".html") }
  next if post_paths.empty?

  pandoc_opts = "--lua-filter #{site.source}/_pandoc/url_filter.lua --resource-path=#{site.dest} --pdf-engine=xelatex"

  # Build mapping: blog slug -> source markdown path
  source_paths = {}
  site.posts.docs.each do |post|
    if post.url =~ %r{/blog/([^/]+)/?$}
      source_paths[$1] = File.join(site.source, post.relative_path)
    end
  end

  errors = []
  alias_md_paths = []
  mutex = Mutex.new

  threads = post_paths.flat_map do |pp|
    base_path = pp.sub(/\.html$/, "")
    blog_match = pp.match(%r{/blog/([^/]+)/index\.html$})

    if blog_match
      alias_md_paths << {
        source: "#{base_path}.md",
        target: File.join(site.dest, "blog", "#{blog_match[1]}.md")
      }
    end

    # For blog posts, copy source markdown directly instead of converting HTML
    if blog_match && source_paths[blog_match[1]]
      source_file = source_paths[blog_match[1]]
      content = File.read(source_file, encoding: "UTF-8")
      body = content.sub(/\A---\n.+?\n---\n*/m, "") # Strip front matter
      File.write("#{base_path}.md", body, encoding: "UTF-8")

      # Only generate EPUB and PDF from HTML for blog posts
      [
        Thread.new do
          output = `pandoc #{pandoc_opts} -o #{base_path}.epub #{pp} 2>&1`
          mutex.synchronize { errors << "EPUB #{pp}: #{output}" } unless $?.success?
        end,
        Thread.new do
          output = `pandoc #{pandoc_opts} -o #{base_path}.pdf #{pp} 2>&1`
          mutex.synchronize { errors << "PDF #{pp}: #{output}" } unless $?.success?
        end
      ]
    else
      # Non-blog HTML: use Pandoc for all formats
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

  # Prepend llms.txt reference to all generated markdown files for agent discovery
  llms_header = "<!-- For full site context, see: https://www.speedshop.co/llms.txt -->\n\n"
  Dir["#{site.dest}/**/*.md"].each do |md_file|
    content = File.read(md_file, encoding: "UTF-8")
    next if content.start_with?("<!--")
    File.write(md_file, llms_header + content, encoding: "UTF-8")
  end

  if errors.any?
    Jekyll.logger.error "Pandoc", "Errors during conversion:"
    errors.each { |e| Jekyll.logger.error "Pandoc", e }
  else
    Jekyll.logger.info "Pandoc", "Converted #{post_paths.size} HTML files to epub/md/pdf"
  end
end
