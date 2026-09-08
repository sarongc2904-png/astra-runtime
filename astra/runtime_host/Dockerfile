FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 AS node_runtime

FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
COPY --from=node_runtime /usr/local/ /usr/local/

ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STRATEGY_F_PYTHON=/usr/local/bin/python3 \
    PORT=10000

WORKDIR /app
COPY astra/runtime_host/package.json astra/runtime_host/package-lock.json ./
COPY astra/runtime_host/requirements-runtime.txt /tmp/requirements-runtime.txt
RUN npm ci --omit=dev --ignore-scripts \
    && python3 -m pip install --no-cache-dir -r /tmp/requirements-runtime.txt
COPY astra/run_gpt_api.js ./astra/run_gpt_api.js
COPY astra/src ./astra/src
COPY astra/config ./astra/config
COPY astra/methods/registry.json ./astra/methods/registry.json
COPY astra/design_knowledge_audit/gap_analysis.json ./astra/design_knowledge_audit/gap_analysis.json
COPY astra/design_knowledge_audit/design_method_inventory.json ./astra/design_knowledge_audit/design_method_inventory.json
COPY astra/design_knowledge_audit/creative_director_readiness.json ./astra/design_knowledge_audit/creative_director_readiness.json
COPY knowledge.js c3.js marketing_os.js rag_answer_policy_runtime.js classifier_decision_cache.js retrieval_strategy_f.py ./
COPY rag_retrieval_refinement/corpus_snapshot.json ./rag_retrieval_refinement/corpus_snapshot.json

RUN groupadd --gid 1000 astra \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin astra \
    && mkdir -p /app/astra/.runtime_state \
    && chown -R astra:astra /app

USER astra:astra
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]

