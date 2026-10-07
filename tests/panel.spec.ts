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
  await expect(panel.getByRole('button', { name: /CORE-CENTRO-01.*Online.*POP Centro/ })).toBeVisible();
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
