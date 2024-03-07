variable "region" {
  type        = string
  description = "Region, This value is used to set the region that the infrastructure is built in."
}

variable "environment" {
  type        = string
  description = "Environment, the name of the environment the cluster is intended for"
}

variable "account_num" {
  type        = string
  description = "Account number that this application will be deployed to."
}

locals {
  global_tags = {
    environment = var.environment
    team        = "team-ss"
    appid       = "bd08d"
  }
  engine_version = lookup(local.engine_version_map, var.environment)
  engine_version_map = {
    prod = "14.3"
    dev  = "14.3"
  }

  backup_retention_period = lookup(local.backup_retention_period_map, var.environment)
  backup_retention_period_map = {
    prod = "14"
    dev  = "7"
  }

  account_num = lookup(local.account_num_map, var.environment)
  account_num_map = {
    prod = ""
    dev  = "333509430799"
  }

  private_subnet_ids = lookup(local.private_subnet_ids_map[var.account_num], var.region)
  private_subnet_ids_map = {
    # shared-le
    "333509430799" = {
      "us-east-1" = []
      "us-east-2" = ["subnet-01dca7bd869008264", "subnet-000185e571a735758", "subnet-0d6b37ca7a13731a6"]
    }
    # shared prod
    "911870898277" = {
      "us-east-1" = []
      "us-east-2" = []
    }
  }

  vpc_id = lookup(local.vpc_id_map[var.account_num], var.region)
  vpc_id_map = {
    # shared le
    "333509430799" = {
      "us-east-1" = ""
      "us-east-2" = "vpc-026c91c0198388bda"
    }
  }

  zulip_server_iam = ""
}