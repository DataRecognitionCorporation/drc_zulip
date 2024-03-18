/*
resource "aws_route53_record" "zulip-private-alb" {
  zone_id = local.private_hosted_zone_id[var.environment]
  name    = "chat-${var.environment}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.zulip_alb.dns_name]
}


resource "aws_route53_record" "zulip-public-alb" {
  zone_id = local.public_hosted_zone_id[var.environment]
  name    = "chat-${var.environment}"
  type    = "CNAME"
  ttl     = 300
  records = [aws_lb.zulip_alb.dns_name]
}
*/
