data "template_file" "iam_zulip" {
  template = file("./iam/iam_ec2_policy.json.tpl")

  vars = {
    region      = var.region
    environment = var.environment
    account_num = local.account_num
  }
}

resource "aws_iam_policy" "iam_zulip" {
  name        = "Iamauto-zulip-ec2-${var.region}"
  description = "Iam policy used by the zulip ec2 instance. Managed via terraform."
  policy      = data.template_file.iam_zulip.rendered
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
  name               = "Iamauto-zulip-ec2-role-${var.region}"
  assume_role_policy = data.aws_iam_policy_document.assume_role.json
  depends_on         = [data.aws_iam_policy_document.assume_role]
}

resource "aws_iam_policy_attachment" "ec2_allow_attach" {
  name       = "ec2-allow-attachment"
  roles      = [aws_iam_role.zulip_role.name]
  policy_arn = aws_iam_policy.iam_zulip.arn
  depends_on = [aws_iam_role.zulip_role, aws_iam_policy.iam_zulip, aws_lb.zulip_alb]
}

resource "aws_iam_instance_profile" "zulip_instance_profile" {
  name = aws_iam_role.zulip_role.name
  role = aws_iam_role.zulip_role.name
}