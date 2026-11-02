<?php
declare(strict_types=1);

/** Conecta usando o usuário restrito da aplicação e codificação compatível com o schema. */
function conectar(): PDO
{
    return new PDO(
        sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', getenv('DB_HOST') ?: 'mysql', getenv('DB_PORT') ?: '3306', getenv('DB_NAME') ?: 'meubanco'),
        getenv('DB_USER') ?: 'app', getenv('DB_PASSWORD') ?: '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 3]
    );
}
