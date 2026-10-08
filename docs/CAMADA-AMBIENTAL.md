# Fogo, chuva e histórico óptico — 1.5

Os cadastros existentes continuam sendo a fonte das rotas, interfaces, trunks e métricas. Todos os trajetos cadastrados representam fibra. Nenhuma destas camadas altera o status ou as configurações de monitoramento.

## Fogo

Ative **Focos de calor → Focos de calor próximos da rede**. O ícone de fogo representa detecção por satélite do INPE, dentro do raio configurado de pelo menos um segmento geográfico da fibra. A distância é calculada ao trajeto, inclusive entre os vértices, e não ao POP. Pontos coincidentes e caminhos sem dois pontos geográficos válidos não entram na consulta. A geometria desenhada na topologia não substitui o caminho geográfico.

Mostra horário, satélite, município e rotas próximas. Detecção de calor não confirma incêndio nem dano à rede. Consulte [a cobertura do INPE](https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/).

## Chuva

Ative **Chuva forte → Alertas de chuva nas rotas de fibra**. A fonte é o serviço usado pelo [mapa oficial de avisos do INMET](https://avisos.inmet.gov.br/): `https://apiprevmet3.inmet.gov.br/avisos/ativos`.

Aceita avisos de chuva intensa, acumulado de chuva e tempestade. Cruza polígonos com segmentos da fibra, inclusive quando ambas as extremidades estão fora da área. Um símbolo de nuvem/chuva é posicionado no próprio segmento dentro da área. Não considera proximidade com POPs. Regiões internas excluídas do polígono são respeitadas.

O card identifica evento, severidade, vigência e descrição do risco. Os campos de data e hora do serviço são interpretados como horário de Brasília (UTC−3), e apresentados no horário local do navegador. Só aparecem avisos já iniciados e ainda vigentes; avisos encerrados e futuros ficam excluídos.

É um **aviso meteorológico para a região**, não uma medição de precipitação no cabo. A ausência de aviso nessa consulta não assegura ausência de chuva. Veja [a descrição institucional do serviço](https://portal.inmet.gov.br/servicos/avisos-especiais).

As duas camadas são desligadas por padrão e independem do período histórico das métricas. Atualização padrão: 600 segundos; mínimo: 120. Consultas têm timeout de 25 segundos e cache compartilhado limitado. Erros, dados antigos e cobertura parcial são exibidos. Chuva: até 500 avisos na resposta, 200 cruzamentos no mapa e 20 avisos na lista, com indicação quando limitada. Não há notificações, chaves de API ou backend.

O navegador precisa acessar os serviços HTTPS. Com CSP personalizada no Grafana, permita os domínios do INPE e `https://apiprevmet3.inmet.gov.br` em `connect-src`, preservando as regras existentes. O INPE recebe uma caixa geográfica para consultar focos; o INMET recebe apenas a consulta pública, sem coordenadas, nomes ou métricas da rede.

## Histórico RX

A escala inclui todas as amostras finitas recebidas no período selecionado. Leituras de RX baixo (≤ −35 dBm) e a transição para elas aparecem em vermelho; o status da rota continua vindo das métricas configuradas. O resumo indica a última leitura e a leitura imediatamente anterior à última entrada observada na faixa crítica, se houver dados contínuos. Lacunas não são preenchidas, e nenhum histórico anterior é inventado.

**Intervalo com amostras** amplia o trecho efetivamente consultado; **Período do painel** exibe a janela completa. Isso não preenche partes sem medição.

Se o Grafana fornecer só o último valor, configure a consulta da fonte para retornar a série temporal. Um painel não recupera do servidor amostras que a consulta não entregou. O card combina fragmentos por item/horário e acompanha atualizações enquanto estiver aberto.

## Homologação

- Abra `JMAP · Queda de sinal RX (dados demonstrativos)` para verificar a queda simulada até −40 dBm sem perder o sinal anterior.
- Abra `JMAP · Fogo e chuva (rede demonstrativa)` para consultar dados ambientais reais sobre uma rede sintética. Os fenômenos variam conforme a data e podem não estar presentes.
- A CI usa respostas simuladas identificadas como teste para verificar símbolos, cruzamentos, métricas preservadas, quedas e falhas de serviço em seis versões do Grafana.
- Testes unitários cobrem distância aos segmentos, POPs isolados, pontos coincidentes, buracos de polígonos, vigência, fragmentos históricos, escala completa e lacunas.

Para instalação e reversão, consulte [Testar e reverter](TESTAR-E-REVERTER.md). O ID permanece `jakson-jmap-panel`.
