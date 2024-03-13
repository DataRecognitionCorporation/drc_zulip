resource "aws_launch_template" "zulip" {
  name                   = "zulip-${var.environment}"
  image_id               = data.aws_ami.ami.id
  instance_type          = local.instance_type[var.environment]
  key_name               = local.key_name
  vpc_security_group_ids = [aws_security_group.zulip_instance.id]
  user_data              = base64encode(local.aws_instance_user_data)
  ebs_optimized          = "false"
  update_default_version = true

  iam_instance_profile {
    name = aws_iam_instance_profile.zulip_instance_profile.name
  }

  monitoring {
    enabled = true
  }

  block_device_mappings {
    device_name = data.aws_ami.ami.root_device_name
    ebs {
      delete_on_termination = true
      volume_size           = 30
      volume_type           = "gp3"
    }
  }

  tags = {
    auto-update     = false
    backup_schedule = "daily"
  }

  tag_specifications {
    resource_type = "instance"
    tags          = local.global_tags
  }
}

locals {
  aws_instance_user_data = templatefile("scripts/bootstrap.sh", {
    environment = var.environment
  })
}
