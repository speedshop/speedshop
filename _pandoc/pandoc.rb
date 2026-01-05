post_paths = Dir["_site/**/*"].select { |p| p.end_with?(".html") }

PANDOC_OPTS = "--lua-filter _pandoc/url_filter.lua --resource-path=_site"

threads = post_paths.flat_map do |pp|
  base_path = pp.sub(/\.html$/, "")

  [
    Thread.new { `pandoc #{PANDOC_OPTS} -o #{base_path}.epub #{pp}` },
    Thread.new { `pandoc #{PANDOC_OPTS} -o #{base_path}.md #{pp}` },
    Thread.new { `pandoc #{PANDOC_OPTS} -o #{base_path}.pdf #{pp}` }
  ].each { printf "." }
end

threads.map(&:join)