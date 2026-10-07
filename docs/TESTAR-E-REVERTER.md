# Testar JMAP 1.2.0 antes de produção

## Revisão visual 1.2.0

- A topologia começa com os POPs recolhidos. Selecione um POP e use **Expandir equipamentos**; **Expandir POPs** abre todos. As ligações internas permanecem no inventário e são desenhadas quando o grupo é expandido.
- Ao selecionar uma rota, o inspetor identifica os equipamentos reais de origem e destino. Recolher POPs não altera as associações nem as métricas.
- Em **Editar layout**, todos os equipamentos ficam disponíveis. **Organizar grupos** ajusta posições em rascunho; use **Desfazer** ou **Cancelar** para reverter. Mover um POP leva consigo equipamentos posicionados manualmente. Desvios manuais das rotas são mantidos.
- Em **Visualização**, **Rótulos dos POPs → Inteligente** reduz sobreposição e prioriza falhas. Há também somente nome, apresentação detalhada e hover. **Contraste do fundo → Original** mantém as cores do provedor.
- **Traçado na topologia** oferece curvas, linhas diretas e ortogonais para rotas sem pontos manuais. No editor, o caminho é exibido com seus pontos reais para permitir ajustes precisos.
- Confira CPU, memória, temperatura, uptime, métricas personalizadas, observações, RX/TX, tráfego, capacidade, incidentes, interfaces, trunks e histórico RX na homologação. A demonstração inclui exemplos desses detalhes.
- Nenhuma alteração foi feita no ID `jakson-jmap-panel`.

A branch `codex/mapa-topologia` preserva a visualização original do mapa e seus detalhes de POPs, rotas, incidentes, gráficos e trunks. A aparência dos rótulos e detalhes foi refinada dentro do mapa. A topologia é uma visualização alternativa, com edição em rascunho. O ID continua `jakson-jmap-panel`.

## Original preservado

A referência `backup/original-2026-10-07` aponta para o commit original `743a103`. A branch principal não é substituída pela versão de teste. Há também um ZIP do código original com `dist` e um bundle do histórico Git entregues separadamente.

Esse backup é do repositório. Antes de alterar qualquer servidor, guarde uma cópia da pasta do plugin atualmente instalada e exporte o JSON dos dashboards desse servidor. Dados e configurações do seu Grafana não estão incluídos no backup do repositório.

## Opção 1: Grafana de teste com Docker

Requer Git e Docker com Compose. Em uma pasta nova no computador ou servidor de homologação:

```bash
git clone --branch codex/mapa-topologia --single-branch https://github.com/jakson93/jakson-jmap-panel.git jmap-homolog
cd jmap-homolog
docker compose -f compose.homolog.yaml up -d
```

Abra <http://localhost:3011>. Entre com a conta de administrador da instância de teste e conclua o primeiro acesso do Grafana. A porta fica acessível apenas no próprio computador; para um servidor remoto, use o acesso local ou um túnel SSH autorizado. O volume `jmap-homolog-data` é separado do Grafana de produção.

Em **Dashboards**, abra **JMAP · Laboratório (dados demonstrativos)**. Ele usa apenas o TestData do Grafana, sem Zabbix e sem conexão com a rede real. O `dist` já está compilado; não é necessário instalar Node para testar.

O dashboard demonstrativo é provisionado por arquivo. Para testar salvamento, faça **Save as / Salvar como** com outro nome e UID e edite essa cópia. Assim o provisionamento não sobrescreve suas mudanças.

Para parar sem apagar os testes:

```bash
docker compose -f compose.homolog.yaml down
```

Para atualizar esta instalação de teste, depois de guardar suas mudanças locais:

```bash
git pull --ff-only
docker compose -f compose.homolog.yaml restart grafana
```

Recarregue o navegador com `Ctrl+Shift+R` após trocar o build: o Grafana mantém os arquivos do plugin em cache.

## Opção 2: Grafana próprio em homologação

Use uma instância separada, preferencialmente da mesma versão da produção. A verificação local desta entrega foi feita em **Grafana OSS 12.3.1**; o manifesto mantém o requisito original de Grafana **>=11.6.0**, mas isso não significa que todas as versões foram verificadas.

