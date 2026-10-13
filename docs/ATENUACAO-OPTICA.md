# Comparação de potência e alerta de atenuação — 1.6

O cadastro original de rotas, trunks, interfaces, itens RX/TX e thresholds permanece intacto. Esta análise acrescenta um alerta visual independente do status original da interface.

## Comparar datas

Abra a rota, selecione a interface no card de sinais e localize **Comparar potência entre datas** no histórico RX. Escolha **Data A** e **Data B**, no fuso do painel. O resumo mostra a potência em dBm nas coletas efetivamente encontradas e a diferença **em dB**:

- −20 → −22 dBm: **piorou 2 dB**; Δ RX = −2 dB.
- −22 → −20 dBm: **melhorou 2 dB**; Δ RX = +2 dB.

A data B deve ser posterior à A. Para comparar dias diferentes, inclua os dois dias no período consultado pelo Grafana. O painel usa a coleta mais próxima de cada data, dentro da tolerância definida por **Idade máxima da amostra**, e informa os horários efetivos. Não interpola dados nem substitui uma coleta ausente por outra distante. O botão **Usar início e fim das amostras** restaura a comparação inicial.

## Atenuação repentina

Em **Atenuação óptica**, o padrão é:

- **Alertar queda repentina de RX:** ligado.
- **Queda mínima de potência:** 2 dB.
- **Janela da queda:** 5 minutos.

O detector compara RX com a mediana das coletas anteriores na janela e exige pelo menos duas amostras de referência. A primeira leitura com piora de pelo menos 2 dB fica em confirmação; uma segunda coleta consecutiva com a mesma piora confirma o alerta. A segunda coleta precisa ocorrer dentro da janela e respeitar a idade máxima da amostra. Uma oscilação isolada não confirma a queda.

Use uma frequência de coleta compatível: por exemplo, coletas a cada minuto permitem referências e confirmação dentro de cinco minutos. Se houver histórico insuficiente, lacuna, consulta com erro ou dados antigos, o painel identifica a limitação e não apresenta análise parcial como uma conclusão de normalidade. Rotas cadastradas em manutenção não geram esses alertas.

Um selo **Atenuação** aparece no mapa e na topologia. Selecione-o para ver rota, trunk/interface, referência, RX atual, perda em dB e horários de início/confirmação. **Detalhar rota** abre o cadastro monitorado, mantendo o acesso ao gráfico. Itens RX iguais dentro da mesma rota são avaliados uma vez. São monitorados os itens RX cadastrados nas interfaces e as métricas RX habilitadas das rotas.

A interface pode continuar **Online** enquanto o alerta óptico está ativo. O painel não muda seu `onlineValue`, thresholds originais ou status com base nessa análise.

## Recuperação e continuidade

A referência do evento confirmado fica fixa; não acompanha o patamar degradado. Com limite de 2 dB, a recuperação exige duas coletas consecutivas com perda **inferior a 1 dB** em relação àquela referência. Enquanto a segunda coleta não chega, aparece **Recuperação em confirmação**. Essa diferença entre disparo e recuperação reduz alternância de alertas perto do limite.

Durante a mesma sessão ao vivo, a referência observada é mantida se o início da queda sair da janela consultada. Trocar de visualização não perde essa referência. Mudar período, fonte ou limites inicia outra análise. Uma alteração na última coleta recalcula sua confirmação. Lacunas interrompem a confiança da avaliação atual; não são tratadas como recuperação do evento observado.

Não há banco de eventos nem armazenamento permanente de referências. Depois de recarregar o dashboard, o detector reconstrói a análise com o histórico retornado pela fonte. Para detectar uma queda já ocorrida, o período precisa conter amostras anteriores e posteriores a ela. Em períodos fixos, o selo indica **histórico** e usa o fim do período como referência.

O alerta é **visual**, depende do painel aberto e acompanha a atualização das consultas do Grafana. Ative a atualização automática para acompanhar novas coletas. Não inclui envio de mensagens, notificações externas ou execução de alertas em segundo plano com o navegador fechado.

RX menor pode indicar atenuação, mas também pode refletir mudança de TX, equipamento ou coleta. O alerta é indicado como **possível atenuação**; compare RX/TX e investigue o enlace para determinar a causa.

## Testar

O dashboard `JMAP · Atenuação óptica (dados demonstrativos)` simula −20 → −22,5 dBm com a interface online. Abra **Atenuação**, confira a perda de 2,5 dB e teste o mesmo evento na topologia. No histórico RX, compare as datas e confira **Piorou 2,50 dB**. Os dados são sintéticos, sem conexão à produção.

Testes automatizados cobrem melhora/piora, fusos, ausência de dados, limites, confirmação, oscilação isolada, perda gradual, retenção da referência, recuperação, manutenção e correção de coleta. Veja [instalação e reversão](TESTAR-E-REVERTER.md).
