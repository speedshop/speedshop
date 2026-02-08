Jekyll::Hooks.register :site, :post_write do |site|
  puts "🎨 Running Prettier on site assets..."

  # Run prettier on all HTML, CSS, and JS files
  prettier_cmd = <<~CMD
    npx prettier \
      --write \
      "#{site.dest}/**/*.{html,css,js}" \
      --ignore-path .prettierignore
  CMD

  unless system(prettier_cmd)
    puts "❌ Prettier formatting failed"
  end

  puts "✨ Successfully formatted site assets"
end
