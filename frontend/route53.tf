resource "aws_route53_record" "zulip_ec2" {
  zone_id = local.cloud_shared_hosted_zone[var.environment]
  name    = "chat-${var.environment}-ec2"
  type    = "A"
  ttl     = 60
  records = ["127.0.0.1"]
}


resource "aws_route53_record" "zulip_nlb" {
  #zone_id = local.cloud_shared_hosted_zone[var.environment]
  zone_id = local.public_smtp_hosted_zone[var.environment]
  name    = "chat-${var.environment}-nlb"
  type    = "MX"
  ttl     = 300
  records = ["10 ${aws_lb.nlb.dns_name}"]
}

resource "aws_route53_record" "zulip_nlb_private" {
  zone_id = local.private_smtp_hosted_zone[var.environment]
  name    = "chat-${var.environment}-nlb"
  type    = "MX"
  ttl     = 300
  records = ["10 ${aws_lb.nlb.dns_name}"]
}
