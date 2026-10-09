import { describe, expect, it } from 'vitest';
import { buttonVariants } from '../components/ui/button';
import { cn } from './cn';

describe('cn()', () => {
  it('keeps a text colour next to the custom text-ui font size', () => {
    expect(cn('text-accent-fg', 'text-ui')).toBe('text-accent-fg text-ui');
    expect(cn('text-ui', 'text-fg-muted')).toBe('text-ui text-fg-muted');
  });

  it('still resolves conflicts within the same group', () => {
    expect(cn('text-ui', 'text-sm')).toBe('text-sm');
    expect(cn('text-fg', 'text-fg-muted')).toBe('text-fg-muted');
    expect(cn('shadow-sm', 'shadow-glow')).toBe('shadow-glow');
  });

  it('gives buttons on solid fills their readable text colour', () => {
    expect(cn(buttonVariants({ variant: 'primary', size: 'md' })).split(' ')).toContain('text-accent-fg');
    expect(cn(buttonVariants({ variant: 'danger', size: 'md' })).split(' ')).toContain('text-danger-fg');
  });
});
