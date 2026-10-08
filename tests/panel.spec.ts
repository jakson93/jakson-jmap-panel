import { test, expect } from '@grafana/plugin-e2e';

test('POP icon selection applies to the same original map configuration without losing route metrics', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: 'Editar layout', exact: true }).click();
  await panel.getByRole('button', { name: /POP Centro.*Online/ }).click();
  await panel.getByRole('button', { name: 'Ícone Torre', exact: true }).click();
  await expect(panel.getByLabel('URL do ícone', { exact: true })).toHaveValue(
    '/public/plugins/jakson-jmap-panel/img/torre.png'
  );
  await panel.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(panel.locator('.jmap-node[title^="POP Centro"] img')).toHaveAttribute('src', /img\/torre.png$/);
  await panel.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(panel.locator('.jmap-pop-icon img[src$="img/torre.png"]')).toBeVisible();
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: 'Listar equipamentos e rotas', exact: true }).click();
  await panel.getByRole('button', { name: /POP Centro → POP Norte/ }).click();
  await expect(panel.getByRole('region', { name: 'Monitoramento da rota' })).toContainText('-28');
});

test('fire layer shows satellite detections near geographic assets and preserves the topology', async ({
  page,
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  // Deterministic INPE-schema fixture; this is not an observed fire event.
  await page.route('https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/wfs?**', async (route) =>
    route.fulfill({
      json: {
        type: 'FeatureCollection',
        totalFeatures: 1,
        features: [
          {
            geometry: { type: 'Point', coordinates: [-46.35192, -23.39763] },
            properties: {
              foco_id: 'e2e-demo',
              latitude: -23.39763,
              longitude: -46.35192,
              data_hora_gmt: new Date().toISOString(),
              satelite: 'TESTE-SATÉLITE',
              municipio: 'Cenário de teste',
              estado: 'SP',
            },
          },
        ],
      },
    })
  );
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-fire-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Focos de calor · 1', exact: true }).click();
  const fire = panel.getByRole('region', { name: 'Focos de calor próximos da rede' });
  await expect(fire.getByText('Cenário de teste · TESTE-SATÉLITE', { exact: true })).toBeVisible();
  await expect(fire).toContainText('0.00 km');
  await expect(fire).toContainText('sem confirmação de incêndio');
  await expect(fire.getByRole('button').first()).toContainText('2 rota(s) de fibra');
  await expect(panel.locator('.jmap-fire-icon')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await expect(panel.getByRole('button', { name: /POP Centro.*Online/ })).toBeVisible();
});

test('RX history retains the healthy signal after loss, with full scale and a responsive chart', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-signal-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Detalhes da rota', exact: true }).first().click();
  const detail = panel.getByRole('dialog', { name: 'Detalhes da rota' });
  await detail.getByRole('button', { name: /Interface A · Centro/ }).click();
  const history = panel.getByRole('dialog', { name: 'Histórico do sinal RX' });
  await expect(history.getByText('-40.00 dBm', { exact: true })).toBeVisible();
  await expect(history.getByText('Antes da última queda observada', { exact: true })).toBeVisible();
  const coordinates = await history
    .locator('[data-signal-segment]')
    .evaluateAll((lines) => lines.map((line) => [Number(line.getAttribute('y1')), Number(line.getAttribute('y2'))]));
  expect(coordinates.length).toBeGreaterThan(2);
  expect(coordinates.flat().every((y) => y >= 0 && y <= 240)).toBe(true);
});

test('INMET rain icon marks only fiber crossings and identifies warnings rather than measurements', async ({
  page,
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  await page.route('https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/wfs?**', (route) =>
    route.fulfill({ json: { type: 'FeatureCollection', features: [] } })
  );
  await page.route('https://apiprevmet3.inmet.gov.br/avisos/ativos', (route) =>
    route.fulfill({
      json: {
        hoje: [
          {
            id: 1,
            descricao: 'Chuvas Intensas',
            severidade: 'Perigo',
            data_inicio: '2020-01-01T00:00:00Z',
            hora_inicio: '00:00',
            data_fim: '2099-12-31T00:00:00Z',
            hora_fim: '23:59',
            poligono: JSON.stringify({
              type: 'Polygon',
              coordinates: [
                [
                  [-46.5, -23.1],
                  [-46.2, -23.1],
                  [-46.2, -23],
                  [-46.5, -23],
                  [-46.5, -23.1],
                ],
              ],
            }),
            riscos: ['Cenário de teste: chuva prevista, sem medição real'],
          },
        ],
        futuro: [],
      },
    })
  );
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-environment-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await expect(panel.locator('.jmap-rain-icon')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Chuva · 1', exact: true }).click();
  const rain = panel.getByRole('region', { name: 'Alertas de chuva nas rotas de fibra' });
  await expect(rain).toContainText('Chuvas Intensas');
  await expect(rain).toContainText('não é medição');
  await expect(rain.getByRole('button', { name: /Localizar na fibra/ })).toHaveCount(1);
});

test('failed INPE request is displayed as unavailable rather than a zero-focus success', async ({
  page,
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  await page.route('https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/wfs?**', async (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' })
  );
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-fire-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Focos de calor · indisponível · atenção', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Não foi possível atualizar');
  await expect(panel.getByText('Nenhum foco encontrado próximo da rede nessa consulta.', { exact: true })).toHaveCount(
    0
  );
});

test('legacy map routes without POP associations display in topology with their configured trunk signals', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-legacy-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: /Origem · POP Centro → POP Norte/ }).click();
  const inspector = panel.getByRole('region', { name: 'Detalhes da seleção' });
  await expect(inspector.getByText('Trunks e interfaces', { exact: true })).toBeVisible();
  const iface = inspector.getByRole('article', { name: 'Interface Interface A · Centro' });
  await expect(iface).toContainText('-28');
  await expect(iface).toContainText(/-5[.,]8/);
  await expect(inspector.getByText('Latência', { exact: true })).toBeVisible();
  await inspector.getByRole('button', { name: 'Vincular extremidades desta rota', exact: true }).click();
  await expect(panel.getByLabel('Rota para conectar')).toHaveValue('rota-0');
  await expect(panel.getByLabel('Rota para conectar').locator('option')).toHaveCount(7);
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(panel.getByRole('button', { name: /Origem · POP Centro → POP Norte/ })).toBeVisible();
});

test('combined operational filters never remove routes from the editor', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Analisar rede', exact: true }).click();
  await panel.getByRole('button', { name: 'Filtros e visões', exact: true }).click();
  const operation = panel.getByLabel('Operação da rede', { exact: true });
  await operation.getByLabel('Status', { exact: true }).selectOption('down');
  await operation.getByLabel('Tipo de ligação', { exact: true }).selectOption('backbone');
  await panel.getByRole('button', { name: 'Analisar rede', exact: true }).click();
  await expect(operation.getByText(/1\/6 rotas/)).toBeVisible();
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: 'Editar layout', exact: true }).click();
  await panel.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(panel.getByLabel('Rota para conectar').locator('option')).toHaveCount(7);
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('operational history exposes data coverage and registered dependencies', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Analisar rede', exact: true }).click();
  const operation = panel.getByLabel('Operação da rede', { exact: true });
  await expect(operation.getByText('1 rota(s) com dependência cadastrada', { exact: true })).toBeVisible();
  await operation.getByRole('button', { name: 'Histórico', exact: true }).click();
  await operation.getByLabel('Rota', { exact: true }).selectOption('rota-1');
  await expect(operation.getByText('Disponibilidade observada', { exact: true })).toBeVisible();
  await expect(operation.getByText('Cobertura de dados', { exact: true })).toBeVisible();
  await expect(operation.getByText('Tempo médio de recuperação', { exact: true })).toBeVisible();
});

