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
    prod = "911870898277"
    dev  = "333509430799"
  }

  key_name = "ct-cloud"

  instance_type = {
    dev  = "t4g.xlarge"
    prod = "c7g.xlarge"
  }

  ami_owner                 = "099720109477"
  ami_name                  = "ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-*-server-*"
  architecture              = "arm64"
  health_check_grace_period = 3600

  db_url = {
    "dev"  = "zulip-dev-db.cloud-shared-le.drcedirect.com"
    "prod" = "zulip-prod-db.cloud-shared.drcedirect.com"
  }

  email_host = {
    "dev"  = "email-smtp.us-east-1.amazonaws.com"
    "prod" = "email-smtp.us-east-1.amazonaws.com"
  }

  email_host_user = {
    "dev"  = "AKIAVTWF67E4IMYWLDU6"
    "prod" = "AKIAVTWF67E4IMYWLDU6"
  }

  artifactory_download_url = "https://artifactory.datarecognitioncorp.com/artifactory/downloads/zulip"

  zulip_version = {
    "dev"  = "6.1.22"
    "prod" = "6.1.22"
  }

  db_password_secret_arn = {
    "dev"  = "arn:aws:secretsmanager:us-east-2:333509430799:secret:rds!cluster-abad67f7-99de-4cc4-8a44-d6a9101c878c-CwbtEY"
    "prod" = "arn:aws:secretsmanager:us-east-2:911870898277:secret:rds!cluster-766a3db3-1732-47e7-8bf2-07f9ea2ffb02-wZf7JE"
  }

  cortex_dist_id_arn = {
    "dev"  = "arn:aws:secretsmanager:us-east-2:333509430799:secret:cortex_distribution_id-4CVBCQ"
    "prod" = "arn:aws:secretsmanager:us-east-2:911870898277:secret:cortex_distribution_id-uiPCDv"
  }

  loadbalancer_ip_range = {
    "dev"  = "10.240.0.0/16"
    "prod" = "10.240.0.0/16"
  }

  cloud_shared_hosted_zone = {
    "dev"  = "Z06089421NYRAM30RG82O"
    "prod" = "Z0789037PPB5S0IXWFAS"
  }

  ec2_domain = {
    "dev"  = "cloud-shared-le.drcedirect.com"
    "prod" = "cloud-shared.drcedirect.com"
  }

  private_subnet_ids = lookup(local.private_subnet_ids_map[var.account_num], var.region)
  private_subnet_ids_map = {
    # shared-le
    "333509430799" = {
      "us-east-2" = ["subnet-01dca7bd869008264", "subnet-000185e571a735758", "subnet-0d6b37ca7a13731a6"]
    }
    # shared prod
    "911870898277" = {
      "us-east-2" = ["subnet-07e6929bcd34188d9", "subnet-0c4abed21d1597a13", "subnet-094c04752ebbe9788"]
    }
  }

  public_subnet_ids = lookup(local.public_subnet_ids_map[var.account_num], var.region)
  public_subnet_ids_map = {
    # shared-le
    "333509430799" = {
      "us-east-2" = ["subnet-0fe61f88e54395497", "subnet-04c2b1278eef93263", "subnet-03fb23405ad7d305f"]
    }
    # shared prod
    "911870898277" = {
      "us-east-2" = ["subnet-0da880b4d00ea7726", "subnet-019ae8ab09afca878", "subnet-02fd0b1e8de7beea3"]
    }
  }

  vpc_id = lookup(local.vpc_id_map[var.account_num], var.region)
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

  alb_internal = lookup(local.alb_internal_map, var.environment)
  alb_internal_map = {
    prod = false
    dev  = true
  }

  tornado_processes = {
    dev  = 2
    prod = 12
  }

  uwsgi_processes = {
    dev  = 6
    prod = 12
  }

  jitsi_server_url = {
    prod = "zulip-jitsi.awcl.drcedirect.com"
    dev  = "zulip-jitsi-dev.awcl.drcedirect-le.com"
  }

  s3_avatar_bucket = {
    dev  = "us-east-2-zulip-avatars-dev-333509430799"
    prod = "us-east-2-zulip-avatars-prod-911870898277"
  }

  s3_uploads_bucket = {
    dev  = "us-east-2-zulip-uploads-dev-333509430799"
    prod = "us-east-2-zulip-uploads-prod-911870898277"
  }

  login_url = {
    prod = "https://www.drcedirect.com/all/eca-portal-v2-ui/#/login/DRCPORTAL"
    dev  = "https://www.drcedirect.com/all/eca-portal-v2-ui/#/login/DRCPORTAL"
  }

  zulip_secrets_arn = {
    prod = "arn:aws:secretsmanager:us-east-2:911870898277:secret:prod/zulip-9u4Pgf"
    dev  = "arn:aws:secretsmanager:us-east-2:333509430799:secret:dev/zulip-OoH4Ii"
  }

  alb_subnet = lookup(local.alb_subnet_map, var.environment)
  alb_subnet_map = {
    prod = local.public_subnet_ids
    dev  = local.private_subnet_ids
  }

  certificate = lookup(local.certificate_map[var.account_num], var.region)
  certificate_map = {
    # shared-le
    # "us-east-2" = "arn:aws:acm:us-east-2:333509430799:certificate/e336ef09-d9d7-4143-b9da-103bd90531ac"
    "333509430799" = {
      "us-east-2" = "arn:aws:acm:us-east-2:333509430799:certificate/478726f2-0da5-476d-86cf-87cc49a8e809"
    }
    # shared prod
    "911870898277" = {
      "us-east-2" = "arn:aws:acm:us-east-2:911870898277:certificate/86fac099-761f-45c3-a491-27a42ac71b60"
    }
  }
}
