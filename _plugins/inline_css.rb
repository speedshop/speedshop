require "json"

def load_manifest_entries(path)
  return {} unless File.exist?(path)

  manifest = JSON.parse(File.read(path))
  entries = manifest["entries"]
  unless entries.is_a?(Hash)
    warn "Manifest entries missing or invalid at #{path}"
    return {}
  end
  entries
rescue JSON::ParserError => e
  warn "Manifest JSON invalid at #{path}: #{e.message}"
  {}
end

Jekyll::Hooks.register :site, :post_write do |site|
  # Build CSS and JS with esbuild
  puts "Building assets with esbuild..."
  esbuild_cmd = "npm run build -- #{site.dest}"

  unless system(esbuild_cmd)
    puts "esbuild build failed"
    next
  end

  manifest_path = File.join(site.dest, "assets/manifest.json")
  manifest_entries = load_manifest_entries(manifest_path)

  # Inline CSS
  css_entry = manifest_entries.fetch("/assets/css/app.css", "/assets/css/app.css")
  css_path = File.join(site.dest, css_entry.sub(%r{\A/}, ""))

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

    # Update hashed asset references from the manifest
    manifest_entries.each do |original, hashed|
      next if original == hashed

      if html.include?(original)
        html.gsub!(original, hashed)
        modified = true
      end
    end

    File.write(html_path, html) if modified
  end
end
