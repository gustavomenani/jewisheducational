---
{
  "actual": "Após o deploy, a Home pública voltou a exibir hero antigo, conteúdo de teste, apresentação Canva e seções que a cliente havia removido ou deixado em rascunho.",
  "created_at": "2026-09-07T15:52:59+00:00",
  "docviva": null,
  "docviva_before": {
    ".bianchini/current/ARCHITECTURE.md": "1a303e5e11cc8ffb4b5b57d1e9d6ca44f85f7ba687a05fc04004f171e1266cb0",
    ".bianchini/current/SYSTEM_MODEL.md": "9d6fa478d66dc1a1bca209349b0670a768806158d138048e70fbe56393ad958a",
    ".bianchini/current/specs/MANIFEST.json": "8fe693a685236415f33fea34c70ddc1ce4516e1a02f2df031c3cdf4c972f1be3"
  },
  "docviva_contract": 1,
  "eliminated_hypotheses": [
    "Os valores mostrados estão publicados no banco: eliminada porque /api/settings retorna home_topics_show=false, block_recent_show=false, home_benefits_show=false e não retorna home_canva_url."
  ],
  "environment": "Produção Firebase, jewisheducationalresources.org, build publicado em 2026-09-04; evidências visuais da cliente em 2026-09-07.",
  "events": [
    {
      "at": "2026-09-07T15:57:22+00:00",
      "event": "reproduced",
      "evidence": "Produção /api/settings em 2026-09-07 retorna home_topics_show=false, block_recent_show=false, home_benefits_show=false e não retorna home_canva_url; captura da cliente mostra tópicos, recentes e Canva visíveis. A Home usa fallbacks true quando settings estão vazias e APPEARANCE_DEFAULTS contém o Canva.",
      "fingerprint": "83e00604c9e49f0a5ff77b1f024bb619bce53147cd5d99dfe74caffffc0b5116",
      "proof_id": ""
    },
    {
      "at": "2026-09-07T15:57:55+00:00",
      "event": "diagnosed",
      "evidence": "frontend/src/stores/index.js captura qualquer erro, aplica tema vazio e marca ready; HomeView settingVisible usa fallback true e homeCanvaSource usa APPEARANCE_DEFAULTS; produção contradiz o conteúdo mostrado.",
      "fingerprint": "83e00604c9e49f0a5ff77b1f024bb619bce53147cd5d99dfe74caffffc0b5116",
      "proof_id": ""
    },
    {
      "at": "2026-09-07T16:01:01+00:00",
      "event": "red",
      "evidence": "RED exit 1: a Home não oferece retry seguro, não mantém estado fail-closed e o tema ainda contém Canva público como default.",
      "fingerprint": "bc920be2ccfea6aecee7ce10a26695d4eb4377ce6df292879773772ad0b2428c",
      "proof_id": "proof-dd4b374bcec3e79a062c4e5cd631e574"
    },
    {
      "at": "2026-09-07T16:01:10+00:00",
      "event": "fixing",
      "evidence": "Fix mínimo: remover URL Canva dos defaults, não liberar ready em falha de settings, tentar duas cargas de 15s e oferecer retry sem renderizar defaults antigos.",
      "fingerprint": "bc920be2ccfea6aecee7ce10a26695d4eb4377ce6df292879773772ad0b2428c",
      "proof_id": ""
    },
    {
      "at": "2026-09-07T16:02:18+00:00",
      "event": "green",
      "evidence": "GREEN exit 0: 3/3; bootstrap permanece fechado sem settings publicadas, retry existe e Canva não possui URL padrão.",
      "fingerprint": "377adace3132b4a5785e9e56f2b0f7c87bc255be8b45e58066dc6484a0239d05",
      "proof_id": "proof-008fa970bdfbb016afdd9e1c60a255e4"
    },
    {
      "at": "2026-09-07T16:09:44+00:00",
      "event": "regression_checked",
      "evidence": "Release verification passed; produção confirma flags da Home false, Canva vazio, zero seções v2 na Home e zero materiais de teste visíveis.",
      "fingerprint": "377adace3132b4a5785e9e56f2b0f7c87bc255be8b45e58066dc6484a0239d05",
      "proof_id": "proof-8dfa6500bff579933ef31e486191c1f3"
    },
    {
      "at": "2026-09-07T16:13:33+00:00",
      "event": "documented",
      "evidence": "Home real recarregada no navegador em viewport móvel: somente cabeçalho e área vazia; nenhum Canva, cards, tópicos, recentes ou contato; console sem warnings/erros. API pública confirma configurações ocultas e materiais 101/102 ausentes.",
      "fingerprint": "377adace3132b4a5785e9e56f2b0f7c87bc255be8b45e58066dc6484a0239d05",
      "proof_id": ""
    }
  ],
  "expected": "A Home pública mostra somente configurações e conteúdo explicitamente publicados; o Canva não aparece por padrão e pode ser removido ao limpar seu campo.",
  "experiments": [
    "Comparar /api/settings de produção com a captura e rastrear settings.load -\u003e catch -\u003e ready=true -\u003e settingVisible fallback/APPEARANCE_DEFAULTS."
  ],
  "finished_at": "2026-09-07T16:34:03+00:00",
  "green": "GREEN exit 0: 3/3; bootstrap permanece fechado sem settings publicadas, retry existe e Canva não possui URL padrão.",
  "hypotheses": [
    "A Home reaparece com conteúdo antigo quando GET /settings falha ou excede 8 segundos, pois o store marca ready=true com settings vazias e os componentes ativam defaults visuais; o Canva aparece porque existe como default de código."
  ],
  "id": "D001-impedir-que-conteudo-de-rascunho-e-apresentacao",
  "neighboring_regressions": [
    "Fluxos protegidos do editor, publicação, categorias, materiais, Canva, Google Slides e carregamento público permaneceram verdes; 103 testes backend, 153 frontend e gate de release aprovados."
  ],
  "objective": "Impedir que conteúdo de rascunho e apresentação Canva opcional reapareçam na Home publicada",
  "origin_evidence": null,
  "origin_refs": null,
  "reason": "A cliente aprovou substituir a Home por um novo layout nativo baseado no Canva; a proteção contra conteúdo de rascunho e embed será incorporada e homologada na mudança de redesign.",
  "red": "RED exit 1: a Home não oferece retry seguro, não mantém estado fail-closed e o tema ainda contém Canva público como default.",
  "regression_contract": {
    "argv": [
      "node",
      "--test",
      "frontend/src/views/HomeView.copy.test.js"
    ],
    "failure_pattern": "public layout waits for published settings instead of flashing legacy defaults",
    "test_file": "frontend/src/views/HomeView.copy.test.js",
    "test_sha256": "30089eda89c0afc53aa4855a522e1bd707bdf152424494428f3cb4000ac0d1c1"
  },
  "relation": null,
  "residual_risk": "A limpeza de dados está ativa em produção e foi validada visualmente, mas a proteção fail-closed e a remoção do Canva padrão ainda estão somente no release candidate local; até esse código ser publicado, uma falha longa de /settings pode reexibir defaults antigos.",
  "root_cause": "Falha aberta no bootstrap de configurações: erro/timeout do GET /settings permite renderizar a Home com settings vazias, reativando seções padrão; adicionalmente home_canva_url foi preenchido no APPEARANCE_DEFAULTS, tornando uma demonstração opcional conteúdo público automático.",
  "schema_version": 1,
  "stage": "documented",
  "status": "escalated",
  "updated_at": "2026-09-07T16:13:33+00:00"
}
---

# Debug D001-impedir-que-conteudo-de-rascunho-e-apresentacao

Impedir que conteúdo de rascunho e apresentação Canva opcional reapareçam na Home publicada
