# resource "aws_s3_bucket_object" "s3-logging-prefix" {
#   provider = aws.us-east-2
#   bucket   = "${var.region}-drc-s3-${lookup(var.s3-logging-bucket, var.environment)}"
#   key      = "us-east-2-${var.bucket_name_private}-${var.environment}"
#   source   = "/dev/null"
# }

resource "aws_s3_bucket" "zulip_uploads" {
  bucket = "${var.region}-zulip-uploads-${var.environment}-${local.account_num}"
  tags   = local.global_tags
}

resource "aws_s3_bucket_lifecycle_configuration" "s3_lifecylce_uploads" {
  bucket = aws_s3_bucket.zulip_uploads.id

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

resource "aws_s3_bucket_versioning" "zulip_uploads_versioning" {
  bucket = aws_s3_bucket.zulip_uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}





resource "aws_s3_bucket" "zulip_avatar" {
  bucket = "${var.region}-zulip-avatars-${var.environment}-${local.account_num}"
  tags   = local.global_tags
}


resource "aws_s3_bucket_lifecycle_configuration" "s3_lifecylce_avatar" {
  bucket = aws_s3_bucket.zulip_avatar.id

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

resource "aws_s3_bucket_versioning" "zulip_avatar_versioning" {
  bucket = aws_s3_bucket.zulip_avatar.id
  versioning_configuration {
    status = "Enabled"
  }
}



resource "aws_s3_bucket_policy" "zulip_avatar_policy" {
  count  = local.public_s3[var.environment]
  bucket = aws_s3_bucket.zulip_avatar.id
  policy = data.aws_iam_policy_document.zulip_avatar_policy.json
  depends_on = [
    aws_s3_bucket_ownership_controls.zulip_avatar,
    aws_s3_bucket_public_access_block.bucket-access-block
  ]
}

data "aws_iam_policy_document" "zulip_avatar_policy" {
  statement {
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }

    actions = [
      "s3:GetObject"
    ]

    resources = [
      "${aws_s3_bucket.zulip_avatar.arn}/*"
    ]
  }
}
resource "aws_s3_bucket_ownership_controls" "zulip_avatar" {
  count  = local.public_s3[var.environment]
  bucket = aws_s3_bucket.zulip_avatar.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "zulip_avatar" {
  count = local.public_s3[var.environment]
  depends_on = [
    aws_s3_bucket_ownership_controls.zulip_avatar,
    aws_s3_bucket_policy.zulip_avatar_policy
  ]

  bucket = aws_s3_bucket.zulip_avatar.id
  acl    = "public-read"
}

resource "aws_s3_bucket_public_access_block" "bucket-access-block" {
  count  = local.public_s3[var.environment]
  bucket = aws_s3_bucket.zulip_avatar.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

