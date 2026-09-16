FROM mintplexlabs/anythingllm:latest

USER root
COPY astra-next-poc/deployment/bootstrap.sh /usr/local/bin/astra-next-bootstrap.sh
RUN chmod +x /usr/local/bin/astra-next-bootstrap.sh

ENV STORAGE_DIR=/app/server/storage
EXPOSE 3001

USER anythingllm
ENTRYPOINT ["/usr/local/bin/astra-next-bootstrap.sh"]
