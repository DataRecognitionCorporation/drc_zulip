terraform {
  backend "s3" {}
}
provider "aws" {
  default_tags {
    tags = local.global_tags
  }
}