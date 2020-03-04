data "terraform_remote_state" "tf-github-webhooks" {
  backend = "s3"

  config = {
    bucket = "${var.namespace}-${var.stage}-terraform-state"
    key    = "tf-github-webhooks/terraform.tfstate"
  }
}

data "terraform_remote_state" "chamber" {
  backend = "s3"

  config = {
    bucket = "${var.namespace}-${var.stage}-terraform-state"
    key    = "chamber/terraform.tfstate"
  }
}

locals {
  convert_lambda_file = "placeholder.js"
  sns_topic_arn = data.terraform_remote_state.tf-github-webhooks.outputs.sns_topic_arn
  chamber_kms_key_arn = data.terraform_remote_state.chamber.outputs.chamber_kms_key_alias_arn
}

data "archive_file" "tf_codbuild_trigger_file" {
  type        = "zip"
  source_file = "${path.module}/${local.convert_lambda_file}"
  output_path = "${path.module}/${local.convert_lambda_file}.zip"
}

# lambda function that proceses incoming webhooks from github, verifies signature
# and publishes to sns
resource "aws_lambda_function" "trigger" {
  function_name = var.name
  description   = "trigger codebuild for github releases"
  role          = aws_iam_role.trigger.arn
  handler       = "index.handler"
  memory_size   = var.memory_size
  timeout       = var.timeout
  runtime       = "nodejs12.x"
  filename      = data.archive_file.tf_codbuild_trigger_file.output_path

  environment {
    variables = {
      "CONFIG_PARAMETER_NAMES" = join(
        ",",
        compact([module.cicd_tf_codebuild_trigger_config_label.id, var.additional_parameter_names]),
      )
      "DEBUG"    = var.debug
      "NODE_ENV" = var.node_env
    }
  }
}

module "cicd_tf_codebuild_trigger_config_label" {
  source     = "git::https://github.com/betterworks/terraform-null-label.git?ref=tags/0.12.0"
  namespace  = var.namespace
  stage      = var.stage
  name       = "cicd"
  attributes = ["proxy", "tf_codebuild_trigger_config"]
  delimiter  = "/"
  regex_replace_chars = "/[^a-zA-Z0-9-/_]/"
}

# define terraform managed configuration
resource "aws_ssm_parameter" "configuration" {
  name      = "/${var.namespace}/${var.stage}/cicd/proxy/tf_codebuild_trigger_config"
  type      = "SecureString"
  key_id    = local.chamber_kms_key_arn
  value     = data.template_file.configuration.rendered
  overwrite = true
}

data "template_file" "configuration" {
  template = file("${path.module}/configuration.json")

  vars = {
    sns_topic_arn = local.sns_topic_arn
  }
}

# subscribe lambda function to gibhub webhook sns topic
resource "aws_sns_topic_subscription" "lambda" {
  topic_arn = local.sns_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.trigger.arn
}

# allow sns to invoke trigger function
resource "aws_lambda_permission" "trigger" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.trigger.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = local.sns_topic_arn
}

# include cloudwatch log group resource definition in order to ensure it is
# removed with function removal
resource "aws_cloudwatch_log_group" "trigger" {
  name = "/aws/lambda/${var.name}"
}

module "cicd_lambda_role_label" {
  source              = "git::https://github.com/betterworks/terraform-null-label.git?ref=tags/0.12.0"
  namespace           = var.namespace
  stage               = var.stage
  name                = "lambda"
  attributes          = ["role", "tf-codebuild-trigger"]
}

resource "aws_iam_role" "trigger" {
  name               = module.cicd_lambda_role_label.id
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    effect  = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_policy" "trigger" {
  name   = "${module.cicd_lambda_role_label.id}-trigger-policy"
  policy = data.aws_iam_policy_document.trigger.json
}

data "aws_iam_policy_document" "trigger" {
  statement {
    actions = [
      "codebuild:StartBuild",
      "codebuild:StopBuild",
      "codebuild:BatchGetProjects",
    ]

    effect    = "Allow"
    resources = ["*"]
  }

  statement {
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    effect = "Allow"

    resources = formatlist(
      "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter%s",
      split(
        ",",
        "${aws_ssm_parameter.configuration.name},${var.additional_parameter_names}",
      ),
    )
  }

  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    effect    = "Allow"
    resources = ["*"]
  }
}

resource "aws_iam_policy_attachment" "trigger" {
  name       = "${module.cicd_lambda_role_label.id}-policy-attachment"
  roles      = [aws_iam_role.trigger.name]
  policy_arn = aws_iam_policy.trigger.arn
}

