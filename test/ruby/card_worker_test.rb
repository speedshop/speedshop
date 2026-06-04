require "minitest/autorun"
require "open3"

class CardWorkerTest < Minitest::Test
  def test_card_worker_routing
    stdout, stderr, status = Open3.capture3("node", "test/worker/card_worker_test.mjs")

    assert status.success?, <<~MSG
      card worker tests failed

      STDOUT:
      #{stdout}

      STDERR:
      #{stderr}
    MSG
  end
end
