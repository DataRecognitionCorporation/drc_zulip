resource "aws_lb_target_group" "zulip" {
  name        = "zulip-${var.environment}"
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = local.vpc_id

  health_check {
    protocol = "HTTP"
    path     = "/login/"
    matcher  = "200"
  }
}

resource "aws_lb_target_group" "zulip_smtp" {
  name        = "zulip-${var.environment}-smtp"
  port        = 25
  protocol    = "TCP"
  target_type = "instance"
  vpc_id      = local.vpc_id

  health_check {
    protocol = "TCP"
    port     = "22"
  }
}

