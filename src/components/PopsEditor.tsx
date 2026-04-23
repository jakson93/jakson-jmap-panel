import React from 'react';
import { DataFrame, FieldType, SelectableValue, StandardEditorProps } from '@grafana/data';
import { Button, Field, InlineSwitch, Input, Modal, Select, Stack } from '@grafana/ui';

import { Pop, PopEquipment, PopMetric } from '../types';
import datacenterIcon from '../img/datacenter.png';
import oltIcon from '../img/olt.png';
import swIcon from '../img/sw.png';
import torreIcon from '../img/torre.png';
import { PopSelectMap } from './PopSelectMap';

const POP_ICON_PRESETS = [
  {
    id: 'datacenter',
    label: 'Datacenter',
    url: datacenterIcon,
  },
  {
    id: 'olt',
    label: 'OLT',
    url: oltIcon,
  },
  {
    id: 'sw',
    label: 'SW',
    url: swIcon,
  },
  {
    id: 'torre',
    label: 'Torre',
    url: torreIcon,
  },
];

const PLUGIN_PUBLIC_PATH = '/public/plugins/jakson-jmap-panel/';

const createEmptyPop = (lat: number, lng: number): Pop => ({
  id: `pop-${Date.now()}`,
name: '',
  lat,
  lng,
  iconUrl: '',
  iconSizePx: 32,
  iconScaleMode: 'fixed',
  showName: true,
  coverageRadiusMeters: 0,
  coverageColor: '#2563eb',
  coverageOpacity: 0.2,
  equipments: [],
});

const clonePop = (pop: Pop): Pop => ({
  ...pop,
  equipments: pop.equipments.map((e) => ({
    ...e,
    metrics: e.metrics.map((m) => ({ ...m })),
  })),
});

type Props = StandardEditorProps<Pop[]>;

type State = {
  isPopModalOpen: boolean;
  isMapModalOpen: boolean;
  editingIndex: number | null;
  draggingIndex: number | null;
  draftPop: Pop;
  newEquipment: PopEquipment;
  editingEquipmentId: string | null;
};

const createEmptyEquipment = (): PopEquipment => ({
  id: `equip-${Date.now()}`,
  name: '',
  ip: '',
  type: '',
  statusItem: '',
  onlineValue: '',
  cpuItem: '',
  cpuShow: true,
  memoryItem: '',
  memoryShow: true,
  temperatureItem: '',
  temperatureShow: true,
  uptimeItem: '',
  uptimeShow: true,
  observation: '',
  observationShow: true,
  metrics: [],
});

const buildZabbixItemOptions = (data?: DataFrame[]): Array<SelectableValue<string>> => {
  const options: Array<SelectableValue<string>> = [];
  const seen = new Set<string>();

  const addOption = (label?: string) => {
    const value = label?.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    options.push({ label: value, value });
  };

  data?.forEach((frame) => {
    addOption(frame.name);
    frame.fields?.forEach((field) => {
      if (field.type === FieldType.time) {
        return;
      }
      const label = field.config?.displayNameFromDS ?? field.config?.displayName ?? field.name;
      addOption(label);
    });
  });
  data?.forEach((frame) => {
    frame.fields?.forEach((field) => {
      if (field.type === FieldType.time) {
        return;
      }
      addOption(field.name);
    });
  });

  return options;
};

const getSelectValue = (
  value: string | undefined,
  options: Array<SelectableValue<string>>
): SelectableValue<string> | null => {
  if (!value) {
    return null;
  }
  return options.find((option) => option.value === value || option.label === value) ?? { label: value, value };
};

const normalizePopIconUrl = (value?: string) => {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return '';
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('/')) {
    return raw;
  }
  if (raw.startsWith('public/plugins/')) {
    return `/${raw}`;
  }
  if (raw.startsWith('public/')) {
    return `/${raw}`;
  }
  return `${PLUGIN_PUBLIC_PATH}${raw.replace(/^\.\//, '')}`;
};

export class PopsEditor extends React.PureComponent<Props, State> {
  state: State = {
    isPopModalOpen: false,
    isMapModalOpen: false,
    editingIndex: null,
    draggingIndex: null,
    draftPop: createEmptyPop(-23.5505, -46.6333),
    newEquipment: createEmptyEquipment(),
    editingEquipmentId: null,
  };

  get pops(): Pop[] {
    return this.props.value ?? [];
  }

  updatePops = (pops: Pop[]) => {
    this.props.onChange(pops);
  };

