#!/bin/bash -ex

ENVIRONMENT="${environment}"
ZULIP_DB_URL="${db_url}"
EMAIL_HOST="${email_host}"
EMAIL_HOST_USER="${email_host_user}"

ZULIP_DOWNLOAD_URL="${download_url}"
ZULIP_VERSION="${zulip_version}"
DP_PASSWORD_ARN="${db_password_arn}"
LB_IP_RANGE="${lb_ip_range}"
HOSTED_ZONE_ID="${hosted_zone_id}"
EC2_DOMAIN="${domain}"
CORTEX_DIST_ID_ARN="${cortex_dist_id_arn}"
JITSI_SERVER_URL="${jitsi_server_url}"
LOGIN_URL="${login_url}"

S3_AVATAR_BUCKET="${s3_avatar_bucket}"
S3_UPLOADS_BUCKET="${s3_uploads_bucket}"
ZULIP_SECRETS_ARN="${zulip_secrets_arn}"
DYNATRACE_PAAS_ARN=${dynatrace_paas_arn}

TORNADO_PROCESSES="${tornado_processes}"
UWSGI_PROCESSES="${uwsgi_processes}"

ARTIFACTORY_URL="https://artifactory.datarecognitioncorp.com/artifactory"
CORTEX_DIST_SERVER="https://distributions.traps.paloaltonetworks.com/"
DRC_UBUTU_REPO="ubuntu-22"

PACKAGE="zulip-server-$${ZULIP_VERSION}.tar.gz"
ZULIP_CONF="/etc/zulip/zulip.conf"
ZULIP_SECRETS="/etc/zulip/zulip-secrets.conf"
ZULIP_SETTINGS="/etc/zulip/settings.py"
ZULIP_SECRETS="/etc/zulip/zulip-secrets.conf"

TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2> /dev/null)
LOCALIP=$(curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/local-ipv4 2> /dev/null)

hostnamectl hostname "chat-$${ENVIRONMENT}.datarecognitioncorp.com"
apt-get update
apt-get upgrade -y
apt install -y unzip jq net-tools

# INSTALL AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install --update

# CONFIGURE DRC UBUNTU REPO
db_password=$(aws secretsmanager get-secret-value --secret-id $DP_PASSWORD_ARN | jq -r '.SecretString | fromjson | .password')
public_key_url="$${ARTIFACTORY_URL}/api/v2/repositories/$${DRC_UBUTU_REPO}/keyPairs/primary/public"
wget -q -P /tmp $public_key_url
gpg --no-default-keyring --keyring=/usr/share/keyrings/drc-$${DRC_UBUTU_REPO}.gpg --import /tmp/public 
rm -f /tmp/public

cat <<EOF > /etc/apt/sources.list.d/drc-$${DRC_UBUTU_REPO}.list
# DRC generic repo
deb [signed-by=/usr/share/keyrings/drc-$${DRC_UBUTU_REPO}.gpg] $${ARTIFACTORY_URL}/$${DRC_UBUTU_REPO} jammy main
EOF

apt-get update


# INSTALL ZULIP
wget $${ZULIP_DOWNLOAD_URL}/$${PACKAGE}

tar -xf "zulip-server-$${ZULIP_VERSION}.tar.gz"


if [[ $${ENVIRONMENT} == 'prod' ]]; then
  ./zulip-server-*/scripts/setup/install --self-signed-cert \
      --email="zulip@datarecognitioncorp.com" --hostname="chat.datarecognitioncorp.com" --no-init-db --postgresql-missing-dictionaries
  sed -i "s|#.*ALLOWED_HOSTS = .*|ALLOWED_HOSTS = ['$LOCALIP', 'chat-prod.datarecognitioncorp.com']|" $ZULIP_SETTINGS
else
  ./zulip-server-*/scripts/setup/install --self-signed-cert \
      --email="zulip@datarecognitioncorp.com" --hostname="chat-$ENVIRONMENT.datarecognitioncorp.com" --no-init-db --postgresql-missing-dictionaries
  sed -i "s|#.*ALLOWED_HOSTS = .*|ALLOWED_HOSTS = ['$LOCALIP']|" $ZULIP_SETTINGS
fi

sed -i "s|#.*EMAIL_HOST = .*|EMAIL_HOST = '$EMAIL_HOST'|" $ZULIP_SETTINGS
sed -i "s|#.*EMAIL_HOST_USER = .*|EMAIL_HOST_USER = '$EMAIL_HOST_USER'|" $ZULIP_SETTINGS
sed -i "s|#.*EMAIL_USE_TLS = .*|EMAIL_USE_TLS = True|" $ZULIP_SETTINGS
sed -i "s|#.*EMAIL_PORT = .*|EMAIL_PORT = 587|" $ZULIP_SETTINGS

