/**
 * RackSlicer — Architecture Detail & Community Discussion Modal
 * Implements Section 14, 16, 17, 19, 20 of Master Unified Product Blueprint:
 * - Multi-dimensional RackSlicer Architecture Score (AI Breakdown)
 * - Community Ratings & Written Reviews
 * - Threaded Discussions with Author badges and replies
 * - Fork / Remix with full attribution lineage
 * - Direct Open in Rack Builder
 */

import { PublishedArchitecture } from '../community/design-hub-types';
import { designHubStore } from '../community/design-hub-store';
import { socialShareModal } from './social-share-modal';
import EventBus from '../core/event-bus';

export class DesignDetailModal {
  private overlay: HTMLElement | null = null;
  private design: PublishedArchitecture | null = null;

  public open(designIdOrObj: string | PublishedArchitecture): void {
    this.close();

    if (typeof designIdOrObj === 'string') {
      const found = designHubStore.getDesignById(designIdOrObj);
      if (!found) return;
      this.design = found;
    } else {
      this.design = designIdOrObj;
    }

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

    const score = this.design.rackSlicerScore;

    this.overlay = document.createElement('div');
    this.overlay.className = 'dh-modal-overlay';

    this.overlay.innerHTML = `
      <div class="dh-modal-card dh-detail-modal">
        <!-- Header -->
        <div class="dh-modal-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span class="dh-classification-badge ${this.design.classification}">
              ${this.design.classification === 'private' ? '🔒' : this.design.classification === 'invite-only' ? '👥' : '🌐'}
              ${this.design.classification}
            </span>
            <span class="dh-origin-badge ${this.design.generationSource === 'ai-generated' ? 'ai-gen' : 'human-gen'}">
              ${this.design.generationSource === 'ai-generated' ? '🤖 AI Generated' : '👤 Human Generated'}
            </span>
            <span class="dh-category-badge">${this.design.category}</span>
            <span style="font-size: 13px; font-weight: 700; color: #cbd5e1;">${this.design.version}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="dh-btn-action" id="dh-detail-share-btn">↗ Share</button>
            <button class="dh-btn-action fork" id="dh-detail-fork-btn">🔀 Fork & Customize</button>
            <button class="dh-btn-action primary" id="dh-detail-open-btn">📂 Open in Builder</button>
            <button class="dh-modal-close" id="dh-detail-close">✕</button>
          </div>
        </div>

        <!-- Body with Two Columns -->
        <div class="dh-modal-body">
          <div class="dh-detail-layout">
            <!-- Left Column: Specs, Score Breakdown, Versions -->
            <div class="dh-detail-left">
              <div>
                <h2 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 800; color: #ffffff;">${this.design.title}</h2>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 12px; color: #94a3b8;">
                  <span>By <strong style="color: #f1f5f9;">@${this.design.author.username}</strong> (${this.design.author.title})</span>
                  <span>•</span>
                  <span>Origin: <strong style="color: ${this.design.generationSource === 'ai-generated' ? '#c084fc' : '#38bdf8'};">${this.design.generationSource === 'ai-generated' ? '🤖 AI Generated' : '👤 Human Generated'}</strong></span>
                  <span>•</span>
                  <span>License: <strong style="color: #cbd5e1;">${this.design.license}</strong></span>
                </div>
                ${
                  this.design.forkLineage
                    ? `
                  <div class="dh-lineage">
                    <span>🔀</span>
                    <span>Based on: <strong>${this.design.forkLineage.originalTitle}</strong> by @${this.design.forkLineage.originalAuthor}</span>
                  </div>
                `
                    : ''
                }
                <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #cbd5e1;">${this.design.description}</p>
              </div>

              <!-- Thumbnail image -->
              <div style="border-radius: 8px; overflow: hidden; border: 1px solid #334155; height: 180px;">
                <img src="${this.design.thumbnailUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="Preview" />
              </div>

              <!-- Multi-dimensional RackSlicer AI Score -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <span style="font-size: 13px; font-weight: 800; color: #ffffff; text-transform: uppercase; letter-spacing: 0.05em;">🤖 RackSlicer Architecture Score</span>
                  <span style="font-size: 16px; font-weight: 800; color: #38bdf8;">${score.overall} / 100</span>
                </div>

                <div class="dh-score-dimension-list">
                  ${this.renderScoreBar('Architecture Quality', score.architectureQuality)}
                  ${this.renderScoreBar('Fault Tolerance & Resilience', score.resilience)}
                  ${this.renderScoreBar('Network Fabric & Mesh', score.networkArchitecture)}
                  ${this.renderScoreBar('Storage Design & IOPS', score.storageDesign)}
                  ${this.renderScoreBar('Cost Efficiency (TCO)', score.costEfficiency)}
                  ${this.renderScoreBar('Horizontal Scalability', score.scalability)}
                  ${this.renderScoreBar('Security & Air-Gap Compliance', score.security)}
                  ${this.renderScoreBar('Documentation & Tagging', score.documentation)}
                </div>
              </div>

              <!-- Version History -->
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Version Lineage</div>
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
                  ${this.design.versions
                    .map(
                      v => `
                    <div style="padding: 8px 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid #334155; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
                      <div>
                        <strong style="color: #38bdf8;">${v.version}</strong> — <span style="color: #cbd5e1;">${v.changelog}</span>
                      </div>
                      <span style="color: #64748b; font-size: 11px;">Score: ${v.score}</span>
                    </div>
                  `
                    )
                    .join('')}
                </div>
              </div>
            </div>

            <!-- Right Column: Community Reviews & Discussions -->
            <div class="dh-detail-right">
              <!-- Community Ratings -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <div style="font-size: 14px; font-weight: 800; color: #ffffff;">Community Rating</div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 16px; font-weight: 800; color: #f59e0b;">★ ${this.design.communityRating.average.toFixed(1)}</span>
                    <span style="font-size: 12px; color: #64748b;">(${this.design.communityRating.count} reviews)</span>
                  </div>
                </div>

                <!-- Add Review Box -->
                <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 14px;">
                  <div style="font-size: 12px; font-weight: 700; color: #cbd5e1; margin-bottom: 6px;">Leave an Architecture Review</div>
                  <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <select id="dh-review-stars" style="padding: 6px 10px; background: #0b0f19; border: 1px solid #475569; border-radius: 6px; color: #f59e0b; font-weight: 700;">
                      <option value="5">★★★★★ (5 - Excellent)</option>
                      <option value="4">★★★★☆ (4 - Solid)</option>
                      <option value="3">★★★☆☆ (3 - Average)</option>
                      <option value="2">★★☆☆☆ (2 - Needs Work)</option>
                      <option value="1">★☆☆☆☆ (1 - Flawed)</option>
                    </select>
                    <input type="text" id="dh-review-text" placeholder="Share technical feedback on cabling, HA or power..." style="flex: 1; padding: 6px 12px; background: #0b0f19; border: 1px solid #475569; border-radius: 6px; color: #fff; font-size: 12px;" />
                    <button class="dh-btn-action" id="dh-review-submit-btn" style="background: #0284c7; color: #fff;">Post</button>
                  </div>
                </div>

                <!-- Recent Reviews -->
                <div style="display: flex; flex-direction: column; gap: 8px; max-height: 160px; overflow-y: auto;">
                  ${
                    this.design.communityRating.reviews.length === 0
                      ? '<div style="font-size: 12px; color: #64748b;">No written reviews yet. Be the first to review!</div>'
                      : this.design.communityRating.reviews
                          .map(
                            r => `
                      <div style="background: rgba(15, 23, 42, 0.5); border: 1px solid #334155; border-radius: 6px; padding: 8px 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px;">
                          <strong style="color: #f1f5f9;">${r.userName}</strong>
                          <span style="color: #f59e0b;">${'★'.repeat(r.rating)}</span>
                        </div>
                        <div style="font-size: 12px; color: #cbd5e1;">${r.comment}</div>
                      </div>
                    `
                          )
                          .join('')
                  }
                </div>
              </div>

              <!-- Technical Discussions -->
              <div style="flex: 1; display: flex; flex-direction: column;">
                <div style="font-size: 14px; font-weight: 800; color: #ffffff; margin-bottom: 8px;">Technical Architecture Discussion</div>

                <!-- Post Discussion Input -->
                <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                  <input type="text" id="dh-disc-input" placeholder="Ask author a question about switches, PDU feeds, latency..." style="flex: 1; padding: 8px 12px; background: #0b0f19; border: 1px solid #475569; border-radius: 6px; color: #ffffff; font-size: 12px;" />
                  <button class="dh-btn-action primary" id="dh-disc-submit-btn">Ask Question</button>
                </div>

                <!-- Discussion Threads -->
                <div class="dh-discussion-list" id="dh-disc-threads-container" style="flex: 1; overflow-y: auto;">
                  ${
                    this.design.discussions.length === 0
                      ? '<div style="font-size: 12px; color: #64748b; padding: 12px 0;">No questions or comments yet. Start the discussion!</div>'
                      : this.design.discussions
                          .map(
                            d => `
                      <div class="dh-discussion-card">
                        <div class="dh-disc-author">
                          <div>
                            <span class="dh-disc-name">${d.userName}</span>
                            ${d.isAuthor ? '<span class="dh-author-tag">Author</span>' : ''}
                          </div>
                          <span style="color: #64748b; font-size: 11px;">${new Date(d.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div class="dh-disc-text">${d.text}</div>
                        <div class="dh-disc-actions">
                          <button class="dh-disc-like" data-disc-id="${d.id}">👍 ${d.likes || 0} Upvotes</button>
                          <span>•</span>
                          <span>${d.replies.length} replies</span>
                        </div>
                        ${
                          d.replies.length > 0
                            ? `
                          <div style="margin-top: 8px; padding-left: 12px; border-left: 2px solid #334155; display: flex; flex-direction: column; gap: 6px;">
                            ${d.replies
                              .map(
                                rep => `
                              <div style="font-size: 11px;">
                                <strong style="color: #38bdf8;">${rep.userName}</strong>
                                ${rep.isAuthor ? '<span class="dh-author-tag">Author</span>' : ''}:
                                <span style="color: #cbd5e1;">${rep.text}</span>
                              </div>
                            `
                              )
                              .join('')}
                          </div>
                        `
                            : ''
                        }
                      </div>
                    `
                          )
                          .join('')
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.attachEventListeners();
  }

  private renderScoreBar(label: string, val: number): string {
    return `
      <div class="dh-dim-row">
        <div class="dh-dim-header">
          <span>${label}</span>
          <span style="font-weight: 700; color: #38bdf8;">${val}%</span>
        </div>
        <div class="dh-dim-bar-wrap">
          <div class="dh-dim-bar" style="width: ${val}%;"></div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    if (!this.overlay || !this.design) return;

    // Close button
    const closeBtn = this.overlay.querySelector('#dh-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // Share button
    const shareBtn = this.overlay.querySelector('#dh-detail-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (this.design) socialShareModal.open(this.design);
      });
    }

    // Fork button
    const forkBtn = this.overlay.querySelector('#dh-detail-fork-btn');
    if (forkBtn) {
      forkBtn.addEventListener('click', () => {
        if (!this.design) return;
        try {
          const forkedProject = designHubStore.forkDesign(this.design.id);
          this.close();
          EventBus.emit('notification:show' as any, {
            type: 'success',
            title: 'Design Forked!',
            message: `Created editable copy in your workspace: "${forkedProject.name}"`,
          });
          EventBus.emit('project:load' as any, forkedProject);
        } catch (err: any) {
          alert(`Could not fork design: ${err.message}`);
        }
      });
    }

    // Open in builder button
    const openBtn = this.overlay.querySelector('#dh-detail-open-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (!this.design) return;
        this.close();
        // Load design JSON directly into active canvas
        EventBus.emit('design:open-in-builder' as any, this.design);
      });
    }

