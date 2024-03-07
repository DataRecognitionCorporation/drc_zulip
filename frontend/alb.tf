resource "aws_lb" "zulip_alb" {
  load_balancer_type = "application"
  name               = "zulip-${var.environment}"
  internal           = local.alb_internal
  security_groups    = [aws_security_group.zulip_alb.id]
  subnets            = local.alb_subnet
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.zulip_alb.arn
  protocol          = "HTTPS"
  port              = "443"
  certificate_arn   = local.certificate
  #  ssl_policy        = "ELBSecurityPolicy-2016-08"

  default_action {
    target_group_arn = aws_lb_target_group.zulip_alb_tg.arn
    type             = "forward"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.zulip_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_target_group" "zulip_alb_tg" {
  name        = "zulip-${var.environment}-tg"
  port        = 80
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = local.vpc_id

  health_check {
    protocol            = "HTTP"
    port                = "traffic-port"
    path                = "/accounts/login/"
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
  }
}
