<?php
declare(strict_types=1);
require __DIR__ . '/conexao.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder(int $status, array $body): never
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

$rota = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$metodo = $_SERVER['REQUEST_METHOD'];
if ($rota === '/health/live' && $metodo === 'GET') {
    responder(200, ['status' => 'ok']);
}
if ($rota === '/health/ready' && $metodo === 'GET') {
    try {
        conectar()->query('SELECT 1');
        responder(200, ['status' => 'ready']);
    } catch (Throwable $e) {
        error_log('Readiness: ' . $e->getMessage());
        responder(503, ['message' => 'Banco de dados indisponível.']);
    }
}
if ($rota !== '/api/mensagens') {
    responder(404, ['message' => 'Rota não encontrada.']);
}
if ($metodo !== 'POST') {
    header('Allow: POST');
    responder(405, ['message' => 'Use POST para enviar uma mensagem.']);
}
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) {
    responder(413, ['message' => 'Conteúdo muito grande.']);
}
if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
    responder(415, ['message' => 'Envie os dados em JSON.']);
}
try {
    $dados = json_decode(file_get_contents('php://input'), true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException $e) {
    responder(400, ['message' => 'JSON inválido.']);
}
if (!is_array($dados)) {
    responder(400, ['message' => 'Envie um objeto JSON com os campos do formulário.']);
}
$valores = [];
$erros = [];
foreach (['nome' => 100, 'email' => 255, 'comentario' => 1000] as $campo => $limite) {
    $valor = $dados[$campo] ?? null;
    if (!is_string($valor) || !mb_check_encoding($valor, 'UTF-8')) {
        $erros[$campo] = 'Informe um texto válido.';
        continue;
    }
    $valor = preg_replace('/^\s+|\s+$/u', '', $valor);
    if ($valor === '' || mb_strlen($valor, 'UTF-8') > $limite) {
        $erros[$campo] = "Campo obrigatório com limite de $limite caracteres.";
    }
    $valores[$campo] = $valor;
}
if (isset($valores['email']) && !filter_var($valores['email'], FILTER_VALIDATE_EMAIL)) {
    $erros['email'] = 'Informe um email válido.';
}
if ($erros) {
    responder(422, ['message' => 'Revise os campos informados.', 'errors' => $erros]);
}
try {
    $db = conectar();
    $stmt = $db->prepare('INSERT INTO mensagens (nome, email, comentario) VALUES (:nome, :email, :comentario)');
    $stmt->execute($valores);
    responder(201, ['message' => 'Mensagem salva com sucesso.', 'id' => (int) $db->lastInsertId()]);
} catch (Throwable $e) {
    error_log('Falha ao salvar mensagem: ' . $e->getMessage());
    responder(503, ['message' => 'Não foi possível salvar agora. Tente novamente mais tarde.']);
}
