resource "aws_route53_record" "zulip-rds" {
  zone_id = local.hosted_zone_id[var.environment]
  name    = "zulip-${var.environment}-db"
  type    = "CNAME"
  ttl     = 300
  records = [aws_rds_cluster.db.endpoint]
}
