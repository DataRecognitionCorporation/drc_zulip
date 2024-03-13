#!/bin/bash -ex

download_url="https://artifactory.datarecognitioncorp.com/artifactory/downloads/zulip"
zulip_version="6.1.22"
package="zulip-server-$${zulip_version}.tar.gz"

apt-get update
apt-get upgrade -y

wget $${download_url}/$${package}

tar -xf "zulip-server-$${zulip_version}.tar.gz"


./zulip-server-*/scripts/setup/install --self-signed-cert \
    --email="atormanen@datarecognitioncorp.com" --hostname="chat-dev.datarecognitioncorp.com"

