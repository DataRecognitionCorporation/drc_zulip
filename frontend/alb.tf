resource "aws_lb" "zulip_alb" {
  load_balancer_type = "application"
  name               = "zulip-${var.environment}"
  internal           = local.alb_internal
  security_groups    = [aws_security_group.zulip_alb.id]
  subnets            = local.alb_subnet

  access_logs {
    bucket  = "us-east-2-drc-centralized-logs"
    enabled = true
    prefix  = "alb"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.zulip_alb.arn
  protocol          = "HTTPS"
  port              = "443"
  certificate_arn   = local.certificate
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    target_group_arn = aws_lb_target_group.zulip.arn
    type             = "forward"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.zulip_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    target_group_arn = aws_lb_target_group.zulip.arn
    type             = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

data "aws_wafv2_web_acl" "waf" {
  name  = "cloud-regional-zulip"
  scope = "REGIONAL"
}

resource "aws_wafv2_web_acl_association" "example" {
  resource_arn = aws_lb.zulip_alb.arn
  web_acl_arn  = data.aws_wafv2_web_acl.waf.arn
}
