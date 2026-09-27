import { describe, expect, it } from 'vitest';

import { sortRows } from '../use-table-sort';

type Row = { name: string | null; amount: number | null; active: boolean };

const rows: Row[] = [
  { name: 'item 10', amount: 5, active: false },
  { name: null, amount: null, active: true },
  { name: 'Item 2', amount: 50, active: true },
  { name: 'apple', amount: 1, active: false },
];

describe('sortRows', () => {
  it('orders text the way people read it — case-blind, numbers by value', () => {
    const sorted = sortRows(rows, (row) => row.name, 'asc').map((row) => row.name);
    expect(sorted).toEqual(['apple', 'Item 2', 'item 10', null]);
  });

  it('keeps empty values last in either direction', () => {
    expect(sortRows(rows, (row) => row.amount, 'desc').map((row) => row.amount)).toEqual([
      50,
      5,
      1,
      null,
    ]);
    expect(sortRows(rows, (row) => row.name, 'desc').at(-1)?.name).toBeNull();
  });

  it('sorts booleans false before true ascending', () => {
    expect(sortRows(rows, (row) => row.active, 'asc').map((row) => row.active)).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('leaves the input array untouched', () => {
    const before = [...rows];
    sortRows(rows, (row) => row.name, 'asc');
    expect(rows).toEqual(before);
  });
});
