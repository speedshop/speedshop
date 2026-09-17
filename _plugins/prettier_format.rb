Jekyll::Hooks.register :site, :post_write do |site|
  puts "🎨 Running Prettier on site assets..."

  cache_dir = Jekyll::Cache.disk_cache_enabled ? File.join(Jekyll::Cache.cache_dir, "Speedshop-Prettier") : ""
  formatter = File.join(site.source, "_scripts", "format.mjs")

  unless system("node", formatter, site.dest, cache_dir)
    puts "❌ Prettier formatting failed"
    next
  end

  puts "✨ Successfully formatted site assets"
end
