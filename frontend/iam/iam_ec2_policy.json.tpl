{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "s3private",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${region}-zulip-private-${environment}-${account_num}",
        "arn:aws:s3:::${region}-zulip-private-${environment}-${account_num}/*"
      ]
    },
    {
      "Sid": "s3public",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::${region}-zulip-public-${environment}-${account_num}",
        "arn:aws:s3:::${region}-zulip-public-${environment}-${account_num}/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "ses:SendRawEmail",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "ec2:DescribeVolumes",
        "ec2:DescribeTags",
        "ec2:CreateTags",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams",
        "logs:DescribeLogGroups",
        "logs:CreateLogStream",
        "logs:CreateLogGroup"
      ],
      "Resource": "*"
    }
  ]
}
