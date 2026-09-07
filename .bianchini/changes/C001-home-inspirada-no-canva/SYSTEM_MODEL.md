---
{
  "capabilities": [{"id":"native_home_entry","owner":"home_experience"}],
  "contracts": [{"id":"published_home_content","provider":"home_experience","consumers":[]}],
  "data": [],
  "effects": [],
  "integrations": [],
  "interfaces": [],
  "invariants": [{"id":"no_home_draft_flash","statement":"A Home publica so renderiza depois que as configuracoes publicadas estiverem prontas."}],
  "journeys": [],
  "modules": [{"id":"home_experience","owns":["homepage_visual_content"]}],
  "ownership": [{"id":"homepage_visual_content","owner":"home_experience"}],
  "schema_version": 1
}
---
# Modelo do sistema

`home_experience` apresenta a entrada nativa e recebe conteúdo publicado pelas configurações já existentes. O editor altera somente conteúdo visual; navegação, autenticação e catálogo continuam fora desse módulo.
