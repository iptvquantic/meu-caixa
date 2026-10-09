#!/usr/bin/env bash
# Banco do Meu Caixa testado num Postgres real (local). Nunca toca na produção.
#   1) monta o banco como está na produção hoje e testa a segurança
#   2) grava uma cliente com histórico e tira uma "foto" exata dos dados
#   3) aplica cada migração nova (ainda não aplicada na produção) e testa de novo
#   4) roda TUDO outra vez (tem que ser idempotente) e confere que nenhum dado mudou
# Uso (dentro de dev/): npm run test:db
set -euo pipefail
cd "$(dirname "$0")"

PRODUCAO=01   # última migração já aplicada na produção — atualizar ao aplicar uma nova
DB=${MC_TEST_DB:-meucaixa_test}

# Postgres local: no container da sessão, liga o servidor e cria o usuário se precisar
if ! psql -X -d postgres -Atc 'select 1' >/dev/null 2>&1; then
  if command -v pg_ctlcluster >/dev/null && [ "$(id -u)" = 0 ]; then
    read -r ver cluster _ < <(pg_lsclusters -h | head -1)
    pg_ctlcluster "$ver" "$cluster" start 2>/dev/null || true
    sleep 1
    su postgres -c "createuser -s $(whoami)" 2>/dev/null || true
  fi
  psql -X -d postgres -Atc 'select 1' >/dev/null || { echo "❌ Postgres local indisponível (veja dev/README.md)"; exit 1; }
fi

export PGOPTIONS='-c client_min_messages=warning'
run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
apply() { run -f "$1" >/dev/null && echo "   aplicado: $1"; }

dropdb --if-exists "$DB" && createdb "$DB"
echo "1) produção hoje (schema + migrações até $PRODUCAO)"
apply test/supabase_stub.sql
apply schema.sql
NOVAS=()
for m in migrations/*.sql; do
  n=$(basename "$m" | cut -d_ -f1)
  if [[ "$n" > "$PRODUCAO" ]]; then NOVAS+=("$m"); else apply "$m"; fi
done
run -v fase="produção hoje" -f test/rls.sql

echo "2) cliente com histórico"
run -f test/dados.sql

echo "3) migrações novas: ${#NOVAS[@]}"
for m in "${NOVAS[@]}"; do
  apply "$m"
  run -v fase="após $(basename "$m" .sql)" -f test/rls.sql
done
run -f test/confere.sql
run -f test/estrutura.sql

echo "4) tudo de novo (idempotente)"
apply schema.sql
for m in migrations/*.sql; do apply "$m"; done
run -f test/confere.sql
run -v fase="rodando tudo de novo" -f test/rls.sql
run -f test/estrutura.sql
echo "✅ banco: tudo certo"
