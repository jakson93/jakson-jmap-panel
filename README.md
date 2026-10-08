# JMAP (Grafana Panel)

Plugin de mapa para monitoramento de POPs e rotas de transporte em Grafana.

## Versão de teste 1.4.0 — mapa e topologia por POP

A visualização original continua disponível, com aparência refinada dentro do mapa. A alternativa **Topologia** permite posicionar equipamentos, puxar ligações e ajustar caminhos em modo de edição, com desfazer, refazer e cancelar. Após **Aplicar alterações**, salve o dashboard no Grafana.

Os POPs começam recolhidos para priorizar as rotas externas. Selecione um POP e use **Expandir equipamentos** ou **Expandir POPs** para acessar as conexões internas. O inventário mantém todos os equipamentos e rotas, inclusive os recolhidos. Em edição, todos os equipamentos aparecem; **Organizar grupos** reorganiza apenas posições da topologia em rascunho.

Em **Visualização**, escolha rótulos inteligentes, somente nome, detalhados ou ao passar o mouse; contraste suave ou original; e linhas curvas, diretas ou ortogonais na topologia. Desvios manuais e caminhos geográficos são preservados. Ícones, status, tráfego, limites, gráficos, métricas personalizadas, observações, interfaces e trunks continuam disponíveis.

Use a branch `codex/mapa-topologia` em homologação. O original está preservado em `backup/original-2026-10-07` (commit `743a103`). O diretório `dist` inclui o plugin compilado e seus ícones.

Veja o [passo a passo para testar, instalar e reverter](docs/TESTAR-E-REVERTER.md), incluindo um Grafana separado via `compose.homolog.yaml` e um dashboard com dados demonstrativos.

[Baixar o ZIP compilado 1.5.0 para homologação](https://github.com/jakson93/jakson-jmap-panel/releases/download/homolog-1.5.0-20261008/jakson-jmap-panel-1.5.0.zip).

A versão 1.5 mantém o histórico RX inteiro visível após quedas: escala considerando todas as amostras do período, faixa de RX baixo em vermelho e última leitura antes da queda observada. Preserva lacunas e combina fragmentos da consulta por horário. O histórico aberto acompanha novas leituras, sem inventar dados ausentes. O Grafana precisa consultar o histórico, e não apenas o último valor.

**Chuva forte → Alertas de chuva nas rotas de fibra** acrescenta ícones de nuvem e chuva nos pontos onde o trajeto cruza avisos vigentes do [INMET](https://avisos.inmet.gov.br/). Usa áreas oficiais de chuva intensa, acumulado de chuva e tempestade; não depende de proximidade com POPs. São avisos para a região, não medições de chuva no cabo, nem confirmação de interrupção. Desligado por padrão, sem credenciais ou notificações. Consulta pública `https://apiprevmet3.inmet.gov.br/avisos/ativos`; precisa de acesso HTTPS e permissão na CSP. A rede é filtrada localmente e não é enviada ao INMET. Veja [a camada ambiental](docs/CAMADA-AMBIENTAL.md).

A versão 1.4 apresenta POPs como ícones na topologia. Em **Editar layout**, selecione um POP e escolha Datacenter, OLT, SW, Torre ou uma URL. O campo `iconUrl` é o mesmo do **Cadastro de POP** e do mapa; também funciona com Grafana servido em subdiretório. **Visualização → Representação dos POPs → Cards** conserva a apresentação anterior.

O **Cadastro de Rotas** nas opções do Grafana continua sendo a fonte única de interfaces, trunks, sinais e métricas. Durante a edição do layout, mudanças externas em campos diferentes são combinadas por ID, inclusive com desfazer/refazer. Edições concorrentes do mesmo campo bloqueiam o salvamento para evitar perda de configurações; feche e reabra a edição para revisar.

**Focos de calor** é uma camada opcional, desligada por padrão. Ative em **Focos de calor → Focos de calor próximos da rede**. Ela consulta o serviço público WFS do [Programa Queimadas / INPE](https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/), cobertura Brasil e últimos 48h, sem API key. Mostra apenas detecções dentro da distância configurada dos segmentos geográficos de rotas de fibra, com ícone de fogo, horário, satélite, rotas próximas e distância aproximada. O período é recente e independente das métricas históricas do Grafana. Não confirma incêndio nem interrupção da rede e não envia notificações.

A consulta acontece no navegador: precisa de acesso HTTPS ao INPE e da permissão na CSP, se configurada. Envia a caixa geográfica da rede expandida pelo raio, sem nomes, métricas ou credenciais. Falhas, dados antigos e consultas parciais são explicitados. A resposta é limitada aos 2.000 focos mais recentes na região; o mapa exibe até 200 próximos e a lista até 20, com indicação dos limites. A atualização padrão é de 10 minutos; isso não garante nova passagem de satélite nesse intervalo. Veja [a configuração e os testes](docs/FOCOS-DE-CALOR.md).

A versão 1.3.1 mostra também rotas antigas sem associação, identificadas com vínculo pendente, e apresenta trunks, interfaces e sinais diretamente na topologia. Vincular uma rota existente pela topologia preserva seu traçado geográfico e monitoramento.

A versão 1.3 remodela o card de falha e acrescenta análise de incidentes, atualização dos dados, dependências explícitas, filtros/visões salvas, histórico observado, alinhamento, posições bloqueadas e portas. Todas as métricas anteriores continuam disponíveis. Não há integração de notificações. O dashboard demonstrativo usa um período histórico fixo e dados sintéticos.


![Topologia por POP](docs/images/jmap-1.2-topologia.png)

![Cards dentro do mapa](docs/images/jmap-1.2-cards.png)

## Instalar no Grafana (Linux)

Este é um plugin **não assinado**, então o Grafana precisa permitir plugins não assinados.

### 1) Baixar o plugin diretamente do GitHub (forma mais fácil)

No servidor do Grafana:

```bash
cd /var/lib/grafana/plugins
git clone https://github.com/jakson93/jakson-jmap-panel.git
```

### 2) Permitir plugin não assinado

Edite o arquivo `grafana.ini` (ou `custom.ini`), e adicione:

```
[plugins]
allow_loading_unsigned_plugins = jakson-jmap-panel
```

Em servidores Linux, o caminho comum é:

```
/etc/grafana/grafana.ini
```

### 3) Reiniciar o Grafana

```bash
sudo systemctl restart grafana-server
```

### 4) Verificar no Grafana

No Grafana:
**Configuration → Plugins** e procure por **JMAP**.

---

## Atualizar o plugin

```bash
cd /var/lib/grafana/plugins/jakson-jmap-panel
git pull
sudo systemctl restart grafana-server
```

---

## Observações

- O repositório é **privado**; o servidor precisa ter acesso ao GitHub.
- Se usar HTTPS e for privado, será necessário autenticar ao clonar/puxar.
- Alternativa: usar SSH com chave configurada no servidor.

---

## Autor

Jakson Soares (jakson93)
