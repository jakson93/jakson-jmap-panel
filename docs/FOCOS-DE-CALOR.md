# Focos de calor próximos da rede

## Ativar em homologação

1. Instale a versão 1.4.0 e confirme o ID `jakson-jmap-panel` e a versão na página do plugin do Grafana. Reinicie o contêiner após trocar o build e recarregue o navegador com Ctrl+Shift+R.
2. Edite uma cópia do dashboard. Nas opções do painel, abra **Focos de calor**, ative **Focos de calor próximos da rede** e configure distância, janela e atualização. Padrões: 5 km, 24 horas e 600 segundos. A janela máxima é 48 horas.
3. Aplique a edição do painel e salve o dashboard. No mapa, abra **Focos de calor** para ver a consulta, os focos mais próximos e o horário de detecção. Selecione um foco para ver as estruturas/rotas próximas e as distâncias; selecione um item da lista para localizar no mapa.
4. Confirme que os caminhos geográficos cadastrados correspondem ao percurso físico da rede. A detecção considera POPs e todos os segmentos válidos de `routes[].points`, inclusive rotas antigas sem associação. Coordenadas e desvios da topologia são independentes e não entram nesse cálculo. Equipamentos sem coordenadas próprias usam a localização do POP.

A demonstração **JMAP · Focos de calor INPE (rede demonstrativa)** consulta dados reais do INPE sobre uma rede sintética na região de Arujá/SP. Os nomes, equipamentos, rotas e métricas dessa rede são demonstrativos. Os focos variam ao longo do tempo; não são eventos fabricados nem indicam sua rede real. A ausência de focos no laboratório pode ser normal. Os testes E2E interceptam o serviço com cenários explicitamente simulados para reprodução determinística.

## Fonte, cobertura e limitações

Fonte: [Programa Queimadas / INPE — Dados Abertos](https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/). A camada pública `dados_abertos:focos_48h_br_todosats` é consultada por [WFS do INPE](https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/wfs?service=WFS&version=1.0.0&request=GetCapabilities), em GeoJSON / EPSG:4326. A consulta usa a região das coordenadas cadastradas, expandida pelo raio de atenção, e prioriza os registros recentes. Horários do INPE são GMT e exibidos no fuso do navegador. O tempo recente dessa camada não muda ao selecionar um período histórico nas métricas do Grafana.

Focos representam detecções de calor por satélite. Não confirmam incêndio, avanço do fogo, exposição real do cabo, interrupção, nem garantia de ausência de fogo. Passagens de satélite, nuvens, resolução espacial e frequência de publicação afetam a cobertura. Distâncias são aproximações sobre a esfera terrestre até o POP ou o segmento geográfico cadastrado, não medições de campo. A atualização do painel é uma nova consulta, não uma garantia de novas imagens.

Consulta limitada aos 2.000 focos mais recentes na região; atingido o limite, a cobertura é explicitamente marcada como parcial. O mapa mostra os 200 focos próximos de menor distância e a lista os 20 primeiros, com contagem total e avisos. Em redes que cobrem regiões muito extensas, avalie painéis separados por região para reduzir o volume. Registros inválidos são ignorados com aviso; falhas nunca são tratadas como zero focos. Se uma atualização falhar, a última consulta pode continuar visível, com aviso; focos fora da janela são removidos. Consulta antiga é identificada separadamente.

O recurso é desligado por padrão e não consulta o serviço quando desativado. Painéis simultâneos na mesma região compartilham uma consulta em cache. Há timeout de 25 segundos, atualização mínima de 120 segundos e proteção contra respostas atrasadas de outra região. Não há backend, dependência nova, envio de notificações ou mudança do status de interfaces por causa de focos.

## Conectividade

O navegador do operador precisa alcançar `https://terrabrasilis.dpi.inpe.br`. O serviço foi verificado com CORS liberado durante a implementação; a disponibilidade externa pode mudar. Se o seu Grafana possui CSP restritiva, seu administrador deve permitir esse domínio em `connect-src` preservando as demais regras. Não desative a CSP inteira. Sem acesso, o painel indica indisponibilidade.

A requisição envia ao INPE a caixa geográfica da rede expandida pelo raio. Não envia nomes de POPs, itens Zabbix, métricas, credenciais ou o JSON do dashboard. Não precisa de chave de API. Avalie essa consulta externa conforme o ambiente antes de habilitar.

## Conferir as opções originais

**Cadastro de Rotas** continua responsável pelas interfaces, trunks, RX/TX, limites e métricas; **Cadastro de POP** continua responsável por equipamentos, ícones e métricas desses equipamentos. Mapa e topologia usam o mesmo objeto de opções do Grafana e as mesmas leituras. Não é necessário cadastrar novamente.

O editor usa IDs para salvar itens, preservando alterações em campos diferentes feitas enquanto um cadastro ou layout estava aberto. Quando o mesmo campo é alterado nas duas edições, salvar/aplicar é bloqueado e um aviso pede revisão. Desfazer/refazer do layout preserva atualizações externas não conflitantes. Aplicar um layout atualiza as opções do painel; **salvar o dashboard** persiste o resultado no Grafana. Guarde o JSON antes de testar.

Para ícones: **Topologia → Editar layout → selecionar POP → Ícone do POP**. Use Datacenter, OLT, SW, Torre, Padrão ou URL. Aplique e salve. A seleção usa `pops[].iconUrl`, o mesmo campo das opções originais. **Visualização → Representação dos POPs → Cards** restaura a apresentação com cards. Confira também sua URL de ícone e o acesso do navegador, especialmente em Grafana servido por subdiretório.
