variable "additional_parameter_names" {
  type        = string
  description = "comma separated list of ssm parameter names"
  default     = ""
}

variable "debug" {
  type        = string
  description = "node debug flag"
  default     = ""
}

variable "memory_size" {
  type        = string
  description = "lambda function memory limit"
  default     = 128
}

variable "name" {
  type        = string
  description = "stack name"
}

variable "node_env" {
  type        = string
  description = "node environment"
  default     = "production"
}

variable "region" {
  type        = string
  description = "aws region"
}

variable "timeout" {
  type        = string
  description = "lambda function timeout"
  default     = 10
}

variable "aws_assume_role_arn" {}

variable "namespace" {
  type        = string
  description = "Namespace (e.g. `cp` or `cloudposse`)"
}

variable "stage" {
  type        = string
  description = "Stage (e.g. `prod`, `dev`, `staging`)"
}

variable "log_level" {
  type        = string
  description = "log verbosity"
  default     = "info"
}