# Validação executada

Data: 02/11/2026. Ambiente: Windows/PowerShell, Docker Desktop Linux, contexto Kubernetes docker-desktop. Repositório base clonado preservando o histórico; não havia arquivos anteriores no workspace nem instruções AGENTS.md no projeto base.

## Resultados

| Verificação | Resultado observado |
| --- | --- |
| docker compose config --quiet | Aprovado, com .env local não versionado |
| kubectl kustomize k8s | Renderização aprovada |
| kubectl apply --dry-run=server -k k8s | Aprovado pelo API server |
| Ingress opcional --dry-run=server | Aprovado; não implantado |
| Build das três imagens | Aprovado: dio-frontend:1.0.1, dio-backend:1.0.0, dio-mysql:1.0.0 |
| php -l index.php e conexao.php | Sem erros |
| apache2ctl -t | Syntax OK |
| nginx -t | Aprovado na imagem final |
| node --check e quatro testes do frontend | Aprovados |
| Python py_compile | Aprovado |
| Smoke HTTP no Compose e Kubernetes | Aprovado |
| POST válido e IDs sequenciais | HTTP 201; gravação confirmada por consulta MySQL |
| Campos vazios/espaços, tipos incorretos, email inválido e limites excedidos | HTTP 422 |
| Limites aceitos | Nome 100, email ASCII válido 254, comentário de 1000 caracteres Unicode |
| Aspas, Unicode e tentativa SQL | Comentário armazenado exatamente em UTF-8, conferido por HEX; tabela preservada |
| Rotas/métodos/formato | 404, 405, 400 para JSON malformado e 415 para formato não suportado |
| Banco indisponível | HTTP 503 com mensagem segura; sem detalhes SQL/senha no JSON |
| Probes do backend durante falha | Liveness 200 e readiness 503 |
| Recriação MySQL no Compose | Registros mantidos no volume; restauração após stop/start confirmada |
| Recriação mysql-0 no cluster | Registros mantidos no mesmo PVC; redução a zero e retorno também testados |
| Navegador Chrome real | Formulário enviado pelo botão, confirmação, reset e botão reabilitado |
| Layout a 375 px | Sem overflow horizontal; captura inspecionada em artifacts/mobile.png |
| git diff --check | Aprovado; avisos de conversão LF/CRLF não são erros |
| Proteção de segredos | .env, secrets/mysql.env e artifacts/mobile.png ignorados pelo Git |

Os testes de navegador foram executados tanto pelo Compose quanto pelo port-forward do Service frontend. Os testes unitários cobrem bloqueio de requisições simultâneas, erro de validação, resposta sem confirmação, falha de rede e campos preenchidos só com espaços.

## Estado final observado

- Nginx **1.30.6** no Compose e no Pod frontend.
- PHP **8.4.27**, com PDO MySQL/mbstring.
- Cluster **v1.34.3**, nó desktop-control-plane, containerd 2.2.0.
- Frontend, backend e MySQL: Pods 1/1 Running.
- PVC data-mysql-0: Bound, 2 GiB, ReadWriteOnce, StorageClass standard.
- Services frontend/backend ClusterIP e MySQL headless, sem IP externo.
- Compose executando com frontend em http://localhost:8080.
- Namespace mensagens e volumes preservados; testes deixaram registros identificados por smoke-/browser- e health-smoke.
- Duas senhas aleatórias geradas em .env; nenhuma senha foi escrita em imagens ou arquivos versionáveis.
- Nenhum push para registry, publicação externa, controller de Ingress ou recurso pago criado.

Durante a implementação, o cache Kubernetes conservou a imagem Nginx anterior quando a mesma tag foi reconstruída. O frontend final usa uma nova tag 1.0.1 e a versão dentro do Pod foi conferida. Isso também foi incorporado às instruções de atualização. O port-forward foi reiniciado após o rollout.

## Como repetir

Na raiz, com Docker Desktop/cluster prontos e .env configurado:

```powershell
docker compose build
docker compose up -d --wait --wait-timeout 300
node --test scripts/frontend.test.cjs
python scripts/smoke.py --url http://127.0.0.1:8080 --lifecycle compose
node scripts/browser-smoke.cjs

kubectl apply --dry-run=server -k k8s
kubectl apply -k k8s
kubectl -n mensagens port-forward service/frontend 8081:8080
# Outro terminal:
python scripts/smoke.py --url http://127.0.0.1:8081 --lifecycle k8s
node scripts/browser-smoke.cjs http://127.0.0.1:8081
```

As opções --lifecycle interrompem o banco temporariamente e inserem dados: use somente no ambiente local de teste. O script restaura o serviço após o teste de indisponibilidade.

## Limitações e verificações pendentes

- TLS, DNS, controller de Ingress e emissão/renovação de certificados não foram implantados; o manifesto opcional foi apenas validado pelo servidor.
- Publicação e pull autenticado por registry externo não foram executados.
- Backup/restauração, desastre de disco/VM, upgrades principais de MySQL, carga e alta disponibilidade não foram testados.
- Acessibilidade com leitor de tela e navegação manual completa por teclado ainda precisam de revisão humana; labels, foco e região de status foram implementados.
- Smoke de navegador depende de Chrome no Windows/Node 22+ e CDP em 9225 livre; não cobre outros navegadores.
- O kubectl instalado é v1.36.1, dois minors à frente do servidor v1.34.3. Os comandos executados passaram, mas recomenda-se alinhar o cliente ao servidor ou ao intervalo suportado de um minor.
- A passagem dos testes locais não representa prontidão para produção. Consulte os requisitos operacionais no README.
