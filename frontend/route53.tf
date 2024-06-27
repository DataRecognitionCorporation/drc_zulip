resource "aws_route53_record" "zulip_ec2" {
  zone_id = local.cloud_shared_hosted_zone[var.environment]
  name    = "chat-${var.environment}-ec2"
  type    = "A"
  ttl     = 60
  records = ["127.0.0.1"]
}

