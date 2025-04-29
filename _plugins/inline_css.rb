Jekyll::Hooks.register :site, :post_write do |site|
  css_path = File.join(site.dest, 'assets/css/app.css')

  unless File.exist?(css_path)
    puts "⚠️ Could not inline CSS: CSS file not found at #{css_path}"
    return
  end

  puts "🧹 Running PurgeCSS..."
  purge_cmd = <<~CMD
    npx purgecss \
      --css #{css_path} \
      --content #{site.dest}/**/*.html #{site.dest}/*.html \
      -o #{File.dirname(css_path)}
  CMD

  unless system(purge_cmd)
    puts "❌ PurgeCSS failed"
    return
  end

  css = File.read(css_path)
  Dir.glob(File.join(site.dest, '**', '*.html')).each do |html_path|
    puts "✨ Inlining CSS into #{html_path}"
    html = File.read(html_path)
    if html.include?("<!-- INLINE_CSS -->")
      html.gsub!("<!-- INLINE_CSS -->", "<style>#{css}</style>")
      File.write(html_path, html)
    end
  end
end