test('preserves the original map and switches to equipment topology', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await expect(panel.getByTestId('jmap-workspace')).toBeVisible();
  await panel.getByRole('button', { name: 'Mapa', exact: true }).click();
  await expect(panel.getByTestId('jmap-original-map')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Abrir painel de incidentes' })).toBeVisible();
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await expect(panel.getByTestId('network-canvas')).toHaveAttribute('data-view', 'topology');
  await expect(panel.getByRole('button', { name: /CORE-CENTRO-01.*Online/ })).toHaveCount(0);
  await panel.getByRole('button', { name: /POP Centro.*Online/ }).click();
  await panel.getByRole('button', { name: 'Expandir equipamentos', exact: true }).click();
  await expect(panel.getByRole('button', { name: /CORE-CENTRO-01.*Online/ })).toBeVisible();
});

test('creates draft connections, undoes, redoes and cancels without persisting', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: 'Editar layout' }).click();
  await panel.getByRole('button', { name: 'Conectar', exact: true }).click();
  await panel.getByLabel('Origem da conexão').selectOption(JSON.stringify(['centro', 'centro-0']));
  await panel.getByLabel('Destino da conexão').selectOption(JSON.stringify(['norte', 'norte-0']));
  const routes = panel.getByLabel('Rota para conectar').locator('option');
  const before = await routes.count();
  await panel.getByRole('button', { name: 'Conectar itens', exact: true }).click();
  await expect(routes).toHaveCount(before + 1);
  await panel.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await expect(routes).toHaveCount(before);
  await panel.getByRole('button', { name: 'Refazer', exact: true }).click();
  await expect(routes).toHaveCount(before + 1);
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await panel.getByRole('button', { name: 'Editar layout' }).click();
  await panel.getByRole('button', { name: 'Conectar', exact: true }).click();
  await expect(routes).toHaveCount(before);
});

