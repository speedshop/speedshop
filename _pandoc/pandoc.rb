post_paths = Dir["_site/**/*"].select { |p| p.end_with?(".html") }

PANDOC_OPTS = "--lua-filter _pandoc/url_filter.lua --resource-path=_site --pdf-engine=xelatex"

errors = []
mutex = Mutex.new

threads = post_paths.flat_map do |pp|
  base_path = pp.sub(/\.html$/, "")

  [
    Thread.new do
      output = `pandoc #{PANDOC_OPTS} -o #{base_path}.epub #{pp} 2>&1`
      mutex.synchronize { errors << "EPUB #{pp}: #{output}" } unless $?.success?
    end,
    Thread.new do
      output = `pandoc #{PANDOC_OPTS} -o #{base_path}.md #{pp} 2>&1`
      mutex.synchronize { errors << "MD #{pp}: #{output}" } unless $?.success?
    end,
    Thread.new do
      output = `pandoc #{PANDOC_OPTS} -o #{base_path}.pdf #{pp} 2>&1`
      mutex.synchronize { errors << "PDF #{pp}: #{output}" } unless $?.success?
    end
  ].each { printf "." }
end

threads.map(&:join)

if errors.any?
  puts "\n\nPandoc errors:"
  errors.each { |e| puts e }
  exit 1
end