  openAddPop = () => {
    const centerLat = this.props.context?.options?.centerLat ?? -23.5505;
    const centerLng = this.props.context?.options?.centerLng ?? -46.6333;
    this.setState({
      isPopModalOpen: true,
      editingIndex: null,
      draftPop: createEmptyPop(centerLat, centerLng),
      newEquipment: createEmptyEquipment(),
      editingEquipmentId: null,
    });
  };

  openEditPop = (index: number) => {
    const pop = this.pops[index];
    if (!pop) {
      return;
    }
    this.setState({
      isPopModalOpen: true,
      editingIndex: index,
      draftPop: clonePop(pop),
      newEquipment: createEmptyEquipment(),
      editingEquipmentId: null,
    });
  };

  closePopModal = () => {
    this.setState({ isPopModalOpen: false, isMapModalOpen: false, editingIndex: null, editingEquipmentId: null });
  };

  savePop = () => {
    const { draftPop, editingIndex } = this.state;
    const nextPops = [...this.pops];
    if (editingIndex === null) {
      nextPops.push(draftPop);
    } else {
      nextPops[editingIndex] = draftPop;
    }
    this.updatePops(nextPops);
    this.setState({ isPopModalOpen: false, editingIndex: null });
  };

  deletePop = (index: number) => {
    const pop = this.pops[index];
    if (!pop) {
      return;
    }
    if (!confirm(`Excluir o POP "${pop.name || 'Sem nome'}"?`)) {
      return;
    }
    const nextPops = this.pops.filter((_, i) => i !== index);
    this.updatePops(nextPops);
  };

  onDragStart = (index: number) => {
    this.setState({ draggingIndex: index });
  };

  onDragOver = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const { draggingIndex } = this.state;
    if (draggingIndex === null || draggingIndex === targetIndex) {
      return;
    }

