Jekyll::Hooks.register :site, :post_write do |site|
  html_path = File.join(site.dest, 'index.html')
  css_path  = File.join(site.dest, 'assets/css/app.css')

  if File.exist?(html_path) && File.exist?(css_path)
    css  = File.read(css_path)
    html = File.read(html_path)

    puts "🧹 Running PurgeCSS..."
    purge_cmd = <<~CMD
      npx purgecss \
        --css #{css_path} \
        --content #{site.dest}/**/*.html #{site.dest}/*.html \
        -o #{File.dirname(css_path)}
    CMD

    purge_result = system(purge_cmd)
    unless purge_result
      puts "❌ PurgeCSS failed"
      return
    end

    puts "✨ Inlining CSS into #{html_path}"
    css = File.read(css_path)
    html = File.read(html_path)
    html.gsub!("<!-- INLINE_CSS -->", "<style>#{css}</style>")
    File.write(html_path, html)
  else
    puts "⚠️ Could not inline CSS: file(s) not found."
  end
end
