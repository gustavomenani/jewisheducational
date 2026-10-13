# Canva em Settings e nas outras páginas

Desde 13/10/2026, o campo **Canva design link** volta a trocar a página inicial pelo design informado. Cole o link em **Admin → Settings → Canva home** e clique em **Save settings**. A biblioteca, a busca e os downloads continuam acessíveis por **Browse materials**. Veja [Trocar a página inicial pelo link do Canva](canva-home-link.md) para o uso atual.

Textos, imagens e botões desse design são editados no Canva. As áreas funcionais e o tema da biblioteca continuam no editor do site e em Appearance. Os registros de recuperação abaixo preservam o histórico das publicações.

## Uso do Canva

Para trocar o design da página inicial:

1. Abra **Admin → Settings → Canva home**.
2. Cole o link público em **Canva design link**.
3. Clique em **Save settings**.

Para inserir um design na biblioteca ou em outra página:

1. Use **Add Canva to the library** em Settings, ou abra **Edit site**.
2. Em **Pages**, escolha **Library**, **Resource Page**, **Download Page**, **Login & account pages** ou **Header & Footer**.
3. Na área desejada, clique em **Add section here → Canva**.
4. Cole o link público e clique em **Apply Canva link**.
5. Ajuste **Height** se necessário e clique em **Publish**.

Cada página usa seu próprio bloco. O link da home não configura automaticamente os demais blocos. Os textos, cores e links de botões dentro do design são editados no Canva. As ferramentas de busca, conta e download continuam sendo componentes do site.

## Recuperação da publicação de 9 de outubro de 2026

A versão `a75b14077da711b4` tinha preservado o link da home e os blocos Canva no banco e no editor. Seu módulo `SettingsView-X5Vv4P8m.js` não tinha o campo `home_canva_url`. A mesma publicação também continha mudanças novas no painel de materiais que não estavam no repositório.

A recuperação preserva todos os assets existentes. Compila a tela Settings a partir do código desta branch, conecta suas dependências aos módulos publicados e acrescenta um import map ao HTML. O mapa direciona somente o módulo Settings para sua versão corrigida. A função `api` mantém seu código e configuração; apenas seu arquivo `generated/index.html` recebe o mesmo HTML do Hosting.

O utilitário reproduz essa etapa a partir de uma cópia da publicação e de um módulo Settings compilado:

```sh
node scripts/restore-admin-settings.js <dist-publicado> <SettingsView-compilado.js> <dist-restaurado>
node --test scripts/restore-admin-settings.test.js
```

O utilitário não publica nem acessa credenciais. Ele recusa dependências ausentes, exports incompatíveis, import maps inválidos ou concorrentes e um diretório de saída dentro da entrada. Um mapa existente é preservado, com apenas a entrada de Settings atualizada. A publicação deve conservar a configuração atual do Hosting e o ambiente da função. Não substitua o backend pela versão antiga do repositório.

A cópia original deve continuar disponível até a conferência. Antes de uma futura publicação completa, reúna os códigos dos dois desenvolvedores e integre a tela Settings desta branch. Uma compilação normal usa o componente diretamente e dispensa o import map de recuperação.

Validação: build e gate `verify:release`; testes do utilitário; testes do backend atualmente publicado; reprodução local usando os assets publicados. No navegador, o campo esteve ausente antes da recuperação e presente depois. Foram verificados salvar/recarregar Settings, aplicar/publicar Canva na biblioteca e aplicar/publicar Canva na página de material. Essas alterações de teste usam banco local isolado. A conferência pública em produção não substitui um login administrativo real.

Publicação confirmada: Hosting `35fb71ba22d6edba`, API `api-00084-buv`. Todos os 109 arquivos anteriores fora do HTML mantêm seus hashes. A configuração do Hosting, as variáveis e os secrets da API permanecem iguais. O gate completo passou com 274 testes; o backend publicado passou com 117 testes.
