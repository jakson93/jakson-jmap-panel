# JMAP

Painel Grafana para POPs, equipamentos e rotas de transporte.

A versão 1.4.0 preserva o monitoramento original e moderniza cards, rótulos e rotas. A topologia agrupa equipamentos por POP: selecione um POP para expandir; o inventário mantém todas as ligações e métricas acessíveis. No modo de edição é possível arrastar itens, conectar equipamentos, organizar grupos e ajustar desvios, com desfazer, refazer e cancelar.

Em Visualização, configure rótulos inteligentes, detalhados ou ao passar o mouse, contraste do mapa e traçado da topologia. Curvas automáticas não substituem pontos manuais nem caminhos geográficos.

Depois de aplicar um layout, salve o dashboard no Grafana para manter as alterações. Novas ligações precisam de métricas configuradas em Cadastro de Rotas.

A topologia permite representar POPs com ícones (Datacenter, OLT, SW, Torre ou URL), mantendo o mesmo ícone do Cadastro de POP e do mapa. O cadastro original de rotas, interfaces, trunks e sinais continua compartilhado. Edições em campos diferentes são combinadas; conflitos são sinalizados.

Em Focos de calor, ative opcionalmente a consulta pública INPE de detecções próximas de POPs e segmentos de rotas geográficas, com distância e período configuráveis. Desligado por padrão, sem chave de API ou notificações. Detecção de calor não confirma incêndio nem interrupção da rede.

[Guia dos focos de calor](https://github.com/jakson93/jakson-jmap-panel/blob/codex/mapa-topologia/docs/FOCOS-DE-CALOR.md)

[Guia de teste e reversão](https://github.com/jakson93/jakson-jmap-panel/blob/codex/mapa-topologia/docs/TESTAR-E-REVERTER.md)

[Repositório](https://github.com/jakson93/jakson-jmap-panel)
