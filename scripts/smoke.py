"""Testes HTTP e, opcionalmente, persistência e falha do banco em Compose/Kubernetes.

Usa somente a biblioteca padrão. Os testes inserem registros identificados por UUID.
As opções de ciclo de vida reiniciam o banco: execute apenas no ambiente local de teste.
"""
import argparse
import json
import subprocess
import time
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--url", default="http://localhost:8080")
parser.add_argument("--lifecycle", choices=["compose", "k8s"])
args = parser.parse_args()
base = args.url.rstrip("/")


def request(path, data=None, method=None, raw=None, content_type="application/json"):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = Request(base + path, data=body, method=method, headers={"Content-Type": content_type})
    try:
        response = urlopen(req, timeout=20)
    except HTTPError as exc:
        response = exc
    with response:
        payload = response.read().decode()
        return response.status, json.loads(payload)


def expect(data, status):
    code, result = request("/api/mensagens", data)
    assert code == status, (code, result, status)
    return result


def command(*parts):
    return subprocess.check_output(parts, text=True, encoding="utf-8").strip()


def query(sql):
    shell = ['sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u "$MYSQL_USER" "$MYSQL_DATABASE" -N -B -e "$1"', 'smoke', sql]
    if args.lifecycle == "compose":
        return command("docker", "compose", "exec", "-T", "mysql", *shell)
    return command("kubectl", "-n", "mensagens", "exec", "mysql-0", "--", *shell)


def count(marker):
    # UUID hexadecimal gerado pelo próprio teste; nenhum dado externo vira SQL.
    sql = "SELECT COUNT(*) FROM mensagens WHERE nome='" + marker + "'"
    return int(query(sql))


def backend_probe(path):
    parts = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://127.0.0.1:8080" + path]
    if args.lifecycle == "compose":
        return command("docker", "compose", "exec", "-T", "backend", *parts)
    return command("kubectl", "-n", "mensagens", "exec", "deployment/backend", "--", *parts)


def wait_ready():
    for _ in range(90):
        try:
            result = expect({"nome": "health-smoke", "email": "smoke@example.com", "comentario": "recovery"}, 201)
            return result
        except (AssertionError, URLError, TimeoutError):
            time.sleep(2)
    raise AssertionError("API não recuperou após reiniciar o banco")


marker = "smoke-" + uuid.uuid4().hex
valid = {"nome": marker, "email": "smoke@example.com", "comentario": "Olá 😀 O'Brien'); DROP TABLE mensagens; --"}
assert request("/health/live")[0] == 200
assert request("/api/inexistente")[0] == 404
assert request("/api/mensagens")[0] == 405
assert request("/api/mensagens", raw=b"{", method="POST")[0] == 400
assert request("/api/mensagens", raw=b"text", method="POST", content_type="text/plain")[0] == 415
created = expect(valid, 201)
assert isinstance(created.get("id"), int) and created["id"] > 0
for field in valid:
    expect({**valid, field: ""}, 422)
    expect({**valid, field: "   "}, 422)
    expect({**valid, field: ["texto"]}, 422)
expect({**valid, "email": "invalido"}, 422)
for field, limit in [("nome", 100), ("email", 255), ("comentario", 1000)]:
    expect({**valid, field: "a" * (limit + 1)}, 422)
# Email válido no limite RFC de 254 caracteres, dentro do VARCHAR(255).
email254 = "a" * 64 + "@" + ".".join(["b" * 63, "c" * 63, "d" * 61])
assert len(email254) == 254
expect({"nome": "n" * 100, "email": email254, "comentario": "😀" * 1000}, 201)
assert expect(valid, 201)["id"] > created["id"]

if args.lifecycle:
    assert count(marker) == 2, "Gravação não confirmada no MySQL"
    stored = query("SELECT HEX(comentario) FROM mensagens WHERE id=" + str(created['id']))
    assert stored.lower() == valid['comentario'].encode('utf-8').hex(), "Texto armazenado diferente do enviado"
    assert backend_probe("/health/live") == "200"
    assert backend_probe("/health/ready") == "200"
    if args.lifecycle == "compose":
        command("docker", "compose", "up", "-d", "--force-recreate", "mysql")
    else:
        command("kubectl", "-n", "mensagens", "delete", "pod", "mysql-0")
        command("kubectl", "-n", "mensagens", "wait", "--for=condition=Ready", "pod/mysql-0", "--timeout=300s")
    wait_ready()
    assert count(marker) == 2, "Dados perdidos após recriar banco"
    try:
        if args.lifecycle == "compose":
            command("docker", "compose", "stop", "mysql")
        else:
            command("kubectl", "-n", "mensagens", "scale", "statefulset/mysql", "--replicas=0")
            command("kubectl", "-n", "mensagens", "wait", "--for=delete", "pod/mysql-0", "--timeout=120s")
        code, result = request("/api/mensagens", valid)
        assert code == 503, (code, result)
        text = json.dumps(result).lower()
        assert "message" in result and not any(x in text for x in ["sqlstate", "password", "insert into", "pdo"])
        assert request("/health/live")[0] == 200
        assert backend_probe("/health/live") == "200", "Liveness não pode depender do banco"
        assert backend_probe("/health/ready") == "503", "Readiness deve detectar falha do banco"
    finally:
        if args.lifecycle == "compose":
            command("docker", "compose", "start", "mysql")
        else:
            command("kubectl", "-n", "mensagens", "scale", "statefulset/mysql", "--replicas=1")
        wait_ready()
    assert count(marker) == 2
print("OK: rotas, JSON, validação, limites, Unicode, aspas e payload SQL." +
      (" Persistência e indisponibilidade verificadas." if args.lifecycle else
       " Persistência e indisponibilidade NÃO verificadas; use --lifecycle."))
