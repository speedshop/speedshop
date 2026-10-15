require "digest"
require "fileutils"
require "json"

source = ARGV.fetch(0)
output = ARGV.fetch(1, "assets/data")
dataset = JSON.parse(File.read(source))
raise "Expected a complete full-duration schema2 dataset" unless dataset["schemaVersion"] == 2 && dataset["complete"] == true && dataset["validation"] == false && dataset["samplingHz"] == 20 && dataset.fetch("failures").empty?
run_id = dataset.fetch("runId")
raise "Invalid campaign ID" unless run_id.match?(/\A[0-9][a-zA-Z0-9-]{8,100}\z/)
scenarios = dataset.fetch("scenarios")
raise "Unexpected scenarios" unless scenarios.keys.sort == %w[changing high low]
configurations = %w[1 3 5 10 25 adaptive]
series = %w[threads desiredThreads busyThreads throughput cpu memory latency ioRatio]
files = []
scenarios.each do |kind, workloads|
  expected_io = (kind == "low") ? %w[10 20 30] : %w[70 80 90]
  raise "Unexpected #{kind} workloads" unless workloads.keys.sort == expected_io
  workloads.each do |io, workload|
    raise "Expected individual latency observations" unless workload.fetch("latencyWindow") == "individual"
    runs = workload.fetch("runs")
    raise "Unexpected #{kind}/#{io} configurations" unless runs.keys.sort == configurations.sort
    runs.each do |configuration, run|
      raise "Invalid #{kind}/#{io}/#{configuration} result" unless run.fetch("status") == "success" && series.all? { |key| run.fetch(key).is_a?(Array) && !run.fetch(key).empty? }
      body = JSON.generate(run)
      sha256 = Digest::SHA256.hexdigest(body)
      relative_path = "threadpilot-runs/#{run_id}/#{kind}-#{io}-#{configuration}-#{sha256[0, 12]}.json"
      files << [relative_path, body]
      runs[configuration] = run.except(*series).merge("dataUrl" => "/assets/data/#{relative_path}", "dataSha256" => sha256)
    end
  end
end
raise "Expected exactly 54 runs" unless files.length == 54
dataset["delivery"] = "per-run"
dataset["fullDatasetSha256"] = Digest::SHA256.file(source).hexdigest
files.each do |relative_path, body|
  path = File.join(output, relative_path)
  FileUtils.mkdir_p(File.dirname(path))
  if File.exist?(path)
    raise "Conflicting immutable run file: #{path}" unless File.binread(path) == body
  else
    File.write(path, body)
  end
end
index = JSON.generate(dataset)
File.write(File.join(output, "threadpilot_scenarios.json"), index)
puts JSON.pretty_generate(run_id: run_id, runs: files.length, full_dataset_bytes: File.size(source), index_bytes: index.bytesize, run_file_bytes: files.sum { |_, body| body.bytesize }, full_dataset_sha256: dataset.fetch("fullDatasetSha256"))
