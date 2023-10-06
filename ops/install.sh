#!/bin/bash

apt install -y git curl sudo redis-server

# Stop this script on any error.
set -e

curl https://raw.githubusercontent.com/tests-always-included/mo/master/mo > /tmp/mo

# Pull in the mustache template library for bash
source /tmp/mo

PROJECT_NAME="cl-manager"
GIT_URL="https://github.com/codeland-ecosystem/manager.git"
INSTALL_PATH="/var/www/$PROJECT_NAME"
INSTALL_USER="root"
NODE_MAJOR=18

mkdir -p "$INSTALL_PATH/"

sudo apt-get install -y ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update
sudo apt-get install nodejs -y

git clone "$GIT_URL" "$INSTALL_PATH/"

cd "$INSTALL_PATH"

service_template="$(cat ops/cl-manager.service)"
echo "$service_template" | mo > "/etc/systemd/system/$PROJECT_NAME.service"

cd nodejs

npm install

systemctl daemon-reload
systemctl start "$PROJECT_NAME.service"
systemctl enable "$PROJECT_NAME.service"
