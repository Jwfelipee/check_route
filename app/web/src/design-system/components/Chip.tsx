import type { ReactNode } from 'react';
import type { Tom } from '../tone';

export const Chip = ({ tone, children }: { tone?: Tom; children: ReactNode }) => <span className="ds-chip" data-c={tone || undefined}>{children}</span>;
export const Pill = ({ tone, children }: { tone?: Tom; children: ReactNode }) => <span className="ds-pill" data-c={tone || undefined}>{children}</span>;
