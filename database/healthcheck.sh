#!/bin/sh
# Verifica autenticação, schema e tabela com o usuário da aplicação.
MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=TCP -h 127.0.0.1 -u "$MYSQL_USER" "$MYSQL_DATABASE" --batch --skip-column-names -e 'SELECT 1 FROM mensagens LIMIT 0' >/dev/null