test('equipment monitoring remains available behind folded POPs and complete details', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: /POP Centro.*Online/ }).click();
  const inspector = panel.getByRole('region', { name: 'Detalhes da seleção' });
  await expect(panel.getByRole('button', { name: 'CORE-CENTRO-01 Online', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Detalhes completos', exact: true }).click();
  const details = panel.getByRole('dialog', { name: 'Equipamentos do POP', exact: true });
  await expect(details).toBeVisible();
  for (const metric of ['CPU', 'Memória', 'Temperatura', 'Uptime']) {
    await expect(details.getByText(metric, { exact: true }).first()).toBeVisible();
  }
  await details.getByRole('button', { name: 'Fechar', exact: true }).click();
  await panel.getByRole('button', { name: 'Voltar à rede', exact: true }).click();
  await expect(inspector).toBeVisible();
});

test('automatic group arrangement can be undone and cancelled without changing route monitoring', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: 'Editar layout', exact: true }).click();
  await panel.getByRole('button', { name: 'Organizar grupos', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Desfazer', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Desfazer', exact: true }).click();
  await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(panel.getByLabel('Resumo da rede').getByText('Rotas', { exact: true })).toBeVisible();
});

test('route details display custom metrics alongside trunks and RX history', async ({
  gotoPanelEditPage,
  readProvisionedDashboard,
}) => {
  const dashboard = await readProvisionedDashboard({ fileName: 'jmap-demo.json' });
  const editor = await gotoPanelEditPage({ dashboard, id: '1' });
  const panel = editor.panel.locator;
  await panel.getByRole('button', { name: 'Topologia', exact: true }).click();
  await panel.getByRole('button', { name: 'Listar equipamentos e rotas', exact: true }).click();
  await panel.getByRole('button', { name: 'Listar equipamentos e rotas', exact: true }).click();
  await expect(panel.getByLabel('Inventário da rede', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Listar equipamentos e rotas', exact: true }).click();
  await panel.getByRole('button', { name: 'POP Centro → POP Norte Em alerta', exact: true }).click();
  await panel.getByRole('button', { name: 'Detalhes completos', exact: true }).click();
  const details = panel.getByRole('dialog', { name: 'Detalhes da rota', exact: true });
  await expect(details.getByText('Latência', { exact: true })).toBeVisible();
  await expect(details.getByText('Sinais em tempo real (TX/RX)', { exact: true })).toBeVisible();
  await details.getByRole('button', { name: /Interface A · Centro/ }).click();
  await expect(panel.getByRole('dialog', { name: 'Histórico do sinal RX', exact: true })).toBeVisible();
});
