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

  account_num = lookup(local.account_num_map, var.environment)
  account_num_map = {
    prod = ""
    dev  = "333509430799"
  }

  key_name = "ct-cloud"

  instance_type = {
    dev  = "t4g.large"
    prod = "c7g.xlarge"
  }

  ami_owner                 = "099720109477"
  ami_name                  = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-*-server-*"
  architecture              = "arm64"
  health_check_grace_period = 420


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

  public_subnet_ids = lookup(local.public_subnet_ids_map[var.account_num], var.region)
  public_subnet_ids_map = {
    # shared-le
    "333509430799" = {
      "us-east-1" = []
      "us-east-2" = ["subnet-0fe61f88e54395497", "subnet-04c2b1278eef93263", "subnet-03fb23405ad7d305f"]
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

  alb_internal = lookup(local.alb_internal_map, var.environment)
  alb_internal_map = {
    prod = false
    dev  = true
  }

  alb_subnet = lookup(local.alb_subnet_map, var.environment)
  alb_subnet_map = {
    prod = local.public_subnet_ids
    dev  = local.private_subnet_ids
  }

  certificate = lookup(local.certificate_map[var.account_num], var.region)
  certificate_map = {
    # shared-le
    "333509430799" = {
      "us-east-1" = []
      "us-east-2" = ""
    }
    # shared prod
    "911870898277" = {
      "us-east-1" = []
      "us-east-2" = []
    }
  }
}