sed -i "s|LOCAL_UPLOADS_DIR = .*|#LOCAL_UPLOADS_DIR = '/usr/zulip/uploads'|" $ZULIP_SETTINGS
sed -i "s|#.*S3_AUTH_UPLOADS_BUCKET = .*|S3_AUTH_UPLOADS_BUCKET = '$S3_UPLOADS_BUCKET'|" $ZULIP_SETTINGS
sed -i "s|#.*S3_AVATAR_BUCKET = .*|S3_AVATAR_BUCKET = '$S3_AVATAR_BUCKET'|" $ZULIP_SETTINGS
sed -i "s|#.*S3_REGION = .*|S3_RGION = 'us-east-2'|" $ZULIP_SETTINGS

sed -i "s|#.*REMOTE_POSTGRES_HOST = .*|REMOTE_POSTGRES_HOST = '$ZULIP_DB_URL'|" $ZULIP_SETTINGS
sed -i "s|#.*REMOTE_POSTGRES_PORT = .*|REMOTE_POSTGRES_PORT = '5432'|" $ZULIP_SETTINGS
sed -i "s|#.*REMOTE_POSTGRES_SSLMODE = .*|REMOTE_POSTGRES_SSLMODE = 'require'|" $ZULIP_SETTINGS
sed -i "s|#.*USER_LIMIT_FOR_SENDING_PRESENCE_UPDATE_EVENTS = .*|USER_LIMIT_FOR_SENDING_PRESENCE_UPDATE_EVENTS = 0|" $ZULIP_SETTINGS

sed -i "s|#.*JITSI_SERVER_URL = .*|JITSI_SERVER_URL = '$JITSI_SERVER_URL'|" $ZULIP_SETTINGS

echo "LOGIN_URL = '$LOGIN_URL'" >> $ZULIP_SETTINGS

echo "" >> $ZULIP_CONF
echo "[application_server]" >> $ZULIP_CONF
echo "http_only = true" >> $ZULIP_CONF
echo "no_serve_uploads = true" >> $ZULIP_CONF
echo "uwsgi_processes = $${UWSGI_PROCESSES}" >> $ZULIP_CONF
echo "" >> $ZULIP_CONF
echo "[loadbalancer]" >> $ZULIP_CONF
echo "ips = $${LB_IP_RANGE}" >> $ZULIP_CONF


# OKTA CONFIGURATION
sed -i 's|        "name": "zulip",.*|        "name": "chat",|' $ZULIP_SETTINGS
sed -i 's|        "displayname": "Example, Inc. Zulip",.*|        "displayname": "DRC Chat",|' $ZULIP_SETTINGS

sed -i 's|    # "zproject.backends.SAMLAuthBackend",.*|    "zproject.backends.SAMLAuthBackend",|' $ZULIP_SETTINGS
sed -i 's|    "idp_name": {.*|    "okta": {|' $ZULIP_SETTINGS
sed -i 's|        "entity_id":.*|        "entity_id": "http://www.okta.com/exk7uunhvfu5du28v4x7",|' $ZULIP_SETTINGS
sed -i 's|        "url": "https://idp.testshib.org/idp/profile/SAML2/Redirect/SSO",.*|        "url": "https://auth.drcedirect.com/app/datarecognitioncorp_zulip_1/exk7uunhvfu5du28v4x7/sso/saml",|' $ZULIP_SETTINGS
sed -i 's|        "display_name": "SAML",.*|        "display_name": "Insight Portal",|' $ZULIP_SETTINGS

