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

  hosted_zone_id = {
    "dev"  = "Z06089421NYRAM30RG82O"
    "prod" = "Z0789037PPB5S0IXWFAS"
  }

  engine_version = local.engine_version_map[var.environment]
  engine_version_map = {
    prod = "14.9"
    dev  = "14.9"
  }

  db_instance = {
    prod = "db.t4g.large"
    dev  = "db.t4g.medium"
  }

  public_s3 = {
    "dev"  = 0
    "prod" = 1
  }

  backup_retention_period = local.backup_retention_period_map[var.environment]
  backup_retention_period_map = {
    prod = "14"
    dev  = "7"
  }

  account_num = local.account_num_map[var.environment]
  account_num_map = {
    prod = "911870898277"
    dev  = "333509430799"
  }

  private_subnet_ids = local.private_subnet_ids_map[var.account_num][var.region]
  private_subnet_ids_map = {
    # shared-le
    "333509430799" = {
      "us-east-2" = ["subnet-01dca7bd869008264", "subnet-000185e571a735758", "subnet-0d6b37ca7a13731a6"]
    }
    # shared prod
    "911870898277" = {
      "us-east-2" = ["subnet-0221d1b468e4d950c", "subnet-0c4abed21d1597a13", "subnet-094c04752ebbe9788"]
    }
  }

  vpc_id = local.vpc_id_map[var.account_num][var.region]
  vpc_id_map = {
    # shared le
    "333509430799" = {
      "us-east-1" = ""
      "us-east-2" = "vpc-026c91c0198388bda"
    }
    "911870898277" = {
      "us-east-2" = "vpc-0da8e5c9a6bc30fc4"
    }
  }
}
