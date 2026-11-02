FROM php:8.4-apache-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libonig-dev \
    && docker-php-ext-install pdo_mysql mbstring \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i 's/Listen 80/Listen 8080/' /etc/apache2/ports.conf \
    && mkdir -p /var/run/apache2 /var/lock/apache2 \
    && chown -R www-data:www-data /var/run/apache2 /var/lock/apache2
COPY apache.conf /etc/apache2/sites-available/000-default.conf
COPY php.ini /usr/local/etc/php/conf.d/app.ini
COPY index.php conexao.php /var/www/html/
USER www-data
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD php -r 'exit(@file_get_contents("http://127.0.0.1:8080/health/ready") === false ? 1 : 0);'
