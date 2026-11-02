FROM mysql:8.4
COPY init.sql /docker-entrypoint-initdb.d/001-schema.sql
COPY healthcheck.sh /usr/local/bin/app-healthcheck
RUN chmod +x /usr/local/bin/app-healthcheck
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 CMD ["app-healthcheck"]
