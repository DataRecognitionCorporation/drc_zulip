#!/bin/bash

dirs=(/srv/zulip-{npm,venv,emoji}-cache)
sudo mkdir -p "${dirs[@]}"
sudo chown -R github "${dirs[@]}"

