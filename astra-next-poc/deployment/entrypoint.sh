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

if [ "${RUN_GROUNDED_CREATIVE_QA:-false}" = "true" ]; then
  echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_start gate=ASTRA-NEXT-09"
  CREATIVE_RC=0
  node /opt/astra-next-benchmark/run_grounded_creative_output_qa.js || CREATIVE_RC=$?
  echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_complete rc=${CREATIVE_RC}"
else
  echo "[ASTRA_NEXT_ENTRYPOINT] grounded_creative_qa_skipped run=false"
fi

wait "$BOOT_PID"
exit $?
