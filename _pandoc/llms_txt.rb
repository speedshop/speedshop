require "yaml"
require "date"

SITE_URL = "https://www.speedshop.co"
SITE_DIR = "_site"

# Collect blog posts with metadata and content from source files
posts = Dir["_posts/*.md"].map do |post_path|
  content = File.read(post_path)
  front_matter = content.match(/\A---\n(.+?)\n---/m)
  next unless front_matter

  meta = YAML.safe_load(front_matter[1], permitted_classes: [Date, Time])
  date = meta["date"] ? Date.parse(meta["date"].to_s) : nil

  # Build the URL path based on Jekyll permalink: /:year/:month/:day/:title.html
  filename = File.basename(post_path, ".md")
  # Parse date from filename: 2020-05-11-the-ruby-gvl-and-scaling
  if filename =~ /^(\d{4})-(\d{1,2})-(\d{1,2})-(.+)$/
    year, month, day, slug = $1, $2.rjust(2, "0"), $3.rjust(2, "0"), $4
    url_path = "/#{year}/#{month}/#{day}/#{slug}"
  else
    next
  end

  # Extract markdown body (everything after front matter)
  body = content.sub(/\A---\n.+?\n---\n*/m, "")

  {
    title: meta["title"],
    summary: meta["summary"],
    url_path: url_path,
    date: date,
    body: body
  }
end.compact.sort_by { |p| p[:date] || Date.new(1970, 1, 1) }.reverse

# Generate llms.txt
llms_txt = <<~HEADER
# Speedshop

> Speedshop is a Ruby on Rails performance consultancy. This site contains blog posts about Ruby and Rails performance, scaling, and optimization.

## Blog Posts

HEADER

posts.each do |post|
  desc = post[:summary] ? ": #{post[:summary][0, 150].gsub(/\s+/, " ").strip}" : ""
  desc = desc[0, 150] + "..." if desc.length > 153
  llms_txt << "- [#{post[:title]}](#{SITE_URL}#{post[:url_path]}.md)#{desc}\n"
end

File.write("#{SITE_DIR}/llms.txt", llms_txt)
puts "Generated llms.txt"

# Generate llms-full.txt by concatenating original markdown from _posts
llms_full = <<~HEADER
# Speedshop - Full Content

> This file contains the full markdown content of all blog posts from Speedshop, a Ruby on Rails performance consultancy.

HEADER

posts.each do |post|
  llms_full << "\n---\n\n"
  llms_full << "## #{post[:title]}\n\n"
  llms_full << "URL: #{SITE_URL}#{post[:url_path]}.html\n\n"
  llms_full << post[:body]
  llms_full << "\n"
end

File.write("#{SITE_DIR}/llms-full.txt", llms_full)
puts "Generated llms-full.txt"
