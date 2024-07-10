data "template_file" "iam_zulip" {
  template = file("./iam/iam_ec2_policy.json.tpl")

  vars = {
    region                 = var.region
    environment            = var.environment
    account_num            = local.account_num
    domain                 = local.ec2_domain[var.environment]
    hosted_zone_id         = local.cloud_shared_hosted_zone[var.environment]
    db_password_secret_arn = local.db_password_secret_arn[var.environment]
    cortex_dist_id_arn     = local.cortex_dist_id_arn[var.environment]
    zulip_secrets_arn      = local.zulip_secrets_arn[var.environment]
    dynatrace_paas_arn     = local.dynatrace_paas_arn[var.environment]
  }
}

resource "aws_iam_role_policy" "iam_zulip" {
  name   = "Iamauto-zulip-ec2-${var.region}"
  role   = aws_iam_role.zulip_role.id
  policy = data.template_file.iam_zulip.rendered
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "zulip_role" {
  name                 = "Iamauto-zulip-ec2-role-${var.region}"
  assume_role_policy   = data.aws_iam_policy_document.assume_role.json
  permissions_boundary = data.aws_iam_policy.boundary.arn
  depends_on           = [data.aws_iam_policy_document.assume_role]
}

/*
resource "aws_iam_policy_attachment" "ec2_allow_attach" {
  name       = "ec2-allow-attachment"
  roles      = [aws_iam_role.zulip_role.name]
  policy_arn = aws_iam_policy.iam_zulip.arn
  depends_on = [aws_iam_role.zulip_role, aws_iam_policy.iam_zulip, aws_lb.zulip_alb]
}
*/

resource "aws_iam_instance_profile" "zulip_instance_profile" {
  name = "Iamauto-zulip-ec2-profile-${var.environment}"
  role = aws_iam_role.zulip_role.name
}

data "aws_iam_policy" "boundary" {
  name = "boundary-applications"
}