mkdir -p /etc/zulip/saml/idps/
cat <<OKTA_CRT > /etc/zulip/saml/idps/okta.crt
-----BEGIN CERTIFICATE-----
MIIDtjCCAp6gAwIBAgIGAYGs/pNCMA0GCSqGSIb3DQEBCwUAMIGbMQswCQYDVQQGEwJVUzETMBEG
A1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzENMAsGA1UECgwET2t0YTEU
MBIGA1UECwwLU1NPUHJvdmlkZXIxHDAaBgNVBAMME2RhdGFyZWNvZ25pdGlvbmNvcnAxHDAaBgkq
hkiG9w0BCQEWDWluZm9Ab2t0YS5jb20wHhcNMjIwNjI5MDEwNTEzWhcNMzIwNjI5MDEwNjEzWjCB
mzELMAkGA1UEBhMCVVMxEzARBgNVBAgMCkNhbGlmb3JuaWExFjAUBgNVBAcMDVNhbiBGcmFuY2lz
Y28xDTALBgNVBAoMBE9rdGExFDASBgNVBAsMC1NTT1Byb3ZpZGVyMRwwGgYDVQQDDBNkYXRhcmVj
b2duaXRpb25jb3JwMRwwGgYJKoZIhvcNAQkBFg1pbmZvQG9rdGEuY29tMIIBIjANBgkqhkiG9w0B
AQEFAAOCAQ8AMIIBCgKCAQEAzFtDXK6UZj0hjpJdtUrpdSVhTNOsRZ684mZsSL1hHMjpYpoW8zcv
TePVCnD9kIH7Qvm/klm3wnF1t2O4NogYp++CQdAyYyWSuQ8V4PqCzJvi0NUSjy76J4lroR14olFn
abxVTYDJMOs6BgAa7FpfnLQieNGnEbefDD9WEAopD0DP8Axre0hyfMRrScb03QFcGfLmka/FnqT0
lfAoP7CB8RGPT+9z5tUfIsmDX4v89ZvZ6OHSrgBizTECudiyF1/eDxrmMf8N5wXYZpa0ttioBPuX
PaOmqcRt74CychqIu2JMhayVK50PoQWaBzz4nTwkVIqs+MHE3MtsG4e2fJEYzwIDAQABMA0GCSqG
SIb3DQEBCwUAA4IBAQBO2YjHw2pHef4FLdWAsagdAI4ZfdTxm15CCqnCgOZqPs3Ph+R4mSHnh0ip
EXo1CMTHixymyVphCvc0OCzj79hPCVQXbL7YMAY3XzYXweqJbKDWoCB3y2tdTcrLcjXqSOmxnBFl
zZxFnny26bHgBVuDNDcOXKp2DisatzYMbDDpqBm7UP6d+q0Aj1ztxLsxnq9zcI3VGfvUUOLS68zl
SKUX+KZPqT7Nfe1dgX8cAMYX4fuPGkO4zDLukqF+e5043URcUw4c3VBcw1ezzHPtwJ0hplDuvZFG
Ganh/aQs3voPjGbcWJyiSdgSCtr2IDfbmRYY+054dvKEt/RsAORlf4oG
-----END CERTIFICATE-----
OKTA_CRT
chown -Rf zulip:zulip /etc/zulip/saml

# CONFIGURE TORNADO SHARDING
long_string=""
for ((i=0; i<=10; i++)); do
    long_string+="98$(printf "%02d" $i)_"
done
shard_list=$${long_string::-1}

echo "[tornado_sharding]" >> $ZULIP_CONF
echo "$shard_list = giant-realm" >> $ZULIP_CONF


echo "postgres_password = $${db_password}" >> $ZULIP_SECRETS
service postgresql stop
update-rc.d postgresql disable

zulip_secrets=$(aws secretsmanager get-secret-value --secret-id $ZULIP_SECRETS_ARN | jq -r '.SecretString | fromjson')
avatar_salt=$(echo $zulip_secrets | jq -r '.avatar_salt')
email_password=$(echo $zulip_secrets | jq -r '.email_password')
sed -i "s|avatar_salt = .*|avatar_salt = $avatar_salt|" $ZULIP_SECRETS
echo "email_password = ${email_password}" >> $ZULIP_SECRETS


/home/zulip/deployments/current/scripts/zulip-puppet-apply -f || echo
/home/zulip/deployments/current/scripts/refresh-sharding-and-restart || echo
su - zulip -c '/home/zulip/deployments/current/scripts/stop-server' || echo
su - zulip -c '/home/zulip/deployments/current/scripts/start-server' || echo

# Route53 update
cat > /tmp/route53-record.txt <<- EOF
{
  "Comment": "A new record set for the zone.",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "chat-$ENVIRONMENT-ec2.$EC2_DOMAIN",
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

aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID \
  --change-batch file:///tmp/route53-record.txt


# INSTALL CORTEX
cortex_dist_id=$(aws secretsmanager get-secret-value --secret-id $CORTEX_DIST_ID_ARN | jq -r '.SecretString | fromjson | .cortex_dist_id')
sudo mkdir -p /etc/panw
cat <<EOF > /etc/panw/cortex.conf
--distribution-id $${cortex_dist_id}
--distribution-server $${CORTEX_DIST_SERVER}
EOF

apt-get install cortex-agent

# DYNATRACE INSTALL
paas_token=$(aws secretsmanager get-secret-value --secret-id $DYNATRACE_PAAS_ARN | jq -r '.SecretString | fromjson | .paas_token')

wget  -O Dynatrace-OneAgent-Linux.sh "https://ffk98875.live.dynatrace.com/api/v1/deployment/installer/agent/unix/default/latest?arch=arm&flavor=default" --header="Authorization: Api-Token $paas_token"
wget https://ca.dynatrace.com/dt-root.cert.pem ; ( echo 'Content-Type: multipart/signed; protocol="application/x-pkcs7-signature"; micalg="sha-256"; boundary="--SIGNED-INSTALLER"'; echo ; echo ; echo '----SIGNED-INSTALLER' ; cat Dynatrace-OneAgent-Linux.sh ) | openssl cms -verify -CAfile dt-root.cert.pem > /dev/null
/bin/sh Dynatrace-OneAgent-Linux.sh --set-infra-only=false --set-app-log-content-access=true
ln -s /opt/dynatrace/oneagent/agent/tools/oneagentctl /usr/bin/oneagentctl
oneagentctl --set-network-zone=aws.us-east-2 --set-host-group=zulip_$${ENVIRONMENT}_pas --restart-service


