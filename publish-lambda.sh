#!/bin/bash
set -e

if [[ $CODEBUILD_WEBHOOK_EVENT == 'PULL_REQUEST_MERGED' ]] || [[ $BUILD_TYPE = 'manual' ]]; then

  echo "PUSH LAMBDA PACKAGE"
  aws s3api put-object --bucket $DEPLOY_BUCKET --body dist/$PACKAGE_FILE --key tf-codebuild-trigger/$PACKAGE_FILE --debug

  echo "DEPLOY LAMBDA"
  build_id=$(aws codebuild start-build \
  --project-name tf-codebuild-trigger-publish \
  --environment-variables-override \
  name=FUNCTION_NAME,value=tf-codebuild-trigger name=PACKAGE_FILE,value=$PACKAGE_FILE \
  --source-version $CODEBUILD_RESOLVED_SOURCE_VERSION \
  --debug \
  | jq -r '.build.id')
  echo "Build id: ${build_id}"
  build_status=$(aws codebuild batch-get-builds --ids $build_id | jq -r '.builds[0].buildStatus')

  build_failed=false

  while [[ $build_status != "SUCCEEDED" ]]; do
    sleep 10s
    echo "Checking build status"
    build_status=$(aws codebuild batch-get-builds --ids $build_id | jq -r '.builds[0].buildStatus')
    echo "Build status: ${build_status}"
    if [[ $build_status == "FAILED" ]]; then
      build_failed=true
      break
    fi
  done

  if [[ $build_failed == true ]]; then
    echo "Build failed, failing current build!"
    exit 1
  elif [[ $build_status == "SUCCEEDED" ]]; then
    echo "Build succeeded"
    exit 0
  fi
else
  echo "Build only, skipping push and deploy"
fi
