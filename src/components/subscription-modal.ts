/**
 * Upcoming Subscription & SaaS Pricing Tiers Modal
 */
import { authStore } from '../auth/auth-store';

export function showSubscriptionModal(): void {
  const existing = document.getElementById('saas-subscription-modal');
  if (existing) existing.remove();

  const currentUser = authStore.getCurrentUser();

  const modal = document.createElement('div');
  modal.id = 'saas-subscription-modal';
  modal.className = 'saas-overlay';

  modal.innerHTML = `
    <div class="saas-modal-card" style="max-width: 900px; width: 95vw;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 24px;">
        <div>
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#38bdf8; margin-bottom:4px;">
            ⚡ UPCOMING SAAS TIERS PREVIEW
          </div>
          <h2 style="margin:0; font-size:24px; font-weight:800; color:#fff;">Choose the Right CAD Power for Your Team</h2>
          <p style="margin:6px 0 0; font-size:13px; color:#94a3b8;">
            Current Plan: <strong style="color:#38bdf8; text-transform:uppercase;">${currentUser.plan.toUpperCase()} TIER</strong> — All features currently unlocked for beta evaluation.
          </p>
        </div>
        <button id="sub-modal-close" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;" title="Close">✕</button>
      </div>

      <!-- Pricing Cards Matrix -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px;">
        
        <!-- Free Starter -->
        <div class="saas-plan-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:18px; color:#fff;">Starter CAD</h3>
            <span class="saas-badge-tag">Community</span>
          </div>
          <p style="font-size:12px; color:#94a3b8; margin:0;">Ideal for individual engineers & single rack setups.</p>
          <div class="saas-plan-price">$0 <span>/ forever</span></div>
          <ul class="saas-feature-list">
            <li class="saas-feature-item check">Up to 3 Active Rack Designs</li>
            <li class="saas-feature-item check">2D Elevation View & Cable Routing</li>
            <li class="saas-feature-item check">Standard Device Catalog</li>
            <li class="saas-feature-item check">Basic PDF Report Export</li>
          </ul>
          <button id="plan-starter-btn" class="saas-btn-secondary" style="margin-top:auto; width:100%;">
            ${currentUser.plan === 'free' ? 'Current Active Plan' : 'Downgrade to Starter'}
          </button>
        </div>

        <!-- Pro CAD (Featured) -->
        <div class="saas-plan-card featured">
          <div style="position:absolute; top:-12px; right:20px; background:#38bdf8; color:#0b0f19; font-size:10px; font-weight:800; padding:2px 10px; border-radius:12px; text-transform:uppercase;">
            POPULAR FOR PROS
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:18px; color:#38bdf8;">Pro CAD Studio</h3>
            <span class="saas-badge-tag" style="background:rgba(56,189,248,0.2); color:#38bdf8;">PRO</span>
          </div>
          <p style="font-size:12px; color:#94a3b8; margin:0;">For datacenter managers & system integrators.</p>
          <div class="saas-plan-price">$29 <span>/ month / seat</span></div>
          <ul class="saas-feature-list">
            <li class="saas-feature-item check">Unlimited Server Racks & Datacenters</li>
            <li class="saas-feature-item check">3D WebGL Photorealistic Viewport</li>
            <li class="saas-feature-item check">AI Architect Engine (Gemini & Claude)</li>
            <li class="saas-feature-item check">AWS / Azure / GCP Cloud Canvas</li>
            <li class="saas-feature-item check">Custom Asset Creator & BOM Generator</li>
          </ul>
          <button id="plan-pro-btn" class="saas-btn-primary" style="margin-top:auto; width:100%;">
            ${currentUser.plan === 'pro' ? 'Current Plan' : 'Request Pro Upgrade'}
          </button>
        </div>

        <!-- Enterprise -->
        <div class="saas-plan-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:18px; color:#c084fc;">Enterprise Data Hall</h3>
            <span class="saas-badge-tag" style="background:rgba(192,132,252,0.15); color:#c084fc;">ENTERPRISE</span>
          </div>
          <p style="font-size:12px; color:#94a3b8; margin:0;">Custom solutions for large data halls & telecom ops.</p>
          <div class="saas-plan-price">$99 <span>/ month / team</span></div>
          <ul class="saas-feature-list">
            <li class="saas-feature-item check">Everything in Pro CAD</li>
            <li class="saas-feature-item check">Multi-user Real-time Collaboration</li>
            <li class="saas-feature-item check">Custom ESD Raised Floor Grids</li>
            <li class="saas-feature-item check">Dedicated Cloud Storage & SSO</li>
            <li class="saas-feature-item check">24/7 Priority Engineering Support</li>
          </ul>
          <button id="plan-ent-btn" class="saas-btn-secondary" style="margin-top:auto; width:100%;">
            ${currentUser.plan === 'enterprise' ? 'Current Plan' : 'Contact Enterprise Sales'}
          </button>
        </div>

      </div>

      <div style="margin-top:20px; padding:12px 16px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:12px; color:#94a3b8;">
          💡 Need a custom enterprise deployment or offline license?
        </span>
        <button id="waitlist-btn" style="background:none; border:none; color:#38bdf8; font-size:12px; font-weight:700; cursor:pointer; text-decoration:underline;">
          Join Enterprise Priority Waitlist →
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#sub-modal-close')?.addEventListener('click', () => modal.remove());

  const handleUpgrade = (planName: 'pro' | 'enterprise') => {
    authStore.updateProfile({ plan: planName });
    alert(`🎉 Upgrade request recorded! Your account has been upgraded to the ${planName.toUpperCase()} Tier for beta evaluation.`);
    modal.remove();
  };

  modal.querySelector('#plan-pro-btn')?.addEventListener('click', () => handleUpgrade('pro'));
  modal.querySelector('#plan-ent-btn')?.addEventListener('click', () => handleUpgrade('enterprise'));
  modal.querySelector('#waitlist-btn')?.addEventListener('click', () => {
    alert('✨ Thank you! You have been added to the Rack Slicer Enterprise Priority Waitlist.');
    modal.remove();
  });
}
