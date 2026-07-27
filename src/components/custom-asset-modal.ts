import { DeviceData, DeviceTemplate, DeviceCategory } from '../core/types';
// DeviceCategory imported for catSelect cast below
import { saveCustomTemplate } from '../library/custom-catalog';
import { stateManager } from '../core/state';
import { eventBus } from '../core/event-bus';

export class CustomAssetModal {
  private currentImage: string | undefined = undefined;

  show(
    device: DeviceData,
    baseTemplate: DeviceTemplate | null,
    existingCustomTemplate: DeviceTemplate | null,
    onSave: (t: DeviceTemplate) => void,
  ): void {
    const modal = document.getElementById('custom-asset-modal');
    if (!modal) return;

    this.currentImage = device.frontPanelImage ?? baseTemplate?.frontPanelImage;

    const nameInput    = document.getElementById('cam-name')    as HTMLInputElement;
    const catSelect    = document.getElementById('cam-cat')     as HTMLSelectElement;
    const basedOnEl    = document.getElementById('cam-based-on') as HTMLInputElement;
    const descTextarea = document.getElementById('cam-desc')    as HTMLTextAreaElement;

    if (existingCustomTemplate) {
      nameInput.value    = existingCustomTemplate.name;
      catSelect.value    = existingCustomTemplate.category;
      basedOnEl.value    = baseTemplate?.name ?? '—';
      descTextarea.value = existingCustomTemplate.customDescription ?? '';
      this.currentImage  = existingCustomTemplate.frontPanelImage ?? this.currentImage;
    } else {
      nameInput.value    = device.name || baseTemplate?.name || '';
      catSelect.value    = baseTemplate?.category ?? 'server';
      basedOnEl.value    = baseTemplate?.name ?? '—';
      descTextarea.value = '';
    }

    this.refreshImagePreview();
    modal.classList.remove('hidden');

    const uploadBtn = document.getElementById('cam-upload-btn');
    const removeBtn = document.getElementById('cam-remove-btn');

    const handleUpload = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        const file: File = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt: any) => {
          this.currentImage = evt.target.result as string;
          this.refreshImagePreview();
        };
        reader.readAsDataURL(file);
      };
      input.click();
    };

    const handleRemove = () => {
      this.currentImage = undefined;
      this.refreshImagePreview();
    };

    uploadBtn?.addEventListener('click', handleUpload, { once: true });
    removeBtn?.addEventListener('click', handleRemove, { once: true });

    const handleCancel = () => {
      modal.classList.add('hidden');
      cleanup();
    };

    const handleSave = () => {
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.style.borderColor = '#ef4444';
        return;
      }
      nameInput.style.borderColor = '';

      const newTemplate: DeviceTemplate = {
        id: existingCustomTemplate?.id ?? ('custom-' + crypto.randomUUID()),
        name,
        manufacturer: '',
        model: name,
        category: catSelect.value as DeviceCategory,
        heightUnits: baseTemplate?.heightUnits ?? 1,
        color: baseTemplate?.color ?? '#1a1a1e',
        icon: baseTemplate?.icon ?? '🖥️',
        ports: device.ports.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type,
          relativeX: p.relativeX,
          relativeY: p.relativeY,
          speed: p.speed,
          description: p.description,
        })),
        frontPanelImage: this.currentImage,
        isCustom: true,
        basedOnTemplateId: baseTemplate?.id,
        customDescription: descTextarea.value.trim() || undefined,
        createdAt: existingCustomTemplate?.createdAt ?? new Date().toISOString(),
      };

      saveCustomTemplate(newTemplate);

      const state = stateManager.getState();
      const existing = state.customTemplates.find(t => t.id === newTemplate.id);
      const customTemplates = existing
        ? state.customTemplates.map(t => t.id === newTemplate.id ? newTemplate : t)
        : [...state.customTemplates, newTemplate];
      stateManager.setState({ customTemplates });

      if (!existingCustomTemplate) {
        const devices = state.devices.map(d =>
          d.id === device.id ? { ...d, templateId: newTemplate.id } : d,
        );
        stateManager.setState({ devices });
      }

      eventBus.emit('notification' as any, { message: `Saved "${name}" to My Library`, type: 'success' });
      modal.classList.add('hidden');
      cleanup();
      onSave(newTemplate);
    };

    const cancelBtn = document.getElementById('cam-cancel');
    const saveBtn   = document.getElementById('cam-save');

    cancelBtn?.addEventListener('click', handleCancel, { once: true });
    saveBtn?.addEventListener('click', handleSave, { once: true });

    function cleanup() {
      cancelBtn?.removeEventListener('click', handleCancel);
      saveBtn?.removeEventListener('click', handleSave);
      uploadBtn?.removeEventListener('click', handleUpload);
      removeBtn?.removeEventListener('click', handleRemove);
    }
  }

  private refreshImagePreview(): void {
    const thumb   = document.getElementById('cam-image-thumb') as HTMLImageElement;
    const noImage = document.getElementById('cam-no-image');
    if (!thumb || !noImage) return;

    if (this.currentImage) {
      thumb.src = this.currentImage;
      thumb.classList.remove('hidden');
      noImage.classList.add('hidden');
    } else {
      thumb.classList.add('hidden');
      noImage.classList.remove('hidden');
    }
  }
}


