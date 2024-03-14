# resource "aws_s3_bucket_object" "s3-logging-prefix" {
#   provider = aws.us-east-2
#   bucket   = "${var.region}-drc-s3-${lookup(var.s3-logging-bucket, var.environment)}"
#   key      = "us-east-2-${var.bucket_name_private}-${var.environment}"
#   source   = "/dev/null"
# }

resource "aws_s3_bucket" "zulip_private" {
  bucket = "${var.region}-zulip-private-${var.environment}-${local.account_num}"
  tags   = local.global_tags
}

resource "aws_s3_bucket_lifecycle_configuration" "s3_lifecylce_private" {
  bucket = aws_s3_bucket.zulip_private.id

  rule {
    id     = "Delete old incomplete multi-part uploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "auto-delete-noncurrent-versions-after-90-days"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_versioning" "zulip_private_versioning" {
  bucket = aws_s3_bucket.zulip_private.id
  versioning_configuration {
    status = "Enabled"
  }
}





resource "aws_s3_bucket" "zulip_public" {
  bucket = "${var.region}-zulip-public-${var.environment}-${local.account_num}"
  tags   = local.global_tags
}


resource "aws_s3_bucket_lifecycle_configuration" "s3_lifecylce_public" {
  bucket = aws_s3_bucket.zulip_public.id

  rule {
    id     = "Delete old incomplete multi-part uploads"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "auto-delete-noncurrent-versions-after-90-days"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_versioning" "zulip_public_versioning" {
  bucket = aws_s3_bucket.zulip_public.id
  versioning_configuration {
    status = "Enabled"
  }
}


resource "aws_s3_bucket_policy" "zulip_public_policy" {
  bucket = aws_s3_bucket.zulip_public.id
  policy = data.aws_iam_policy_document.zulip_public_policy.json
}

data "aws_iam_policy_document" "zulip_public_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "s3:GetObject",
    ]

    resources = [
      aws_s3_bucket.zulip_public.arn,
    ]
  }
}
resource "aws_s3_bucket_ownership_controls" "zulip_public" {
  bucket = aws_s3_bucket.zulip_public.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "zulip_public" {
  depends_on = [aws_s3_bucket_ownership_controls.zulip_public]

  bucket = aws_s3_bucket.zulip_public.id
  acl    = "public-read"
}

