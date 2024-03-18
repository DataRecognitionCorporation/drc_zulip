#!/bin/bash -ex

environment=$${environment}
download_url="https://artifactory.datarecognitioncorp.com/artifactory/downloads/zulip"
zulip_version="6.1.22"
package="zulip-server-$${zulip_version}.tar.gz"
zulip_conf="/etc/zulip/zulip.conf"
zulip_secrets="/etc/zulip/zulip-secrets.conf"
zulip_settings="/etc/zulip/settings.py"

zulip_db_url="zulip-dev-db.cloud-shared-le.drcedirect.com"
email_host="email-smtp.us-east-1.amazonaws.com"
email_host_user="AKIAVTWF67E4IMYWLDU6"

dp_password_arn='arn:aws:secretsmanager:us-east-2:333509430799:secret:rds!cluster-abad67f7-99de-4cc4-8a44-d6a9101c878c-CwbtEY'
hostnamectl hostname chat-dev.datarecognitioncorp.com
apt-get update
apt-get upgrade -y
apt install -y unzip jq 

curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

db_password=$(aws secretsmanager get-secret-value --secret-id $dp_password_arn | jq -r '.SecretString | fromjson | .password')

wget $${download_url}/$${package}

tar -xf "zulip-server-$${zulip_version}.tar.gz"


./zulip-server-*/scripts/setup/install --self-signed-cert \
    --email="atormanen@datarecognitioncorp.com" --hostname="chat-dev.datarecognitioncorp.com" --no-init-db


sed -i "s|#.*EMAIL_HOST = .*|EMAIL_HOST = '$email_host'|" $zulip_settings
sed -i "s|#.*EMAIL_HOST_USER = .*|EMAIL_HOST_USER = '$email_host_user'|" $zulip_settings
sed -i "s|#.*EMAIL_USE_TLS = .*|EMAIL_USE_TLS = True|" $zulip_settings
sed -i "s|#.*EMAIL_PORT = .*|EMAIL_PORT = 587|" $zulip_settings

sed -i "s|#.*S3_AUTH_UPLOADS_BUCKET = .*|S3_AUTH_UPLOADS_BUCKET = 'us-east-2-zulip-private-dev-333509430799'|" $zulip_settings
sed -i "s|#.*S3_AVATAR_BUCKET = .*|S3_AVATAR_BUCKET = 'us-east-2-zulip-public-dev-333509430799'|" $zulip_settings
sed -i "s|#.*S3_REGION = .*|S3_RGION = 'us-east-2'|" $zulip_settings

sed -i "s|#.*REMOTE_POSTGRES_HOST = .*|REMOTE_POSTGRES_HOST = '$zulip_db_url'|" $zulip_settings
sed -i "s|#.*REMOTE_POSTGRES_PORT = .*|REMOTE_POSTGRES_PORT = '5432'|" $zulip_settings
sed -i "s|#.*REMOTE_POSTGRES_SSLMODE = .*|REMOTE_POSTGRES_SSLMODE = 'require'|" $zulip_settings

echo "" >> $zulip_conf
echo "[applicaion_server]" >> $zulip_conf
echo "http_only = true" >> $zulip_conf
echo "" >> $zulip_conf
echo "[loadbalancer]" >> $zulip_conf
echo "ips = 10.240.35.157,10.240.48.24,10.240.40.241" >> $zulip_conf

echo "postgres_password = $${db_password}" >> $zulip_secrets
service postgresql stop
update-rc.d postgresql disable

/home/zulip/deployments/current/scripts/zulip-puppet-apply -f
su - zulip -c '/home/zulip/deployments/current/scripts/restart-server'
