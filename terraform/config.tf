terraform {
  backend "s3" {}
}

provider "aws" {
  assume_role {
    role_arn = var.aws_assume_role_arn
  }
}

data "aws_caller_identity" "current" {
}

