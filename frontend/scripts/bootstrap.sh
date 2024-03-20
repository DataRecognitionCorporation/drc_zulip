#!/bin/bash -ex

environment="${environment}"
zulip_db_url="${db_url}"
email_host="${email_host}"
email_host_user="${email_host_user}"

download_url="${download_url}"
zulip_version="${zulip_version}"
dp_password_arn="${db_password_arn}"
lb_ip_range="${lb_ip_range}"
hostedzoneid="${hosted_zone_id}"
domain="${domain}"
cortex_dist_id_arn="${cortex_dist_id_arn}"

artifactory_url="https://artifactory.datarecognitioncorp.com/artifactory"
cortex_dist_server="https://distributions.traps.paloaltonetworks.com/"
drc_ubuntu_repo="ubuntu-22"

package="zulip-server-$${zulip_version}.tar.gz"
zulip_conf="/etc/zulip/zulip.conf"
zulip_secrets="/etc/zulip/zulip-secrets.conf"
zulip_settings="/etc/zulip/settings.py"

hostnamectl hostname "chat-$${environment}.datarecognitioncorp.com"
apt-get update
apt-get upgrade -y
apt install -y unzip jq net-tools

curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

db_password=$(aws secretsmanager get-secret-value --secret-id $dp_password_arn | jq -r '.SecretString | fromjson | .password')
cortex_dist_id=$(aws secretsmanager get-secret-value --secret-id $cortex_dist_id_arn | jq -r '.SecretString | fromjson | .cortex_dist_id')

public_key_url="$${artifactory_url}/api/v2/repositories/$${drc_ubuntu_repo}/keyPairs/primary/public"
wget -q -P /tmp $public_key_url
gpg --no-default-keyring --keyring=/usr/share/keyrings/drc-$${drc_ubuntu_repo}.gpg --import /tmp/public 
rm -f /tmp/public

cat <<EOF > /etc/apt/sources.list.d/drc-$${drc_ubuntu_repo}.list
# DRC generic repo
deb [signed-by=/usr/share/keyrings/drc-$${drc_ubuntu_repo}.gpg] $${artifactory_url}/$${drc_ubuntu_repo} jammy main
EOF

apt-get update

sudo mkdir -p /etc/panw
cat <<EOF > /etc/panw/cortex.conf
--distribution-id $${cortex_dist_id}
--distribution-server $${cortex_dist_server}
EOF

apt-get install cortex-agent

wget $${download_url}/$${package}

tar -xf "zulip-server-$${zulip_version}.tar.gz"

./zulip-server-*/scripts/setup/install --self-signed-cert \
    --email="atormanen@datarecognitioncorp.com" --hostname="chat-dev.datarecognitioncorp.com" --no-init-db --postgresql-missing-dictionaries


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
echo "[application_server]" >> $zulip_conf
echo "http_only = true" >> $zulip_conf
echo "" >> $zulip_conf
echo "[loadbalancer]" >> $zulip_conf
echo "ips = $${lb_ip_range}" >> $zulip_conf

echo "postgres_password = $${db_password}" >> $zulip_secrets
service postgresql stop
update-rc.d postgresql disable

/home/zulip/deployments/current/scripts/zulip-puppet-apply -f
su - zulip -c '/home/zulip/deployments/current/scripts/restart-server'


TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2> /dev/null)
LOCALIP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4 2> /dev/null)

# Route53 update
cat > /tmp/route53-record.txt <<- EOF
{
  "Comment": "A new record set for the zone.",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "chat-$environment-ec2.$domain",
        "Type": "A",
        "TTL": 60,
        "ResourceRecords": [
          {
            "Value": "$LOCALIP"
          }
        ]
      }
    }
  ]
}
EOF

aws route53 change-resource-record-sets --hosted-zone-id $hostedzoneid \
  --change-batch file:///tmp/route53-record.txt


