#!/bin/bash

hostname=$(hostname)

./scripts/setup/install --self-signed-cert \
  --email="atormanen@datarecognitioncorp.com" \
  --hostname="${hostname}.com"
