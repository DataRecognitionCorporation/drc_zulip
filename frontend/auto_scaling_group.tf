resource "aws_autoscaling_group" "asg_config" {
  name                      = "zulip-${var.environment}"
  max_size                  = "1"
  min_size                  = "0"
  desired_capacity          = "1"
  target_group_arns         = [aws_lb_target_group.zulip.arn, aws_lb_target_group.zulip_smtp.arn]
  vpc_zone_identifier       = local.private_subnet_ids
  health_check_type         = "EC2"
  health_check_grace_period = local.health_check_grace_period

  termination_policies = ["Default"]
  enabled_metrics = [
    "GroupMinSize", "GroupMaxSize", "GroupDesiredCapacity", "GroupInServiceInstances",
    "GroupPendingInstances", "GroupStandbyInstances", "GroupTerminatingInstances", "GroupTotalInstances"
  ]

  launch_template {
    id      = aws_launch_template.zulip.id
    version = "$Latest"
  }

  lifecycle {
    create_before_destroy = true
  }

}

