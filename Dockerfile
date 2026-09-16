FROM mintplexlabs/anythingllm:latest

USER root

COPY astra-next-poc/deployment/bootstrap.sh /usr/local/bin/astra-next-bootstrap.sh
RUN chmod +x /usr/local/bin/astra-next-bootstrap.sh

RUN mkdir -p /opt/astra-next-kb
COPY astra/methods/registry.json /opt/astra-next-kb/01-method-registry.json
COPY astra/ASTRA_03_KNOWLEDGE_METHOD_DISCOVERY_REPORT.md /opt/astra-next-kb/02-knowledge-method-discovery.md
COPY astra/ASTRA_03B_MULTI_DOMAIN_KNOWLEDGE_SOURCE_INGESTION_REPORT.md /opt/astra-next-kb/03-multi-domain-ingestion-report.md
COPY astra/src/router/knowledge_query_planner.js /opt/astra-next-kb/04-knowledge-query-planner.js
COPY astra/src/creative/creative_knowledge.js /opt/astra-next-kb/05-creative-knowledge.js
COPY astra/ASTRA_08A_DESIGN_KNOWLEDGE_COVERAGE_AUDIT_REPORT.md /opt/astra-next-kb/06-design-knowledge-audit.md
COPY astra/knowledge_gap_ingestion/extraction_qa.json /opt/astra-next-kb/07-meta-ads-extraction-qa.json
RUN chown -R anythingllm:anythingllm /opt/astra-next-kb && chmod -R a+rX /opt/astra-next-kb

ENV STORAGE_DIR=/app/server/storage
EXPOSE 3001

USER anythingllm
ENTRYPOINT ["/usr/local/bin/astra-next-bootstrap.sh"]
