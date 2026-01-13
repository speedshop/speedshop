require "digest"

Jekyll::Hooks.register :site, :post_write do |site|
  js_dir = File.join(site.dest, "assets/js")

  unless Dir.exist?(js_dir)
    puts "No assets/js directory found, skipping fingerprinting"
    next
  end

  fingerprinted = {}

  Dir.glob(File.join(js_dir, "*.js")).each do |js_path|
    content = File.read(js_path)
    hash = Digest::MD5.hexdigest(content)[0, 8]
    basename = File.basename(js_path, ".js")
    fingerprinted_name = "#{basename}-#{hash}.js"
    fingerprinted_path = File.join(js_dir, fingerprinted_name)

    File.write(fingerprinted_path, content)
    puts "Fingerprinted #{basename}.js -> #{fingerprinted_name}"

    fingerprinted["/assets/js/#{basename}.js"] = "/assets/js/#{fingerprinted_name}"
  end

  Dir.glob(File.join(site.dest, "**", "*.html")).each do |html_path|
    html = File.read(html_path)
    modified = false

    fingerprinted.each do |original, fingerprinted_url|
      if html.include?(original)
        html.gsub!(original, fingerprinted_url)
        modified = true
      end
    end

    File.write(html_path, html) if modified
  end
end
