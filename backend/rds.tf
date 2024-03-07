resource "aws_rds_cluster" "db" {
  cluster_identifier           = "zulip-${var.environment}"
  engine                       = "aurora-postgresql"
  engine_mode                  = "provisioned"
  engine_version               = local.engine_version
  database_name                = "zulip"
  master_username              = "zulip"
  manage_master_user_password  = true
  backup_retention_period      = local.backup_retention_period
  db_subnet_group_name         = aws_db_subnet_group.zulip.name
  preferred_backup_window      = "07:00-08:00"         # time in UTC
  preferred_maintenance_window = "sun:08:30-sun:09:30" # time in UTC
  vpc_security_group_ids       = [aws_security_group.zulip_db.id]
  skip_final_snapshot          = true

  serverlessv2_scaling_configuration {
    max_capacity = 4.0
    min_capacity = 0.5
  }
}

resource "aws_rds_cluster_instance" "serverless" {
  # identifier         = "zulip-${var.environment}-instnace"  
  cluster_identifier = aws_rds_cluster.db.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.db.engine
  engine_version     = aws_rds_cluster.db.engine_version
}

resource "aws_db_subnet_group" "zulip" {
  name       = "zulip_subnet_group"
  subnet_ids = local.private_subnet_ids
}
