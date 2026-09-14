// Startup / landing screen — shown once per app load (see app.ts's init()), letting the user
// pick what kind of design to start with before they land on a canvas. Purely a navigation aid:
// each choice does exactly what its equivalent sidebar nav-tree entry does (see sidebar.ts's
// NAV_TREE + focusCloudProvider()), it doesn't touch or reset any existing project data.

export type StartupChoice = 'rack' | 'datacenter' | 'flowchart' | 'aws' | 'azure' | 'gcp' | 'hybrid';

interface StartupOption {
  choice: StartupChoice;
  icon: string;
  title: string;
  description: string;
  accent: string;
}

const STARTUP_OPTIONS: StartupOption[] = [
  {
    choice: 'rack',
    icon: '📦',
    title: 'Rack Design',
    description: 'On-prem server racks, device elevations, cabling, and 3D viewport.',
    accent: '#58a6ff',
  },
  {
    choice: 'datacenter',
    icon: '🏢',
    title: 'Datacenter',
    description: 'ESD raised-floor grid planner, data hall layout, 2D & 3D floor visualization.',
    accent: '#38bdf8',
  },
  {
    choice: 'flowchart',
    icon: '🔀',
    title: 'Flowchart',
    description: 'Process diagrams, workflow logic, decisions, connectors, and system state charts.',
    accent: '#a855f7',
  },
  {
    choice: 'aws',
    icon: '🟧',
    title: 'AWS',
    description: 'Cloud architecture diagram focused on the AWS icon library.',
    accent: '#FF9900',
  },
  {
    choice: 'azure',
    icon: '🔷',
    title: 'Azure',
    description: 'Cloud architecture diagram focused on the Azure icon library.',
    accent: '#0078D4',
  },
  {
    choice: 'gcp',
    icon: '🔴',
    title: 'GCP',
    description: 'Cloud architecture diagram focused on the Google Cloud icon library.',
    accent: '#4285F4',
  },
  {
    choice: 'hybrid',
    icon: '🌐',
    title: 'Hybrid',
    description: 'One 2D canvas, every tool at once — rack devices alongside Local Resources, AWS, Azure, and GCP icons, all together.',
    accent: '#8b949e',
  },
];

/** Shows the full-screen startup overlay. `onChoose` fires once, after which the modal removes
 *  itself; dismissing via ✕ or Escape calls it with `null` (stay on whatever view is already
 *  active — the app's own default, not a decision this screen makes). */
export function showStartupModal(onChoose: (choice: StartupChoice | null) => void): void {
  const existing = document.getElementById('startup-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'startup-modal';
  modal.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(10, 12, 16, 0.86); backdrop-filter: blur(14px);
    z-index: 10001; display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', system-ui, sans-serif; color: #fff;
  `;

  const closeModal = (choice: StartupChoice | null) => {
    modal.remove();
    document.removeEventListener('keydown', onKeydown);
    onChoose(choice);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeModal(null);
  };
  document.addEventListener('keydown', onKeydown);

  const cardsHtml = STARTUP_OPTIONS.map(opt => `
    <button class="startup-card" data-choice="${opt.choice}" style="
      display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
      width: 190px; padding: 20px 18px; text-align: left;
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px; cursor: pointer; color: #fff; font-family: inherit;
      transition: transform 0.12s ease, border-color 0.12s ease, background 0.12s ease;
    ">
      <span style="font-size: 30px;">${opt.icon}</span>
      <span style="font-size: 15px; font-weight: 700; color: ${opt.accent};">${opt.title}</span>
      <span style="font-size: 12px; color: #8b949e; line-height: 1.45;">${opt.description}</span>
    </button>
  `).join('');

  modal.innerHTML = `
    <div style="max-width: 960px; width: 92vw; text-align: center;">
      <div style="display: flex; justify-content: flex-end;">
        <button id="startup-modal-close" title="Skip" style="background: none; border: none; color: #8b949e; font-size: 20px; cursor: pointer; padding: 4px 8px;">✕</button>
      </div>
      <h1 style="margin: 0 0 6px; font-size: 24px; font-weight: 800;">What are you designing today?</h1>
      <p style="margin: 0 0 28px; font-size: 13px; color: #8b949e;">Pick a starting point — you can switch views anytime from the sidebar.</p>
      <div style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: center;">
        ${cardsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#startup-modal-close')?.addEventListener('click', () => closeModal(null));

  modal.querySelectorAll<HTMLButtonElement>('.startup-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.background = 'rgba(255,255,255,0.06)';
      card.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'none';
      card.style.background = 'rgba(255,255,255,0.03)';
      card.style.borderColor = 'rgba(255,255,255,0.08)';
    });
    card.addEventListener('click', () => {
      closeModal(card.dataset.choice as StartupChoice);
    });
  });
}
