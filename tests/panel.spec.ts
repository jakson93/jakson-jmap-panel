import { test, expect } from '@grafana/plugin-e2e';

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
