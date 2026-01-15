require "digest"

Jekyll::Hooks.register :site, :post_write do |site|
  # Build CSS and JS with esbuild
  puts "Building assets with esbuild..."
  esbuild_cmd = "npm run build -- #{site.dest}"

  unless system(esbuild_cmd)
    puts "esbuild build failed"
    next
  end

  # Fingerprint JS files
  js_dir = File.join(site.dest, "assets/js")
  fingerprinted = {}

  if Dir.exist?(js_dir)
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
  end

  # Inline CSS
  css_path = File.join(site.dest, "assets/css/app.css")

  unless File.exist?(css_path)
    puts "Could not inline CSS: CSS file not found at #{css_path}"
    next
  end

  css = File.read(css_path)

  # Update HTML files with inlined CSS and fingerprinted JS references
  Dir.glob(File.join(site.dest, "**", "*.html")).each do |html_path|
    html = File.read(html_path)
    modified = false

    # Inline CSS
    if html.include?("<!-- INLINE_CSS -->")
      puts "Inlining CSS into #{html_path}"
      html.gsub!("<!-- INLINE_CSS -->", "<style>#{css}</style>")
      modified = true
    end

    # Update fingerprinted JS references
    fingerprinted.each do |original, fingerprinted_url|
      if html.include?(original)
        html.gsub!(original, fingerprinted_url)
        modified = true
      end
    end

    File.write(html_path, html) if modified
  end
end
