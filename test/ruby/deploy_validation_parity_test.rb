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
    build_job = deploy_workflow.split("\n  deploy:", 2).first
    assert_includes build_job, "WEBSITE_SNAPSHOT_URL"
    assert_includes build_job, "--proto '=https'"
    assert_includes build_job, "--max-filesize 5242880"
    refute_includes build_job, "secrets."
    refute_includes build_job, "aws s3api get-object"
  end
end
