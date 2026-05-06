import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ModelDetail,
  buildModelExportPayload,
  slugifyModelName,
} from '../../src/ui/ModelDetail.jsx';

const baseModel = {
  id: 'm1',
  name: 'Emergency Desk',
  description: 'A small queueing model',
  visibility: 'private',
  access: {},
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
  owner_id: 'user-1',
};

const renderDetail = (modelData = baseModel) => render(
  <ModelDetail
    modelId="m1"
    modelData={modelData}
    onBack={vi.fn()}
    onRefresh={vi.fn()}
    overrides={{
      isOwner: true,
      canEdit: true,
      profiles: [],
      userId: 'user-1',
      onSave: vi.fn(),
      onDelete: vi.fn(),
      onSetVisibility: vi.fn(),
      onSetAccess: vi.fn(),
    }}
  />
);

describe('model JSON export', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:des-studio-export');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('renders the Export Model button for a loaded model', () => {
    renderDetail();

    expect(screen.getByRole('button', { name: /export model/i })).toBeInTheDocument();
  });

  it('builds an export payload with metadata and model_json', () => {
    const payload = buildModelExportPayload(baseModel, '2026-05-04T12:00:00.000Z');

    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Emergency Desk',
        description: 'A small queueing model',
        exportedAt: '2026-05-04T12:00:00.000Z',
        appVersion: expect.any(String),
        model_json: {
          entityTypes: [],
          stateVariables: [],
          bEvents: [],
          cEvents: [],
          queues: [],
        },
      })
    );
  });

  it('generates stable filename slugs from model names', () => {
    expect(slugifyModelName('Emergency Desk v2!')).toBe('emergency-desk-v2');
    expect(slugifyModelName('   ')).toBe('untitled');
  });

  it('warns before exporting a model with validation errors', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderDetail({
      ...baseModel,
      entityTypes: [{ id: 'et1', name: '', role: 'customer', attrDefs: [] }],
    });

    fireEvent.click(screen.getByRole('button', { name: /export model/i }));

    expect(confirmSpy).toHaveBeenCalledWith('This model has validation errors. Export anyway?');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('downloads and revokes the export object URL', () => {
    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: /export model/i }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:des-studio-export');
  });
});
