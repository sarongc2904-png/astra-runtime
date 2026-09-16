# ASTRA Next boundary

## Reused from off-the-shelf runtime

- agent lifecycle
- document ingestion and retrieval
- memory/session handling
- model/provider routing
- tool/MCP plumbing
- flow execution
- developer API
- user/workspace UI where applicable

## Preserved from ASTRA

- commercial knowledge and methods
- canonical business facts supplied by the user
- prohibited-claim rules
- evidence/provenance discipline
- campaign stage definitions
- business memory worth migrating
- benchmark/acceptance fixtures

## Kept external

- n8n for operational automation
- Supabase for CRM/business data where appropriate
- Meta/WhatsApp/email/calendar adapters

## Explicitly not migrated into the POC

- ASTRA custom provider retry wrapper
- ASTRA custom async Campaign360 job runtime
- ASTRA custom specialist lifecycle
- existing production routing
- autonomous external writes
