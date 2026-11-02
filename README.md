# Deploy de uma aplicação completa com Docker e Kubernetes

Aplicação de comentários em HTML, CSS, JavaScript e PHP com MySQL. Base de **Denilson Bonatti**: [k8s-projeto1-app-base](https://github.com/denilsonbonatti/k8s-projeto1-app-base), commit `950d5d94ff12a2b9b67da56cf16abb544cd58587`. O histórico original foi preservado. Foram corrigidos formulário, envio, conexão, validação, SQL e implantação.

## Arquitetura e decisões

```text
Navegador -> frontend Nginx :8080 -> /api/mensagens -> backend Apache/PHP :8080
                                                        |
                                                        v
                                                  mysql :3306
                                                  volume persistente
```

Só o frontend recebe acesso externo. No Compose, a porta é publicada apenas em 127.0.0.1. No Kubernetes, todos os Services são internos; use port-forward ou o Ingress opcional do frontend. O proxy preserva /api/mensagens; Apache encaminha rotas não físicas para index.php. Não há IP fixo, CORS aberto nem acesso direto do navegador ao banco.

Mantido o cartão cinza com campos claros e botão azul. Gradiente e fontes locais substituem imagens HTTP e dependências remotas quebradas. JavaScript nativo substitui jQuery. Labels, foco visível, layout fluido, limites e região de status atendem à interação básica com teclado/leitor de tela.

PHP usa PDO MySQL, prepared statements nativos, utf8mb4 e variáveis de ambiente. O banco gera IDs com AUTO_INCREMENT. POST JSON retorna 201 somente depois do INSERT; 400 JSON inválido, 405 método, 413 tamanho, 415 formato, 422 campos e 503 indisponibilidade. Erros internos ficam nos logs, nunca no navegador. Nome, email e comentário são obrigatórios; limites 100/255/1000 caracteres. Email segue FILTER_VALIDATE_EMAIL (endereços ASCII); nome/comentário aceitam Unicode. O limite de corpo é 16 KiB.

Liveness /health/live do backend verifica apenas HTTP/PHP. Readiness /health/ready consulta SELECT 1 no banco. O Nginx possui /health/live independente da API para continuar apresentando o formulário e erros durante uma falha. Readiness do MySQL verifica autenticação e existência da tabela; liveness usa mysqladmin ping para evitar reinícios por senha incorreta.

Imagens base: nginx:1.30-alpine, php:8.4-apache-bookworm e mysql:8.4 (LTS), sem latest. A linha Nginx foi escolhida conforme a [versão estável oficial](https://nginx.org/en/download.html). Tags de linha recebem correções; para builds bit a bit, fixe também os digests após homologação. Frontend e backend rodam sem root e sem capabilities. O MySQL mantém o entrypoint oficial, que ajusta permissões do PVC como root antes de executar mysqld como mysql; não atende, sem adaptação, a namespaces com Pod Security restricted. Não foi imposto filesystem somente leitura às imagens que precisam escrever PID/cache/runtime.

## Estrutura

- frontend/: formulário, CSS, JavaScript, Nginx e Dockerfile.
- backend/: roteador PHP, conexão PDO, Apache, php.ini e Dockerfile.
- database/: Dockerfile MySQL, SQL idempotente e healthcheck.
- compose.yaml: três imagens próprias, healthchecks, dependências e volume nomeado.
- k8s/: Namespace, ConfigMap, Deployments, Services, StatefulSet/PVC e Kustomize.
- k8s/ingress/: Ingress opcional, fora do Kustomize principal.
- scripts/configure.ps1: gera duas senhas aleatórias diferentes no .env.
- scripts/create-secret.ps1: cria Secret a partir do .env sem imprimir senhas.
- scripts/smoke.py: testes HTTP e testes opcionais de ciclo de vida do banco.
- scripts/frontend.test.cjs: testes do comportamento de envio, sem dependências.
- VALIDATION.md: resultados efetivamente executados e pendências.

## Pré-requisitos e ambiente principal

Windows com PowerShell 5.1 ou superior, Git e Docker Desktop usando **containers Linux/WSL 2**. Reserve, como ponto inicial, 4 CPUs, 6 GiB RAM e espaço para imagens/volumes. Para testes, Python 3 e Node.js 20+.

Opção principal: Kubernetes do Docker Desktop com provisionador **kubeadm**, um nó. Em Settings > Kubernetes habilite o cluster e aguarde ficar pronto; selecione kubeadm para usar as imagens construídas no Docker Engine local. Outros provisionadores (inclusive kind com containerd separado) podem exigir importação de imagens ou registry.

```powershell
docker version
docker context use desktop-linux
kubectl config use-context docker-desktop
kubectl cluster-info
kubectl get nodes
kubectl get storageclass
```

Requer Kubernetes 1.32+ (retenção explícita de PVC no StatefulSet) e StorageClass padrão com provisionamento dinâmico e ReadWriteOnce. O Docker Desktop costuma fornecer hostpath. O claim pede 2Gi; se não houver classe padrão, configure storageClassName no volumeClaimTemplates de k8s/mysql.yaml **antes** de criar o StatefulSet. Não use emptyDir para dados. Armazenamento do Desktop é local ao computador/VM, não é backup nem alta disponibilidade.

## Variáveis e segredos

Na raiz, gere um .env com senhas locais fortes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/configure.ps1
```

O Bypass vale somente para esse processo de execução do script local revisado; não muda a política permanente. O script recusa sobrescrever .env. Alternativamente copie .env.example para .env e substitua ambas as senhas ilustrativas. APP_PORT padrão é 8080. DB_HOST=mysql, DB_PORT=3306, DB_NAME=meubanco e DB_USER=app estão no Compose/ConfigMap. O usuário app recebe acesso apenas a meubanco pela inicialização oficial; root só é usado para manutenção.

.env, secrets/ e chaves/certificados privados são ignorados pelo Git. Contextos Docker usam lista de arquivos permitidos, impedindo envio acidental de segredos ao build. Não use senhas em Dockerfile ou build args. Secrets Kubernetes são codificados em base64, não criptografados por isso: limite RBAC, proteja kubeconfig e configure criptografia em repouso/gestor de segredos em infraestrutura real.

## Docker Compose: construir e executar

```powershell
docker compose config --quiet
docker compose build --pull
docker compose up -d --wait --wait-timeout 300
docker compose ps
Start-Process http://localhost:8080
```

As imagens próprias resultantes são dio-frontend:1.0.1, dio-backend:1.0.0 e dio-mysql:1.0.0. O frontend recebeu uma nova tag durante a atualização da imagem base. Para outra porta, edite APP_PORT no .env. Backend e banco não publicam portas no host. Volume mensagens_mysql-data preserva os registros.

Validação e testes (os testes inserem registros):

```powershell
node --check frontend/js.js
node --test scripts/frontend.test.cjs
node scripts/browser-smoke.cjs
docker compose exec -T backend php -l index.php
docker compose exec -T backend php -l conexao.php
docker compose exec -T backend apache2ctl -t
docker compose exec -T frontend nginx -t
python scripts/smoke.py
# Reinicia/recria apenas o banco local de teste e verifica preservação:
python scripts/smoke.py --lifecycle compose
```

O smoke envia limites, Unicode, aspas e payload SQL como texto; verifica HTTP e, com --lifecycle, consulta MySQL, compara o comentário armazenado byte a byte, recria o container mantendo o volume, interrompe o banco, exige erro 503 seguro, verifica liveness/readiness do backend e restaura o serviço em finally. Não execute opções de ciclo de vida contra ambiente compartilhado. Os testes de frontend exercitam o handler real com DOM simulado. O browser-smoke requer Node.js 22+, Chrome instalado no caminho padrão do Windows (ou CHROME_PATH) e porta 9225 livre; envia o formulário real, verifica sucesso/reset e captura artifacts/mobile.png em 375px sem overflow. Para Kubernetes: node scripts/browser-smoke.cjs http://127.0.0.1:8081. Faça também revisão manual com teclado/leitor de tela. O bloqueio de duplicidade cobre requisições simultâneas da mesma página; não há garantia de idempotência para reenvios após perda da resposta.

### Consultar registros

```powershell
docker compose exec mysql mysql -u app -p meubanco
```

Digite a senha MYSQL_PASSWORD do .env no prompt do cliente e execute:

```sql
SELECT id, nome, email, comentario FROM mensagens ORDER BY id DESC LIMIT 20;
SHOW CREATE TABLE mensagens;
```

## Kubernetes: imagens e Secrets

Com o contexto Docker/Kubernetes Desktop kubeadm selecionado, o build Compose anterior disponibiliza imagens no engine local. imagePullPolicy: IfNotPresent permite usar as tags locais. Confirme que são Linux e que todos os três builds terminaram. Se houver ImagePullBackOff com imagens apenas no Docker, o cluster usa outro armazenamento de imagens: importe-as com a ferramenta do provisionador ou use um registry acessível aos nós.

```powershell
docker image ls --filter reference=dio-*
kubectl kustomize k8s
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/create-secret.ps1
kubectl apply --dry-run=server -k k8s
kubectl apply -k k8s
kubectl -n mensagens rollout status statefulset/mysql --timeout=300s
kubectl -n mensagens rollout status deployment/backend --timeout=180s
kubectl -n mensagens rollout status deployment/frontend --timeout=180s
kubectl -n mensagens get pods,svc,pvc
kubectl -n mensagens port-forward service/frontend 8081:8080
```

Em outro terminal, abra http://localhost:8081 e rode:

```powershell
python scripts/smoke.py --url http://localhost:8081 --lifecycle k8s
kubectl -n mensagens exec deployment/backend -- curl --fail http://127.0.0.1:8080/health/live
kubectl -n mensagens exec deployment/backend -- curl --fail http://127.0.0.1:8080/health/ready
kubectl -n mensagens exec -it mysql-0 -- mysql -u app -p meubanco
```

Para inspeção independente use port-forward temporário do backend em outro terminal (`kubectl -n mensagens port-forward service/backend 8082:8080`) e `Invoke-RestMethod http://localhost:8082/health/ready` e /health/live. Isso não altera o Service interno. Reinicie o port-forward se o Pod ao qual ele se conectou for substituído por um rollout.

O script de Secret cria namespace e app-secrets usando apenas as duas senhas de .env. Não versiona manifest com credenciais. Se o Secret já existe, ele para para evitar uma rotação acidental incompatível com o volume inicializado. Para rotação planejada, altere a senha no MySQL com cliente administrativo interativo, atualize .env/Secret por arquivo protegido e reinicie o Deployment backend; coordenar essas etapas evita indisponibilidade. Alterar env ou Secret **não altera** senhas já gravadas no MySQL.

### Registry opcional (não executado automaticamente)

Substitua REGISTRY e USUARIO pelos seus valores; pode haver custo conforme o serviço. Não publique sem autorização:

```powershell
docker login REGISTRY
docker tag dio-frontend:1.0.1 REGISTRY/USUARIO/dio-frontend:1.0.1
docker tag dio-backend:1.0.0 REGISTRY/USUARIO/dio-backend:1.0.0
docker tag dio-mysql:1.0.0 REGISTRY/USUARIO/dio-mysql:1.0.0
docker push REGISTRY/USUARIO/dio-frontend:1.0.1
docker push REGISTRY/USUARIO/dio-backend:1.0.0
docker push REGISTRY/USUARIO/dio-mysql:1.0.0
```

Edite images em k8s/kustomization.yaml: mantenha name e adicione newName com o nome completo correspondente no registry. Para registry privado, crie imagePullSecret fora do Git e referencie imagePullSecrets nos três Pod templates. Cada nó precisa conseguir baixar as três imagens.

### Ingress e TLS opcionais

k8s/ingress/ingress.yaml usa mensagens.example.com e ingressClassName nginx como exemplos. Instale separadamente um controller **mantido e compatível** com a IngressClass escolhida e atualize esse campo. Docker Desktop não instala um controller por estes manifests. A API Ingress é genérica; o nome nginx não instala nem garante suporte de qualquer implementação.

Configure DNS do domínio real para o endereço do controller (em teste local, arquivo hosts e endereço que o controller expõe). Provisionar um LoadBalancer em nuvem pode gerar custo. Para TLS, obtenha certificado/chave válidos e crie:

```powershell
kubectl -n mensagens create secret tls mensagens-tls --cert=CAMINHO/fullchain.pem --key=CAMINHO/privkey.pem
kubectl apply -f k8s/ingress/ingress.yaml
```

Ou instale cert-manager e configure Issuer/ClusterIssuer e renovação com seu provedor; não estão incluídos. Troque hosts e certificado conjuntamente. Só a rota / do frontend é exposta; /api passa pelo Nginx.

## Schema e persistência

database/init.sql cria meubanco e mensagens sem DROP/TRUNCATE: id INT PRIMARY KEY AUTO_INCREMENT; nome VARCHAR(100), email VARCHAR(255), comentario VARCHAR(1000), todos NOT NULL, InnoDB/utf8mb4.

Scripts em /docker-entrypoint-initdb.d são executados **somente quando o diretório de dados está vazio**. IF NOT EXISTS não migra tabelas antigas e não adiciona AUTO_INCREMENT a um schema existente. Variáveis MYSQL_* também só inicializam usuários/senhas no primeiro boot.

Para alterações futuras, mantenha migrações SQL versionadas (ALTER TABLE), faça backup com teste de restauração, revise compatibilidade, aplique uma única vez no banco existente com usuário de manutenção e registre a versão aplicada. Para aplicar manualmente SQL, abra o cliente root interativo (`docker compose exec mysql mysql -u root -p meubanco` ou equivalente kubectl). Não apague o volume para atualizar schema. Não use conta root no backend. Backups devem ficar fora da VM e ser protegidos; valide a restauração em banco separado antes de qualquer operação destrutiva.

## Diagnóstico

- Conexão/503: confira docker compose ps, docker compose logs backend mysql e kubectl -n mensagens logs deployment/backend. Confira DB_HOST, Secret, usuário app e schema. Senha alterada no .env não muda o usuário em um volume existente.
- Nginx/rotas: nginx -t, logs do frontend, POST /api/mensagens com Content-Type application/json; não remova /api do proxy_pass. Erro 413 significa corpo acima do limite. PHP 404/405 indica rota/método divergente.
- Imagens: ImagePullBackOff/ErrImagePull exigem conferir nome, tag, disponibilidade no engine do cluster, registry e imagePullSecrets. Build não envia imagens a registries.
- Probes: kubectl -n mensagens describe pod NOME e kubectl -n mensagens get events --sort-by=.lastTimestamp. Startup do MySQL permite até cinco minutos. Falha de readiness retira endpoints sem reiniciar PHP; falha de liveness reinicia container.
- Services: kubectl -n mensagens get endpointslices e get svc. Selectors app devem coincidir com labels. Teste a API pelo port-forward do frontend, garantindo passagem por Service backend e proxy.
- PVC Pending: kubectl -n mensagens describe pvc data-mysql-0 e kubectl get storageclass. Verifique classe padrão, provisionador, capacidade e eventos do nó. Não troque para armazenamento temporário para contornar o problema.
- Docker indisponível: abra Docker Desktop, aguarde engine Linux e execute docker version. Confira WSL 2/virtualização. Kubernetes indisponível: confira contexto, habilitação no Desktop e kubectl cluster-info.
- OOMKilled: inspecione describe/logs --previous e ajuste memória do Docker/requests/limits com medições. Não aumente réplicas de MySQL: este banco é uma instância única sem replicação.

## Atualização e rollback

Use tags novas a cada release; evite reconstruir a mesma tag com conteúdo diferente. Exemplo, construa frontend/backend 1.0.2, disponibilize-as no engine/registry e atualize newTag em k8s/kustomization.yaml:

```powershell
docker build -t dio-frontend:1.0.2 ./frontend
docker build -t dio-backend:1.0.2 ./backend
kubectl diff -k k8s
kubectl apply -k k8s
kubectl -n mensagens rollout status deployment/frontend
kubectl -n mensagens rollout status deployment/backend
kubectl -n mensagens rollout history deployment/backend
kubectl -n mensagens rollout undo deployment/backend
kubectl -n mensagens rollout undo deployment/frontend
```

Depois do undo, alinhe as tags no Kustomize para que o próximo apply não reverta o rollback. No Compose, ajuste image/build para a versão escolhida e rode up -d --build --wait; para voltar use a imagem anterior e evite reconstruí-la. Mudanças de schema exigem estratégia própria; rollback de Deployment não desfaz dados/migrações. Atualização de versão principal MySQL exige procedimento de upgrade/backup do fornecedor.

## Remoção e preservação dos dados

Compose, limpeza normal (mantém volume):

```powershell
docker compose down
# Voltar: docker compose up -d --wait
```

Kubernetes, limpeza normal mantendo namespace, Secrets e PVC:

```powershell
kubectl -n mensagens delete deployment frontend backend
kubectl -n mensagens delete statefulset mysql
kubectl -n mensagens delete service frontend backend mysql
# Voltar: kubectl apply -k k8s
```

Não use delete -k k8s para limpeza normal: inclui o Namespace e exclui os PVCs contidos nele. Retain no StatefulSet não protege contra exclusão explícita do PVC ou Namespace.

**Exclusão definitiva, somente após backup e confirmação consciente:**

```powershell
docker compose down --volumes
# OU, para os dados do cluster:
kubectl delete namespace mensagens
```

Com reclaimPolicy Delete, apagar PVC/Namespace costuma remover o armazenamento físico. Reset/factory reset do Desktop também pode destruir volumes e imagens.

## Limites para produção

Este é um deploy reproduzível de estudo, não uma declaração de prontidão para produção. Uso real exige domínio, TLS/renovação, rotação de credenciais, proteção contra abuso/rate limiting conforme a exposição pública, backups externos e restauração testada, monitoramento/alertas, coleta/retenção segura de logs e política de atualização de imagens. MySQL de uma réplica em disco local não oferece alta disponibilidade. Planeje banco gerenciado ou replicação/operador com failover e recuperação, capacidade, políticas de rede e estratégia de disaster recovery. Não foram criados recursos pagos nem feita publicação externa.

Referências técnicas: [imagem PHP oficial](https://hub.docker.com/_/php), [MySQL oficial e inicialização](https://hub.docker.com/_/mysql), [StatefulSets/PVC](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/), [probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/).
