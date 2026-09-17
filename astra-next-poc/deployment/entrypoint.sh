#!/bin/bash
set -u

/usr/local/bin/astra-next-bootstrap.sh &
BOOT_PID=$!

if [ "${RUN_KNOWLEDGE_ROUTING_AUDIT:-false}" = "true" ]; then
  echo "[ASTRA_NEXT_ENTRYPOINT] knowledge_routing_audit_start gate=ASTRA-NEXT-08"
  AUDIT_RC=0
  node /opt/astra-next-benchmark/run_knowledge_routing_audit.js || AUDIT_RC=$?
  echo "[ASTRA_NEXT_ENTRYPOINT] knowledge_routing_audit_complete rc=${AUDIT_RC}"
else
  echo "[ASTRA_NEXT_ENTRYPOINT] knowledge_routing_audit_skipped run=false"
fi

wait_for_api_stable() {
  local ready=false
  for i in $(seq 1 150); do
    if curl -fsS http://127.0.0.1:3001/api/ping >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  if [ "$ready" = "true" ]; then
    sleep 15
    return 0
  fi
  return 2
}

if [ "${RUN_GROUNDED_CREATIVE_QA:-false}" = "true" ]; then
  echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_wait_for_api gate=ASTRA-NEXT-09"
  if wait_for_api_stable; then
    echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_start gate=ASTRA-NEXT-09 api_stable=true"
    CREATIVE_RC=0
    node /opt/astra-next-benchmark/run_grounded_creative_output_qa.js || CREATIVE_RC=$?
    echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_complete rc=${CREATIVE_RC}"
  else
    echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_complete rc=2 reason=api_not_ready"
  fi
else
  echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_skipped run=false"
fi

if [ "${RUN_CREATIVE_GATEWAY_QA:-false}" = "true" ]; then
  echo "[ASTRA_NEXT_ENTRYPOINT] creative_gateway_qa_start gate=ASTRA-NEXT-10"
  GATEWAY_RC=0
  node /opt/astra-next-poc/benchmark/run_creative_gateway_enforcement_qa.js || GATEWAY_RC=$?
  echo "[ASTRA_NEXT_ENTRYPOINT] creative_gateway_qa_complete rc=${GATEWAY_RC}"
else
  echo "[ASTRA_NEXT_ENTRYPOINT] creative_gateway_qa_skipped run=false"
fi

if [ "${RUN_CREATIVE_HTTP_GATEWAY_QA:-false}" = "true" ]; then
  echo "[ASTRA_NEXT_ENTRYPOINT] creative_http_gateway_qa_wait_for_api gate=ASTRA-NEXT-11"
  if wait_for_api_stable; then
    echo "[ASTRA_NEXT_ENTRYPOINT] creative_http_gateway_qa_start gate=ASTRA-NEXT-11 api_stable=true"
    HTTP_GATEWAY_RC=0
    node /opt/astra-next-poc/benchmark/run_creative_http_gateway_qa.js || HTTP_GATEWAY_RC=$?
    echo "[ASTRA_NEXT_ENTRYPOINT] creative_http_gateway_qa_complete rc=${HTTP_GATEWAY_RC}"
  else
    echo "[ASTRA_NEXT_ENTRYPOINT] creative_http_gateway_qa_complete rc=2 reason=api_not_ready"
  fi
else
  echo "[ASTRA_NEXT_ENTRYPOINT] creative_http_gateway_qa_skipped run=false"
fi

wait "$BOOT_PID"
exit $?
