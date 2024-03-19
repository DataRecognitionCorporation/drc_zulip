resource "aws_lb_target_group" "zulip" {
  name        = "zulip-${var.environment}"
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = local.vpc_id

  health_check {
    protocol = "HTTP"
    path     = "/login"
    matcher  = "301"
  }
}
