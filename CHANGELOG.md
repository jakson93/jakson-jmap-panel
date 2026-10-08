# Changelog

## 1.5.0 (Homologação — 2026-10-08)

- Corrige a escala do histórico RX após quedas: todo o histórico fornecido permanece visível, inclusive valores anteriores a −40 dBm. Acrescenta leitura anterior à última queda observada, faixa crítica, lacunas explícitas e gráfico responsivo.
- Combina fragmentos históricos por item e horário, respeita o período selecionado e atualiza o card aberto com a consulta atual.
- Mostra RX muito baixo em vermelho no card de interfaces e identifica TX/RX ausente como sem dados.
- Restringe focos de calor exclusivamente a segmentos geográficos de fibra; POPs isolados e trajetos com pontos coincidentes não geram exposição. Adiciona símbolo de fogo.
- Acrescenta camada opcional de avisos de chuva intensa, acumulado de chuva e tempestade do INMET, com nuvem/chuva sobre o cruzamento do trajeto com a área do aviso. Respeita vigência e buracos de polígonos.
- Compartilha consultas ambientais entre painéis, com limites, timeout, cache e tratamento de respostas antigas, cobertura parcial e indisponibilidade.
- Mantém ID, cadastro, métricas, trunks, status e versões anteriores. Sem notificações ou alterações na produção.

## 1.4.0 (Homologação — 2026-10-08)

- Acrescenta camada opcional de focos de calor INPE próximos de POPs e segmentos geográficos de rotas, com raio, período e atualização configuráveis, distâncias e detalhes. Desligada por padrão, sem credenciais, backend ou notificações.
- Distingue consulta indisponível, antiga ou parcial de ausência de focos. Limita consultas e elementos para controlar o custo no navegador.
- Apresenta POPs como ícones na topologia, com presets e URL no editor; mantém a opção de cards e o mesmo cadastro/ícone do mapa.
- Unifica resolução de ícones nos dois modos e cadastro original, incluindo URLs legadas e Grafana em subdiretório.
- Atualiza coordenadas e zoom do mapa ao mudar as opções originais; captura a câmera do próprio painel, sem depender do último mapa de outro painel.
- Salva rotas e POPs por ID, combinando alterações não conflitantes de métricas, vínculos e layout. Impede sobrescritas em conflitos e remoções durante a edição.
- Combina atualizações do cadastro com o rascunho do layout e seu histórico de desfazer/refazer, preservando todas as opções originais.
- Adiciona testes de sincronização, distâncias, respostas assíncronas e falhas, além de demonstração com rede sintética e consulta real ao INPE.

## 1.3.1 (Homologação — 2026-10-08)

- Corrige a compatibilidade de rotas antigas do mapa sem associação exata a POPs: desenha extremidades com vínculo pendente sem inventar equipamentos.
- Mostra interfaces, trunks, sinais RX/TX e métricas adicionais no resumo lateral da topologia, usando o cadastro existente.
- Adiciona acesso direto para vincular a mesma rota a POPs/equipamentos, preservando suas métricas e todo o traçado geográfico ao editar pela topologia.
- Permite mover extremidades provisórias e manter desvios com desfazer/refazer/cancelar.
- Acrescenta demonstração e testes de regressão para configurações antigas.

## 1.3.0 (Homologação — 2026-10-08)

- Remodela o card flutuante de falha e oferece lista estável de incidentes, duração observada, última coleta, extremidades e ações de localizar/detalhar.
- Distingue manutenção, dados antigos e ausência de leitura; configura a idade máxima da amostra sem alterar os itens monitorados.
- Exibe impacto potencial de dependências cadastradas e impede ciclos.
- Adiciona filtros combináveis por busca/região, POP, tipo e status, inclusão de dependências e visões salvas no painel.
- Calcula disponibilidade ponderada pelo tempo, cobertura de dados, quedas e recuperação com o histórico recebido. Lacunas e eventos parciais são identificados.
- Acrescenta alinhamento, grade, bloqueio de posições, portas e validação de ocupação no editor com desfazer/refazer.
- Limita elementos desenhados à área visível, com margem, e evita duplicação dos PNGs, mantendo URLs dos presets antigos.
- Preserva o ID, métricas, trunks, históricos e configurações anteriores. Não inclui integração de notificações.

## 1.2.0 (Homologação — 2026-10-07)

- Exibe métricas de rota habilitadas, métricas extras e métricas das interfaces no card completo, junto dos trunks e histórico RX.

- Agrupa a topologia por POP, com expansão individual, inventário completo e indicação de links internos.
- Mantém as extremidades reais de equipamentos ao recolher os grupos; curvas e traçados ortogonais são apenas apresentação.
- Oferece organização dos grupos em rascunho e move equipamentos junto com seu POP, com desfazer/cancelar.
- Adiciona rótulos inteligentes com prioridade para falhas e redução de colisões no mapa; a apresentação detalhada permanece configurável.
- Reduz o destaque do fundo geográfico e moderniza os cards com tokens do tema Grafana, mantendo todos os indicadores, gráficos e trunks.
- Remove o redesenho React a cada 60 ms: animação por CSS, com suporte a movimento reduzido.
- Melhora foco, Tab e Escape nos detalhes e distingue sem dados de uma rota degradada no mapa.
- Amplia a demonstração com gráficos, observação, métricas personalizadas e interfaces de transporte.

## 1.1.0 (Homologação — 2026-10-07)

- Preserva o mapa original, detalhes de POPs/rotas, gráficos e incidentes, com rótulos e tipografia refinados.
- Adiciona topologia no fundo do tema, posições independentes e ligações entre equipamentos.
- Adiciona edição em rascunho, arraste, desvios, desfazer/refazer, aplicar e cancelar.
- Corrige leitura de múltiplos campos e arrays de valores do Grafana; estados sem leitura aparecem como sem dados.
- Preserva métricas ao editar rotas e inclui todos os ícones no pacote compilado.
- Inclui testes, dashboard demonstrativo e instruções de instalação em homologação e reversão.

## 1.0.0 (Unreleased)

Initial release.
