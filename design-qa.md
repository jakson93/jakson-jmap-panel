# Verificação visual — JMAP 1.1.0

Data: 07/10/2026. Escopo final: preservar a ideia completa do plugin original e modernizar os elementos dentro do mapa. A topologia permanece opcional. Esta é uma comparação de direção visual dentro desse escopo revisado, não uma reprodução literal dos mockups.

## Evidências

- Fontes visuais: conceitos 1 e 3 escolhidos pelo usuário, arquivos `exec-dcfffab7-af9d-4504-8f1c-f6b9b46e6799.png` e `exec-7cbd7071-8fea-4906-be94-e31b33423f45.png`, em `C:/Users/Jakson/.codex/generated_images/01a117e4-a300-7990-beff-7ac3fc6f4968/`. Referência adicional: `../references/flowbix-noc.jpg`.
- Implementação: Grafana OSS 12.3.1, dashboard `jmap-lab`, tema escuro, dados sintéticos.
- Capturas: [mapa](docs/images/jmap-mapa-final.png), [topologia](docs/images/jmap-topologia-final.png) e [cards](docs/images/jmap-cards-final.png).
- Comparação conjunta de fonte e implementação: `../references/comparacao-mapa.jpg`, `../references/comparacao-topologia.jpg`. Comparação focada nos indicadores: `../references/comparacao-cards.jpg`.
- Fontes: 1487 × 1058 px. Capturas principais: 1264 × 748 px; viewport de desktop correspondente, densidade 1. Para comparação, ambos os lados foram redimensionados proporcionalmente, sem esticar, em quadros de 900 px. Captura adicional do mapa a 640 × 900 px entregue nos outputs. Os estados e dados do conceito diferem dos da demonstração; não foi feita comparação pixel a pixel.

## Histórico e correções

1. [P1, resolvido] Estrutura externa com cabeçalho e KPIs contrariava a correção de escopo do usuário. Foi removida; o modo mapa utiliza novamente `MapView`, com incidentes, detalhes e gráficos originais. Evidência: mapa final sem cards externos.
2. [P1, resolvido] CSS do Leaflet sobrepunha os estilos do fundo e dos marcadores. A topologia passou a usar o fundo do tema, com cards e controles visíveis. Evidência: topologia final.
3. [P2, resolvido] Cards se sobrepunham no zoom reduzido. Dimensões e conteúdo agora acompanham a escala do zoom; enquadramento usa passos fracionários. Evidência: topologia final sem sobreposição na cena demonstrativa.
4. [P2, resolvido] Indicadores de equipamentos tinham valores pequenos e disposição muito longa. CPU, memória, temperatura e uptime configurados são exibidos em uma grade, com valores destacados, preservando métricas personalizadas e gráficos. Evidência posterior: cards finais com os quatro indicadores visíveis por equipamento.

## Superfícies revisadas

- Tipografia: fonte do tema Grafana, rótulos secundários menores que os valores, números tabulares, nomes com truncamento na topologia. Diferença intencional em relação à fonte ilustrada dos mockups.
- Espaçamento: controles ficam dentro da área do mapa; cards têm grade adaptável, bordas e espaçamento do tema; detalhes podem rolar em painéis menores.
- Cores: tokens do Grafana e cores já configuradas nas rotas; status acompanhado de texto. A demonstração usa OpenStreetMap; o provedor continua configurável.
- Imagens: ícones reais do repositório incluídos no pacote. Os ícones renderizados dos mockups foram substituídos pelos assets originais para preservar a identidade do plugin, conforme o escopo revisado.
- Conteúdo: nomes, status e unidades vêm das opções e consultas; dados demonstrativos estão identificados. Novas conexões sem métricas exibem “Sem dados”.

## Interações verificadas

Alternância mapa/topologia; abertura dos detalhes de POP e rota; painel de incidentes; CPU/memória/temperatura/uptime e gráficos; arraste de POP; conexão puxando entre equipamentos e via seletores; inserir e arrastar desvio; desfazer/refazer; cancelar e reabrir a edição sem a conexão descartada. Console da aba consultado: nenhum erro registrado na verificação final.

Validação técnica: TypeScript, lint sem erros, 10 testes unitários e build com verificação do módulo, manifesto e ícones. Avisos de APIs descontinuadas e tamanho de assets continuam documentados. O build/lint/testes unitários também passaram no primeiro commit da CI do PR #15.

## Limites e próximos testes

Sem achados visuais P0/P1/P2 pendentes no escopo demonstrado. Não foram verificadas todas as combinações de temas, provedores ou grandes redes. Após redimensionar a topologia, use Enquadrar se precisar reajustar o zoom. Como melhoria posterior, otimizar o tamanho dos PNGs originais sem alterar a identidade visual.

A homologação ainda deve verificar consultas reais, trunks efetivamente cadastrados e salvar/reabrir uma cópia do dashboard. Os testes E2E da matriz de versões do GitHub estavam em execução nesta entrega. O PR é rascunho, sem integração em produção.

final result: passed
