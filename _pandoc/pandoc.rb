Dir.mkdir "_site/pandoc" rescue nil
post_paths = Dir["_site/**/*"].select { |p| p.end_with?(".html") }

post_paths.each do |pp| 
  path = "_site/pandoc/" + pp.split(".").first.split("/").last
  # `pandoc --lua-filter _pandoc/url_filter.lua -s -o #{path + ".pdf"} #{pp}`
  `pandoc --lua-filter _pandoc/url_filter.lua -o #{path + ".epub"} #{pp}`
  printf "."
end

# `pandoc -s -o _site/pandoc/speedshop_blog.pdf #{post_paths.join(" ")}`