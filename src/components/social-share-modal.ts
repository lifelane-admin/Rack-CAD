/**
 * RackSlicer — Social Share Modal
 * Implements Section 15 & 18 of Master Unified Product Blueprint:
 * 1-click sharing to LinkedIn, X (Twitter), Facebook, WhatsApp, and Copy Link
 * with Open Graph visual preview card and RackSlicer AI Architecture Score.
 */

import { PublishedArchitecture } from '../community/design-hub-types';
import EventBus from '../core/event-bus';

export class SocialShareModal {
  private overlay: HTMLElement | null = null;
  private design: PublishedArchitecture | null = null;

  public open(design: PublishedArchitecture): void {
    this.close();
    this.design = design;
    this.render();
  }

  public close(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  private render(): void {
    if (!this.design) return;

    const shareUrl = `${window.location.origin}/#design/${this.design.slug}`;
    const shareText = `Check out "${this.design.title}" designed on RackSlicer! Architecture Quality Score: ${this.design.rackSlicerScore.overall}/100.`;

    this.overlay = document.createElement('div');
    this.overlay.className = 'dh-modal-overlay';

    this.overlay.innerHTML = `
      <div class="dh-modal-card dh-share-modal">
        <div class="dh-modal-header">
          <div class="dh-modal-title">
            <span>↗ Share Architecture Blueprint</span>
          </div>
          <button class="dh-modal-close" id="dh-share-close">✕</button>
        </div>

        <div class="dh-modal-body">
          <!-- Social Card Preview -->
          <div class="dh-share-preview-card">
            <img src="${this.design.thumbnailUrl}" class="dh-share-preview-img" alt="Thumbnail" />
            <div class="dh-share-preview-content">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase;">${this.design.category}</span>
                <span style="font-size: 11px; font-weight: 800; color: #34d399;">Score: ${this.design.rackSlicerScore.overall}/100</span>
              </div>
              <div class="dh-share-preview-title">${this.design.title}</div>
              <div class="dh-share-preview-meta">By @${this.design.author.username} • Verified Infrastructure Architecture</div>
            </div>
          </div>

          <!-- Share Platform Buttons -->
          <div class="dh-social-buttons">
            <button class="dh-btn-social linkedin" id="dh-share-linkedin">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
              Share on LinkedIn
            </button>

            <button class="dh-btn-social x" id="dh-share-x">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Post to X
            </button>

            <button class="dh-btn-social whatsapp" id="dh-share-wa">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
              Send on WhatsApp
            </button>

            <button class="dh-btn-social facebook" id="dh-share-fb">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/></svg>
              Share on Facebook
            </button>
          </div>

          <!-- Direct Link Copy -->
          <div>
            <label style="display: block; font-size: 11px; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">Direct Architecture Link</label>
            <div class="dh-copy-link-box">
              <input type="text" id="dh-share-link-input" value="${shareUrl}" readonly />
              <button class="dh-btn-action primary" id="dh-share-copy-btn">📋 Copy</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.attachEventListeners(shareUrl, shareText);
  }

  private attachEventListeners(shareUrl: string, shareText: string): void {
    if (!this.overlay || !this.design) return;

    const closeBtn = this.overlay.querySelector('#dh-share-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const linkedinBtn = this.overlay.querySelector('#dh-share-linkedin');
    if (linkedinBtn) {
      linkedinBtn.addEventListener('click', () => {
        window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
      });
    }

    const xBtn = this.overlay.querySelector('#dh-share-x');
    if (xBtn) {
      xBtn.addEventListener('click', () => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}&hashtags=Datacenter,Architecture,RackSlicer`, '_blank');
      });
    }

    const waBtn = this.overlay.querySelector('#dh-share-wa');
    if (waBtn) {
      waBtn.addEventListener('click', () => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`, '_blank');
      });
    }

    const fbBtn = this.overlay.querySelector('#dh-share-fb');
    if (fbBtn) {
      fbBtn.addEventListener('click', () => {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
      });
    }

    const copyBtn = this.overlay.querySelector('#dh-share-copy-btn');
    const linkInput = this.overlay.querySelector('#dh-share-link-input') as HTMLInputElement;
    if (copyBtn && linkInput) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          copyBtn.textContent = '✓ Copied!';
          EventBus.emit('notification:show' as any, {
            type: 'info',
            title: 'Link Copied',
            message: 'Public design URL copied to clipboard.',
          });
          setTimeout(() => {
            if (copyBtn) copyBtn.textContent = '📋 Copy';
          }, 2500);
        } catch {
          linkInput.select();
          document.execCommand('copy');
        }
      });
    }
  }
}

export const socialShareModal = new SocialShareModal();