    const newPops = [...this.pops];
    const [draggedItem] = newPops.splice(draggingIndex, 1);
    newPops.splice(targetIndex, 0, draggedItem);
    this.updatePops(newPops);
    this.setState({ draggingIndex: targetIndex });
  };

  onDragEnd = () => {
    this.setState({ draggingIndex: null });
  };

  updateDraft = (partial: Partial<Pop>) => {
    this.setState((prev) => ({ draftPop: { ...prev.draftPop, ...partial } }));
  };

  openMapModal = () => {
    this.setState({ isMapModalOpen: true });
  };

  closeMapModal = () => {
    this.setState({ isMapModalOpen: false });
  };

  onSelectMap = (lat: number, lng: number) => {
    this.setState((prev) => ({
      draftPop: { ...prev.draftPop, lat, lng },
      isMapModalOpen: false,
    }));
  };

  updateNewEquipment = (partial: Partial<PopEquipment>) => {
    this.setState((prev) => ({ newEquipment: { ...prev.newEquipment, ...partial } }));
  };

  openEditEquipment = (id: string) => {
    const equipment = this.state.draftPop.equipments.find((eq) => eq.id === id);
    if (!equipment) {
      return;
    }
    this.setState({
      editingEquipmentId: id,
      newEquipment: { ...equipment, metrics: equipment.metrics.map((m) => ({ ...m })) },
    });
  };

  cancelEditEquipment = () => {
    this.setState({ editingEquipmentId: null, newEquipment: createEmptyEquipment() });
  };

  saveEquipment = () => {
    const { newEquipment, editingEquipmentId } = this.state;
    if (!newEquipment.name.trim()) {
      alert('Informe o nome do equipamento.');
      return;
    }
    if (!editingEquipmentId) {
      this.setState((prev) => ({
        draftPop: { ...prev.draftPop, equipments: [...prev.draftPop.equipments, { ...newEquipment }] },
        newEquipment: createEmptyEquipment(),
      }));
      return;
    }
    this.setState((prev) => ({
      draftPop: {
        ...prev.draftPop,
        equipments: prev.draftPop.equipments.map((eq) => (eq.id === editingEquipmentId ? { ...newEquipment } : eq)),
      },
      editingEquipmentId: null,
      newEquipment: createEmptyEquipment(),
    }));
  };

  addEquipment = () => {
    this.saveEquipment();
  };

  removeEquipment = (id: string) => {
    this.setState((prev) => ({
      draftPop: { ...prev.draftPop, equipments: prev.draftPop.equipments.filter((e) => e.id !== id) },
    }));
  };

  addEquipmentMetric = () => {
    const metric: PopMetric = {
      id: `metric-${Date.now()}`,
      name: '',
      description: '',
      item: '',
      showInDetails: true,
    };
    this.setState((prev) => ({
      newEquipment: { ...prev.newEquipment, metrics: [...prev.newEquipment.metrics, metric] },
    }));
  };

  updateEquipmentMetric = (id: string, partial: Partial<PopMetric>) => {
    this.setState((prev) => ({
      newEquipment: {
        ...prev.newEquipment,
        metrics: prev.newEquipment.metrics.map((m) => (m.id === id ? { ...m, ...partial } : m)),
      },
    }));
  };

  removeEquipmentMetric = (id: string) => {
    this.setState((prev) => ({
      newEquipment: {
        ...prev.newEquipment,
        metrics: prev.newEquipment.metrics.filter((m) => m.id !== id),
      },
    }));
  };

  renderPopList() {
    const { draggingIndex } = this.state;
    return (
      <Stack direction="column" gap={1}>
        {this.pops.map((pop, idx) => (
          <div
            key={pop.id}
            draggable
            onDragStart={() => this.onDragStart(idx)}
            onDragOver={(e) => this.onDragOver(e, idx)}
            onDragEnd={this.onDragEnd}
            style={{
              cursor: 'grab',
              padding: '8px 12px',
              borderRadius: 6,
              border: draggingIndex === idx ? '2px solid #3b82f6' : '1px solid rgba(148,163,184,0.2)',
              background: draggingIndex === idx ? 'rgba(59,130,246,0.15)' : 'rgba(31,41,55,0.2)',
              opacity: draggingIndex === idx ? 0.5 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <Stack direction="row" gap={2} alignItems="center" justifyContent="space-between">
              <Stack direction="column" gap={0}>
                <div style={{ fontWeight: 600 }}>{pop.name || 'Sem nome'}</div>
                <div style={{ fontSize: 12 }}>
                  {pop.equipments.length} equipamento(s)
                  {(pop.coverageRadiusMeters ?? 0) > 0 ? ` • raio ${pop.coverageRadiusMeters} m` : ''}
                  {(pop.iconSizePx ?? 32) !== 32 ? ` • icone ${pop.iconSizePx ?? 32}px` : ''}
                  {pop.iconScaleMode === 'fixed' ? ' • fixo' : ' • dinamico'}
                  {pop.showName === false ? ' • sem nome' : ''}
                </div>
              </Stack>
              <Stack direction="row" gap={1}>
                <Button size="sm" onClick={() => this.openEditPop(idx)}>
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => this.deletePop(idx)}>
                  Excluir
                </Button>
              </Stack>
            </Stack>
          </div>
        ))}
      </Stack>
    );
  }

  renderMapModal() {
    const centerLat = this.props.context?.options?.centerLat ?? -23.5505;
    const centerLng = this.props.context?.options?.centerLng ?? -46.6333;
    const zoom = this.props.context?.options?.zoom ?? 12;
    const center: [number, number] = [centerLat, centerLng];

    return (
      <Modal title="Selecionar posicao no mapa" isOpen={this.state.isMapModalOpen} onDismiss={this.closeMapModal}>
        <Stack direction="column" gap={2}>
          <div style={{ height: 320 }}>
            <PopSelectMap center={center} zoom={zoom} onSelect={this.onSelectMap} />
          </div>
          <div style={{ fontSize: 12 }}>Clique no mapa para posicionar o POP.</div>
        </Stack>
      </Modal>
    );
  }

  renderPopModal() {
    const { isPopModalOpen, draftPop, newEquipment } = this.state;
    const zabbixItemOptions = buildZabbixItemOptions(this.props.context?.data);

    return (
      <Modal
        title="Cadastro de POP"
        isOpen={isPopModalOpen}
        onDismiss={this.closePopModal}
        className="jmap-pop-modal"
        contentClassName="jmap-pop-modal__content"
      >
        <style>
          {`
            .jmap-pop-modal {
              width: min(1200px, 96vw);
              max-width: 96vw;
            }
            .jmap-pop-modal__content {
              width: 100%;
              max-height: 82vh;
              overflow-y: auto;
            }
          `}
        </style>
        <Stack direction="column" gap={3}>
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Informacoes basicas</div>
            <Stack direction="column" gap={2}>
              <Field label="Nome do POP *">
                <Input
                  value={draftPop.name}
                  placeholder="Ex: POP Centro"
                  onChange={(e) => this.updateDraft({ name: e.currentTarget.value })}
                />
              </Field>
              <Field label="Mostrar nome no mapa">
                <InlineSwitch
                  value={draftPop.showName ?? true}
                  onChange={(e) => this.updateDraft({ showName: e.currentTarget.checked })}
                />
              </Field>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Posicao no mapa</div>
                <Stack direction="row" gap={2} alignItems="flex-end">
                  <Field label="Latitude">
                    <Input
                      type="number"
                      step="any"
                      value={draftPop.lat}
                      onChange={(e) => this.updateDraft({ lat: Number(e.currentTarget.value) })}
                    />
                  </Field>
                  <Field label="Longitude">
                    <Input
                      type="number"
                      step="any"
                      value={draftPop.lng}
                      onChange={(e) => this.updateDraft({ lng: Number(e.currentTarget.value) })}
                    />
                  </Field>
                  <div>
                    <Button onClick={this.openMapModal}>Selecionar no mapa</Button>
                    <div style={{ fontSize: 12 }}>Clique no mapa para posicionar o POP</div>
                  </div>
                </Stack>
              </div>
              <Field
                label="URL do icone"
                description="Opcional. Informe a URL de uma imagem para usar como icone do POP"
              >
                <Input
                  value={draftPop.iconUrl ?? ''}
                  placeholder="https://exemplo.com/icone.png"
                  onChange={(e) => this.updateDraft({ iconUrl: e.currentTarget.value })}
                />
              </Field>
              <Field label="Tamanho do icone (px)" description="Define o tamanho base do icone">
                <div style={{ display: 'grid', gap: 8 }}>
                  <input
                    type="range"
                    min={16}
                    max={128}
                    step={1}
                    value={draftPop.iconSizePx ?? 32}
                    onChange={(e) =>
                      this.updateDraft({
                        iconSizePx: Math.min(128, Math.max(16, Number(e.currentTarget.value) || 32)),
                      })
                    }
                    style={{ width: '100%' }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                    }}
                  >
                    <span>16px</span>
                    <span style={{ fontWeight: 600 }}>{draftPop.iconSizePx ?? 32}px</span>
                    <span>128px</span>
                  </div>
                </div>
              </Field>
              <Field
                label="Modo de escala do icone"
                description="Escolha se o icone fica fixo na tela ou acompanha o zoom do mapa"
              >
                <Select
                  options={[
                    { label: 'Acompanhar mapa', value: 'map' },
                    { label: 'Fixo na tela', value: 'fixed' },
                  ]}
                  value={
                    {
                      label: draftPop.iconScaleMode === 'fixed' ? 'Fixo na tela' : 'Acompanhar mapa',
                      value: draftPop.iconScaleMode === 'fixed' ? 'fixed' : 'map',
                    } as SelectableValue<string>
                  }
                  onChange={(option) =>
                    this.updateDraft({ iconScaleMode: (option?.value as Pop['iconScaleMode']) ?? 'map' })
                  }
                />
              </Field>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>Icones rapidos</div>
                <Stack direction="row" gap={1}>
                  <Button
                    size="sm"
                    variant={draftPop.iconUrl ? 'secondary' : 'primary'}
                    onClick={() => this.updateDraft({ iconUrl: '' })}
                  >
                    Sem icone
                  </Button>
                  {POP_ICON_PRESETS.map((preset) => {
                    const presetUrl = normalizePopIconUrl(preset.url);
                    const selected = normalizePopIconUrl(draftPop.iconUrl) === presetUrl;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => this.updateDraft({ iconUrl: presetUrl })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 8px',
                          borderRadius: 6,
                          border: selected ? '1px solid #3b82f6' : '1px solid rgba(148, 163, 184, 0.4)',
                          background: selected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(31, 41, 55, 0.35)',
                          color: '#e2e8f0',
                          cursor: 'pointer',
                        }}
                      >
                        <img
                          src={presetUrl}
                          alt={preset.label}
                          style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }}
                        />
                        <span style={{ fontSize: 12 }}>{preset.label}</span>
                      </button>
                    );
                  })}
                </Stack>
              </div>
            </Stack>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Equipamentos associados</div>
            {draftPop.equipments.length === 0 ? (
              <div style={{ fontSize: 12 }}>Nenhum equipamento cadastrado ainda.</div>
            ) : (
              <Stack direction="column" gap={1}>
                {draftPop.equipments.map((eq) => (
                  <Stack key={eq.id} direction="row" gap={2} alignItems="center" justifyContent="space-between">
                    <div>
                      <div style={{ fontWeight: 600 }}>{eq.name}</div>
                      <div style={{ fontSize: 12 }}>{eq.ip || '-'}</div>
                    </div>
                    <Stack direction="row" gap={1}>
                      <Button size="sm" onClick={() => this.openEditEquipment(eq.id)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => this.removeEquipment(eq.id)}>
                        Remover
                      </Button>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </div>

          <div
            style={{
              padding: 12,
              border: '1px dashed rgba(148, 163, 184, 0.5)',
              borderRadius: 6,
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {this.state.editingEquipmentId ? 'Editar equipamento' : 'Novo equipamento'}
            </div>
            <Field label="Nome *">
              <Input
                value={newEquipment.name}
                placeholder="Ex: Switch Core"
                onChange={(e) => this.updateNewEquipment({ name: e.currentTarget.value })}
              />
            </Field>
            <Stack direction="row" gap={2}>
              <Field label="IP">
                <Input
                  value={newEquipment.ip ?? ''}
                  placeholder="Ex: 192.168.1.1"
                  onChange={(e) => this.updateNewEquipment({ ip: e.currentTarget.value })}
                />
              </Field>
              <Field label="Tipo">
                <Input
                  value={newEquipment.type ?? ''}
                  placeholder="Ex: Huawei S5735"
                  onChange={(e) => this.updateNewEquipment({ type: e.currentTarget.value })}
                />
              </Field>
            </Stack>
            <Field label="Item de status" description="Selecione o item que representa o status do equipamento">
              <Select
                options={zabbixItemOptions}
                value={getSelectValue(newEquipment.statusItem, zabbixItemOptions)}
                allowCustomValue
                isClearable
                placeholder="Selecione um item"
                onChange={(option) => this.updateNewEquipment({ statusItem: option?.value ?? '' })}
                onCreateOption={(value) => this.updateNewEquipment({ statusItem: value })}
              />
            </Field>
            <Field label="Valor online" description="Valor retornado quando o equipamento esta OK">
              <Input
                value={newEquipment.onlineValue ?? ''}
                placeholder="Ex: 1"
                onChange={(e) => this.updateNewEquipment({ onlineValue: e.currentTarget.value })}
              />
            </Field>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Metricas adicionais</div>
              {newEquipment.metrics.length === 0 ? (
                <div style={{ fontSize: 12, marginBottom: 8 }}>Nenhuma metrica adicional configurada</div>
              ) : (
                <Stack direction="column" gap={1}>
                  {newEquipment.metrics.map((metric) => (
                    <Stack key={metric.id} direction="row" gap={2} alignItems="center">
                      <Input
                        placeholder="Nome da metrica"
                        value={metric.name}
                        onChange={(e) => this.updateEquipmentMetric(metric.id, { name: e.currentTarget.value })}
                      />
                      <Input
                        placeholder="Descricao"
                        value={metric.description ?? ''}
                        onChange={(e) => this.updateEquipmentMetric(metric.id, { description: e.currentTarget.value })}
                      />
                      <Select
                        options={zabbixItemOptions}
                        value={getSelectValue(metric.item, zabbixItemOptions)}
                        allowCustomValue
                        isClearable
                        placeholder="Item"
                        onChange={(option) => this.updateEquipmentMetric(metric.id, { item: option?.value ?? '' })}
                        onCreateOption={(value) => this.updateEquipmentMetric(metric.id, { item: value })}
                      />
                      <InlineSwitch
                        value={metric.showInDetails ?? true}
                        onChange={(e) =>
                          this.updateEquipmentMetric(metric.id, { showInDetails: e.currentTarget.checked })
                        }
                      />
                      <Button size="sm" variant="destructive" onClick={() => this.removeEquipmentMetric(metric.id)}>
                        Remover
                      </Button>
                    </Stack>
                  ))}
                </Stack>
              )}
              <Button onClick={this.addEquipmentMetric} style={{ marginTop: 8 }}>
                + Adicionar Metrica
              </Button>
            </div>

            <div style={{ marginTop: 12 }}>
              <Stack direction="row" gap={1} justifyContent="flex-end">
                <Button variant="secondary" onClick={this.cancelEditEquipment}>
                  Cancelar
                </Button>
                <Button onClick={this.addEquipment}>{this.state.editingEquipmentId ? 'Salvar' : 'Adicionar'}</Button>
              </Stack>
            </div>
          </div>

          <Modal.ButtonRow>
            <Button variant="secondary" onClick={this.closePopModal}>
              Cancelar
            </Button>
            <Button onClick={this.savePop} disabled={!draftPop.name.trim()}>
              Salvar POP
            </Button>
          </Modal.ButtonRow>
        </Stack>
        {this.renderMapModal()}
      </Modal>
    );
  }

  render() {
    return (
      <Stack direction="column" gap={2}>
        <div>
          <Button onClick={this.openAddPop}>Adicionar POP</Button>
        </div>

        {this.pops.length > 0 && this.renderPopList()}

        {this.renderPopModal()}
      </Stack>
    );
  }
}
