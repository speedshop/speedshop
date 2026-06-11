Jekyll::Hooks.register :site, :post_write do |site|
  # Build CSS and JS with esbuild
  puts "Building assets with esbuild..."
  esbuild_cmd = "npm run build -- #{site.dest}"

  unless system(esbuild_cmd)
    puts "esbuild build failed"
    next
  end

  # Inline per-page purged CSS and update fingerprinted asset references
  puts "Inlining per-page purged CSS..."
  inline_cmd = "node _scripts/inline_css.mjs #{site.dest}"

  unless system(inline_cmd)
    puts "CSS inlining failed"
  end
end
