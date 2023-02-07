#!/bin/bash
deploy_folder="./deploy"
base_folder="/home/zulip/deployments/current"

base_html="./templates/zerver/base.html"

gear_menu="./static/templates/gear_menu.hbs"
drc_maintenance="./templates/zerver/drc_maintenance.html"
drc_reports="./templates/zerver/drc_reports.html"
script_output="./templates/zerver/script_output.html"
zulip_logo="./templates/zerver/zulip_logo.html"
drc_scripts_py="./zerver/views/drc_scripts.py"
urls_py="./zproject/urls.py"

mkdir -p "${deploy_folder}/templates/zerver"
mkdir -p "${deploy_folder}/static/templates"
mkdir -p "${deploy_folder}/zerver/views"
mkdir -p "${deploy_folder}/zproject"

cp $base_html "${deploy_folder}/${base_html}"
cp $gear_menu "${deploy_folder}/${gear_menu}"
cp $drc_maintenance "${deploy_folder}/${drc_maintenance}"
cp $drc_reports "${deploy_folder}/${drc_reports}"
cp $script_output "${deploy_folder}/${script_output}"
cp $zulip_logo "${deploy_folder}/${zulip_logo}"

cp $drc_scripts_py "${deploy_folder}/${drc_scripts_py}"
cp $urls_py "${deploy_folder}/${urls_py}"
