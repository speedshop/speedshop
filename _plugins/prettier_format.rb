Jekyll::Hooks.register :site, :post_write do |site|
  puts "🎨 Running Prettier on site assets..."

  # Ensure prettier is installed
  unless system("npm list prettier > /dev/null 2>&1")
    puts "❌ Prettier is not installed"
  end

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