1. Faça backup da pasta instalada do plugin e dos dashboards.
2. Baixe a branch de teste. Copie **o conteúdo de `dist`** para a pasta de plugins da instância de homologação, dentro de `jakson-jmap-panel`. `plugin.json` e `module.js` devem estar diretamente nessa pasta.
3. Não deixe outra cópia do mesmo ID na pasta de plugins. Mantenha backups fora dela.
4. O pacote entregue não é assinado. Configure a permissão específica abaixo nessa instância e reinicie o serviço de homologação:

```ini
[plugins]
allow_loading_unsigned_plugins = jakson-jmap-panel
```

Se já houver outros IDs nesse campo, preserve-os e acrescente o JMAP. Em Docker, a configuração equivalente é `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=jakson-jmap-panel`.

Importe uma cópia do dashboard real na homologação e selecione as fontes de dados de teste. Não substitua o dashboard de produção durante essa validação.

## Como usar e o que testar

| Ação | Resultado esperado |
| --- | --- |
| Abrir um dashboard antigo sem `viewMode` | Abre no mapa original, com POPs, rotas, incidentes e detalhes existentes |
| Alternar Mapa / Topologia | Mapa usa coordenadas geográficas; topologia usa posições independentes e o fundo do tema Grafana |
| Editar layout → Mover | Arraste POPs no mapa; arraste POPs e equipamentos na topologia. Conexões acompanham ao soltar |
| Editar layout → Conectar | Puxe de um item até outro. Também é possível clicar nos dois itens ou usar Origem/Destino e Conectar itens |
| Conectar → Vincular rota existente | Associa extremidades preservando métricas, limites, trunks e desvios geográficos intermediários |
| Ajustar rota | Selecione a linha e clique novamente nela para criar um ponto; arraste o ponto; duplo clique remove |
| Desfazer / Refazer | Reverte e reaplica as mudanças do rascunho (até 50 estados) |
| Cancelar | Descarta o rascunho e mantém a configuração anterior |
| Aplicar alterações | Transfere o rascunho para as opções do painel; em seguida é necessário **salvar o dashboard no Grafana** |
| Salvar dashboard e reabrir | Posições, extremidades e desvios persistem |
| Abrir detalhes no mapa | Continua mostrando equipamentos, indicadores, gráficos e trunks configurados |

Para tornar uma visualização o padrão, escolha **Visualização → Modo de exibição** no editor do painel e salve o dashboard. Aplicar um layout também grava a visualização usada na edição.

Rotas antigas só têm extremidades inferidas quando as coordenadas coincidem com um único POP. Uma rota sem associação aparece no mapa, mas precisa ser vinculada para aparecer na topologia. Isso evita ligações inventadas por proximidade. Ligações entre equipamentos do mesmo POP compartilham a localização geográfica, então são melhor visualizadas na topologia.

Novas ligações começam sem métricas. Cadastre os itens da sua fonte de dados em **Cadastro de Rotas**; até lá, o status é **Sem dados**. O mapa e a topologia leem os dados retornados pelas consultas do painel. Não há alterações no Zabbix nem criação de links físicos na rede.

Confirme também atualização periódica, unidades de tráfego, limites de RX/TX, flapping, estado sem dados, ícones personalizados, zoom, painel em tela cheia e tamanho menor de painel. Os provedores de mapa continuam configuráveis; disponibilidade e exigência de chave dependem do provedor. A demonstração usa OpenStreetMap.

## Voltar ao original

Na homologação, restaure a pasta do plugin que você guardou e reinicie apenas esse Grafana. Reimporte o JSON original do dashboard caso também queira desfazer configurações salvas.

Para obter o código original do GitHub em outra pasta:

```bash
git clone --branch backup/original-2026-10-07 --single-branch https://github.com/jakson93/jakson-jmap-panel.git jmap-original
```

O `dist` dessa referência é o original do repositório. Para reverter uma instalação existente, prefira seu backup da pasta instalada, que também preserva eventuais personalizações locais.

## Validação de desenvolvimento

```bash
npm ci
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

Os testes de navegador usam `@grafana/plugin-e2e`: `npm run e2e` com um Grafana de teste ativo e `GRAFANA_URL` configurado quando a porta não for 3000. Nunca aponte esses testes para produção. A CI do pull request executa os testes automatizados; seu resultado deve ser conferido antes de integrar.

Referências oficiais: [configuração Docker](https://grafana.com/docs/grafana/latest/setup-grafana/configure-docker/) e [assinatura de plugins](https://grafana.com/developers/plugin-tools/publish-a-plugin/sign-a-plugin).
