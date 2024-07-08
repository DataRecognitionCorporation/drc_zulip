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

  metadata_options {
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 1
    http_tokens                 = "required"
    instance_metadata_tags      = "enabled"
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
    tags = merge(local.global_tags, {
      Name = "zulip-${var.environment}"
      }
    )
  }
}

locals {
  aws_instance_user_data = templatefile("scripts/bootstrap.sh", {
    environment        = var.environment
    db_url             = local.db_url[var.environment]
    email_host         = local.email_host[var.environment]
    email_host_user    = local.email_host_user[var.environment]
    download_url       = local.artifactory_download_url
    zulip_version      = local.zulip_version[var.environment]
    db_password_arn    = local.db_password_secret_arn[var.environment]
    lb_ip_range        = local.loadbalancer_ip_range[var.environment]
    hosted_zone_id     = local.cloud_shared_hosted_zone[var.environment]
    domain             = local.ec2_domain[var.environment]
    cortex_dist_id_arn = local.cortex_dist_id_arn[var.environment]
    jitsi_server_url   = local.jitsi_server_url[var.environment]
    login_url          = local.login_url[var.environment]
    s3_avatar_bucket   = local.s3_avatar_bucket[var.environment]
    s3_uploads_bucket  = local.s3_uploads_bucket[var.environment]
    zulip_secrets_arn  = local.zulip_secrets_arn[var.environment]
    tornado_processes  = local.tornado_processes[var.environment]
    uwsgi_processes    = local.uwsgi_processes[var.environment]
  })
}
