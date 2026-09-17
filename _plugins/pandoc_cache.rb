require "digest"
require "open3"

module Speedshop
  class PandocCache
    def initialize(site)
      @cache = Jekyll::Cache.new("Speedshop::Pandoc")
      @fingerprint_cache = Jekyll::Cache.new("Speedshop::PandocDependencies")
      fingerprints = read_cached(@fingerprint_cache, "files") || {}
      current_fingerprints = {}
      @context = Digest::SHA256.new
      @context << File.binread(__FILE__)
      @context << File.binread(File.join(site.source, "_plugins", "pandoc_converter.rb"))
      pandoc_version = command("pandoc", "--version")
      @context << pandoc_version
      data_directory = pandoc_version[/^User data directory: (.+)$/, 1]
      raise "Pandoc did not report its user data directory" unless data_directory
      @context << command("xelatex", "--version")
      @context << ENV.select { |key, _| key.start_with?("TEX", "FONT", "OSFONT") || key == "SOURCE_DATE_EPOCH" }.sort.inspect

      # TeX packages, formats and fonts affect PDFs independently of the HTML.
      tex_roots = %w[TEXMFROOT TEXMFHOME TEXMFLOCAL TEXMFCONFIG TEXMFVAR].map do |variable|
        command("kpsewhich", "-var-value=#{variable}").strip
      end
      paths = tex_roots.reject(&:empty?).uniq.flat_map do |root|
        Dir.glob(File.join(root, "**", "*"))
      end
      ["/Library/Fonts", File.expand_path("~/Library/Fonts"), "/usr/share/fonts", File.expand_path("~/.local/share/fonts")].each do |root|
        paths.concat(Dir.glob(File.join(root, "**", "*")))
      end
      paths.concat(Dir.glob(File.join(data_directory, "**", "*")))
      paths.concat(Dir.glob(File.join(site.source, "_pandoc", "**", "*")))
      paths.concat(site.static_files.map { |file| file.destination(site.dest) })
      paths.concat(Dir.glob(File.join(site.dest, "assets", "**", "*")))
      paths.uniq.sort.each do |path|
        next unless File.file?(path)
        next if path == File.join(site.dest, "assets", "manifest.json")

        stat = File.stat(path)
        signature = [stat.size, stat.mtime.to_r, stat.ctime.to_r, stat.ino, stat.dev]
        previous = fingerprints[path]
        digest = if previous && previous[0] == signature
          previous[1]
        else
          Digest::SHA256.file(path).digest
        end
        current_fingerprints[path] = [signature, digest]
        @context << path << "\0" << digest
      end
      @fingerprint_cache["files"] = current_fingerprints
    end

    def fetch(input, output)
      key = [@context.hexdigest, input, output, Digest::SHA256.file(input).hexdigest].join("\0")
      if (cached = read_cached(@cache, key))
        File.binwrite(output, cached)
        return true
      end

      return false unless yield

      @cache[key] = File.binread(output)
      true
    end

    private

    def read_cached(cache, key)
      cache[key] if cache.key?(key)
    rescue EOFError, ArgumentError, TypeError => error
      Jekyll.logger.warn "Pandoc cache:", "Discarding unreadable entry: #{error.message}"
      cache.delete(key)
      nil
    end

    def command(*args)
      output, status = Open3.capture2e(*args)
      raise "#{args.join(" ")} failed: #{output}" unless status.success?

      output
    end
  end
end
