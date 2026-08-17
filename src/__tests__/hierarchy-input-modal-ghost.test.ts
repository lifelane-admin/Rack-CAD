import { describe, it, expect } from 'vitest';
import { ghostSuggestionText } from '../components/hierarchy-input-modal';

/** Inline ghost-text suggestion shown inside the "describe infra in one line" input (the gray
 *  text after the cursor showing what's left to type) — see hierarchy-input-modal.ts. */
describe('ghostSuggestionText', () => {
  it('shows the full template when the field is empty', () => {
    expect(ghostSuggestionText('', 'azure')).toBe(
      'Subscription Name / Region Name / Resource Group Name / VNet Name / Subnet Name',
    );
  });

  it('shows the remaining template once a level is committed with a trailing slash', () => {
    expect(ghostSuggestionText('T1/', 'azure')).toBe('Region Name / Resource Group Name / VNet Name / Subnet Name');
    expect(ghostSuggestionText('T1/South India/', 'azure')).toBe('Resource Group Name / VNet Name / Subnet Name');
  });

  it('mid-segment (no trailing slash), does not duplicate the segment currently being typed', () => {
    expect(ghostSuggestionText('T1/South Ind', 'azure')).toBe(' / Resource Group Name / VNet Name / Subnet Name');
  });

  it('is empty once all 5 levels are committed', () => {
    expect(ghostSuggestionText('a/b/c/d/e/', 'azure')).toBe('');
    expect(ghostSuggestionText('a/b/c/d/e', 'azure')).toBe('');
  });

  it('uses provider-specific terms (Account/VPC for AWS vs Subscription/VNet for Azure)', () => {
    expect(ghostSuggestionText('', 'aws')).toBe('Account Name / Region Name / Resource Group Name / VPC Name / Subnet Name');
    expect(ghostSuggestionText('', 'gcp')).toBe('Project Name / Region Name / Resource Group Name / VPC Name / Subnet Name');
  });
});
