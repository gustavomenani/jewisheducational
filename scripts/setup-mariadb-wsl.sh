#!/bin/bash
set -e

DB_NAME="${DB_NAME:-jewish_educational_resources}"
DB_USER="${DB_USER:-jer}"
DB_PASS="${DB_PASS:-jer_dev_pass}"

echo ">> Atualizando pacotes..."
sudo apt-get update -qq

echo ">> Instalando MariaDB..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client

echo ">> Iniciando MariaDB..."
start_mariadb() {
  # WSL ships systemctl but often has no systemd (PID 1); service is the reliable path.
  if [ -d /run/systemd/system ] && systemctl is-system-running --quiet 2>/dev/null; then
    sudo systemctl enable mariadb
    sudo systemctl start mariadb
    return $?
  fi

  sudo install -m 755 -o mysql -g root -d /run/mysqld 2>/dev/null || true
  sudo service mariadb start
}

if ! start_mariadb; then
  echo "ERRO: nao foi possivel iniciar o MariaDB." >&2
  echo "Tente manualmente: sudo service mariadb start" >&2
  echo "Logs: sudo tail -30 /var/log/mysql/error.log" >&2
  exit 1
fi

echo ">> Aguardando MariaDB ficar pronto..."
for _ in $(seq 1 30); do
  if [ -S /run/mysqld/mysqld.sock ] && sudo mysql -e "SELECT 1" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! sudo mysql -e "SELECT 1" >/dev/null 2>&1; then
  echo "ERRO: MariaDB nao respondeu apos iniciar." >&2
  echo "Status: sudo service mariadb status" >&2
  echo "Logs: sudo tail -30 /var/log/mysql/error.log" >&2
  exit 1
fi

echo ">> Configurando banco e usuario..."
sudo mysql <<EOF
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
EOF

echo ""
echo "MariaDB pronto!"
echo "  Banco:  ${DB_NAME}"
echo "  User:   ${DB_USER}"
echo "  Pass:   ${DB_PASS}"
echo "  Host:   127.0.0.1"