    // Submit review
    const reviewBtn = this.overlay.querySelector('#dh-review-submit-btn');
    const reviewInput = this.overlay.querySelector('#dh-review-text') as HTMLInputElement;
    const reviewStars = this.overlay.querySelector('#dh-review-stars') as HTMLSelectElement;
    if (reviewBtn && reviewInput && reviewStars) {
      reviewBtn.addEventListener('click', () => {
        const comment = reviewInput.value.trim();
        const stars = parseInt(reviewStars.value, 10) || 5;
        if (comment && this.design) {
          designHubStore.addReview(this.design.id, stars, comment);
          this.render(); // Re-render updated state
        }
      });
    }

    // Submit discussion
    const discBtn = this.overlay.querySelector('#dh-disc-submit-btn');
    const discInput = this.overlay.querySelector('#dh-disc-input') as HTMLInputElement;
    if (discBtn && discInput) {
      discBtn.addEventListener('click', () => {
        const text = discInput.value.trim();
        if (text && this.design) {
          designHubStore.addDiscussion(this.design.id, text);
          this.render(); // Re-render updated state
        }
      });
    }

    // Upvote discussion
    const likeButtons = this.overlay.querySelectorAll('.dh-disc-like');
    likeButtons.forEach(btn => {
      btn.addEventListener('click', e => {
        const target = e.currentTarget as HTMLElement;
        const discId = target.getAttribute('data-disc-id');
        if (discId && this.design) {
          const count = designHubStore.likeDiscussion(this.design.id, discId);
          target.textContent = `👍 ${count} Upvotes`;
        }
      });
    });
  }
}

export const designDetailModal = new DesignDetailModal();
