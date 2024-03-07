# resource "aws_s3_bucket_object" "s3-logging-prefix" {
#   provider = aws.us-east-2
#   bucket   = "${var.region}-drc-s3-${lookup(var.s3-logging-bucket, var.environment)}"
#   key      = "us-east-2-${var.bucket_name_private}-${var.environment}"
#   source   = "/dev/null"
# }

resource "aws_s3_bucket" "zulip_private" {
  bucket = "${var.region}-zulip-private-${var.environment}-${local.account_num}"
  acl    = "private"
  #   tags   = local.global_tags

  #   cors_rule {
  #     allowed_headers = [
  #       "*"
  #     ]
  #     allowed_methods = [
  #       "PUT",
  #       "POST",
  #       "GET",
  #       "HEAD"
  #     ]
  #     allowed_origins = [
  #       "*"
  #     ]
  #     max_age_seconds = 0
  #   }

  #   logging {
  #     target_bucket = "us-east-2-drc-s3-${lookup(var.s3-logging-bucket, var.environment)}"
  #     target_prefix = "${var.bucket_name_private}-${var.environment}"
  #   }

  #   policy = <<POLICY
  # {
  #     "Version": "2012-10-17",
  #     "Id": "Policy1468991802320",
  #     "Statement": [
  #         {
  #             "Sid": "Stmt1468991795370",
  #             "Effect": "Allow",
  #             "Principal": {
  #                 "AWS": "ARN_PRINCIPAL_HERE"
  #             },
  #             "Action": [
  #                 "s3:GetObject",
  #                 "s3:DeleteObject",
  #                 "s3:PutObject"
  #             ],
  #             "Resource": "arn:aws:s3:::BUCKET_NAME_HERE/*"
  #         },
  #         {
  #             "Sid": "Stmt1468991795371",
  #             "Effect": "Allow",
  #             "Principal": {
  #                 "AWS": "ARN_PRINCIPAL_HERE"
  #             },
  #             "Action": "s3:ListBucket",
  #             "Resource": "arn:aws:s3:::BUCKET_NAME_HERE"
  #         }
  #     ]
  # }
  # POLICY

}

# resource "aws_s3_bucket" "zulip_public" {
#   bucket = "${var.region}-zulip-public-${var.environment}-${local.account_num}"
#   acl    = "public-read"

#   #   cors_rule {
#   #     allowed_headers = [
#   #       "*"
#   #     ]
#   #     allowed_methods = [
#   #       "GET",
#   #       "HEAD"
#   #     ]
#   #     allowed_origins = [
#   #       "*"
#   #     ]
#   #     max_age_seconds = 0
#   #   }

#   #   logging {
#   #     target_bucket = "us-east-2-drc-s3-${lookup(var.s3-logging-bucket, var.environment)}"
#   #     target_prefix = "${var.bucket_name_public}-${var.environment}"
#   #   }

#   #   versioning {
#   #     enabled = true
#   #   }

#   policy = <<POLICY
# {
#     "Version": "2012-10-17",
#     "Statement": [
#         {
#             "Effect": "Allow",
#             "Principal": {
#                 "AWS": "${local.zulip_server_iam}"
#             },
#             "Action": [
#                 "s3:GetObject",
#                 "s3:DeleteObject",
#                 "s3:PutObject"
#             ],
#             "Resource": "arn:aws:s3:::${var.region}-zulip-private-${var.environment}-${local.account_num}/*"
#         },
#         {
#             "Effect": "Allow",
#             "Principal": {
#                 "AWS": "${local.zulip_server_iam}"
#             },
#             "Action": "s3:ListBucket",
#             "Resource": "arn:aws:s3:::${var.region}-zulip-private-${var.environment}-${local.account_num}"
#         },
#         {
#             "Effect": "Allow",
#             "Principal": {
#                 "AWS": "*"
#             },
#             "Action": "s3:GetObject",
#             "Resource": "arn:aws:s3:::${var.region}-zulip-private-${var.environment}-${local.account_num}/*"
#         }
#     ]
# }
# POLICY

# }
