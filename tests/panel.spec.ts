import { test, expect } from '@grafana/plugin-e2e';

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
