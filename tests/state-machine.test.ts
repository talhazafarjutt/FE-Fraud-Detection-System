import { describe, expect, it } from 'vitest';
import { transitionsFor } from '@/features/alerts/stateMachine';

const ANALYST = ['alerts:read', 'alerts:update', 'transactions:read'];
const SUPERVISOR = [
  'alerts:read',
  'alerts:read:all',
  'alerts:update',
  'alerts:assign',
  'alerts:close',
  'transactions:read',
];

const targets = (from: string, scopes: string[]) => transitionsFor(from, scopes).map((t) => t.to);
const allowed = (from: string, scopes: string[]) =>
  transitionsFor(from, scopes).filter((t) => t.allowed).map((t) => t.to);

describe('alert state machine', () => {
  it('offers only legal transitions', () => {
    expect(targets('OPEN', SUPERVISOR)).toEqual(['IN_REVIEW', 'ESCALATED', 'FALSE_POSITIVE']);
    expect(targets('ESCALATED', SUPERVISOR)).toEqual(['CONFIRMED_FRAUD', 'FALSE_POSITIVE']);
    // CONFIRMED_FRAUD is not reachable directly from OPEN.
    expect(targets('OPEN', SUPERVISOR)).not.toContain('CONFIRMED_FRAUD');
  });

  it('returns nothing for an unknown status rather than guessing', () => {
    expect(transitionsFor('SOMETHING_NEW', SUPERVISOR)).toEqual([]);
  });

  it('gates terminal moves behind alerts:close', () => {
    // The analyst can move a case forward but cannot end it.
    expect(allowed('OPEN', ANALYST)).toEqual(['IN_REVIEW', 'ESCALATED']);
    expect(allowed('IN_REVIEW', ANALYST)).toEqual(['ESCALATED', 'OPEN']);
    expect(allowed('IN_REVIEW', SUPERVISOR)).toEqual([
      'ESCALATED',
      'CONFIRMED_FRAUD',
      'FALSE_POSITIVE',
      'OPEN',
    ]);
  });

  it('explains why a gated move is unavailable', () => {
    const blocked = transitionsFor('IN_REVIEW', ANALYST).find((t) => t.to === 'CONFIRMED_FRAUD');
    expect(blocked?.allowed).toBe(false);
    expect(blocked?.reason).toBe('Closing requires a supervisor.');
  });

  it('requires alerts:close to reopen a closed case', () => {
    expect(allowed('CLOSED', ANALYST)).toEqual([]);
    expect(allowed('CLOSED', SUPERVISOR)).toEqual(['OPEN', 'IN_REVIEW']);

    const reopen = transitionsFor('CLOSED', ANALYST)[0];
    expect(reopen?.reason).toBe('Reopening a closed case requires a supervisor.');
  });

  it('blocks everything without alerts:update', () => {
    const readOnly = transitionsFor('OPEN', ['alerts:read']);
    expect(readOnly.every((t) => !t.allowed)).toBe(true);
    expect(readOnly[0]?.reason).toBe('Updating a case requires an analyst role.');
  });
});
