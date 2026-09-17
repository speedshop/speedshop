require "minitest/autorun"

class DeployValidationParityTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)
  SHARED_COMMAND = "bundle exec rake site:build_and_validate"

  def test_pull_request_and_deploy_workflows_use_the_same_validated_build
    build_workflow = File.read(File.join(ROOT, ".github/workflows/build.yml"))
    deploy_workflow = File.read(File.join(ROOT, ".github/workflows/deploy.yml"))

    assert_includes build_workflow, SHARED_COMMAND
    assert_includes deploy_workflow, SHARED_COMMAND
    assert_includes build_workflow, "GENERATED_DATA_FIXTURES_PATH"
  end
end
