const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAssignments, isAssignableRole } = require('../services/employeeAssignmentService');

const P1 = '0000000000000000000000a1';
const P2 = '0000000000000000000000a2';
const P_INACTIVE = '0000000000000000000000a3';
const M1 = '0000000000000000000000b1'; // leaf under P1
const M2 = '0000000000000000000000b2'; // leaf under P1
const M3 = '0000000000000000000000b3'; // leaf under P2
const DISTRICT = '0000000000000000000000c1'; // has children under P1
const CATEGORY = '0000000000000000000000c2'; // category node under P1

const ctx = () => ({
  products: new Map([
    [P1, { status: 'active' }],
    [P2, { status: 'active' }],
    [P_INACTIVE, { status: 'inactive' }],
  ]),
  locations: new Map([
    [M1, { product: P1, kind: 'location' }],
    [M2, { product: P1, kind: 'location' }],
    [M3, { product: P2, kind: 'location' }],
    [DISTRICT, { product: P1, kind: 'location' }],
    [CATEGORY, { product: P1, kind: 'category' }],
  ]),
  nonLeafIds: new Set([DISTRICT]),
});

test('missing assignments normalize to an empty list', () => {
  assert.deepEqual(normalizeAssignments(undefined, ctx()), []);
  assert.deepEqual(normalizeAssignments([], ctx()), []);
});

test('Mandals across two products are kept under their own product', () => {
  const out = normalizeAssignments([
    { product: P1, mandals: [M1, M2] },
    { product: P2, mandals: [M3] },
  ], ctx());
  assert.deepEqual(out, [
    { product: P1, mandals: [M1, M2] },
    { product: P2, mandals: [M3] },
  ]);
});

test('duplicate Mandals and duplicate product entries are merged', () => {
  const out = normalizeAssignments([
    { product: P1, mandals: [M1, M1] },
    { product: P1, mandals: [M2, M1] },
  ], ctx());
  assert.deepEqual(out, [{ product: P1, mandals: [M1, M2] }]);
});

test('products with no Mandals are dropped', () => {
  assert.deepEqual(normalizeAssignments([{ product: P1, mandals: [] }], ctx()), []);
});

test('a Mandal submitted under the wrong product is rejected', () => {
  assert.throws(() => normalizeAssignments([{ product: P2, mandals: [M1] }], ctx()), /does not belong/);
});

test('a parent location cannot be stored as an assignment', () => {
  assert.throws(() => normalizeAssignments([{ product: P1, mandals: [DISTRICT] }], ctx()), /Only Mandals/);
});

test('category nodes, unknown IDs and inactive products are rejected', () => {
  assert.throws(() => normalizeAssignments([{ product: P1, mandals: [CATEGORY] }], ctx()), /does not exist/);
  assert.throws(() => normalizeAssignments([{ product: P1, mandals: ['0000000000000000000000ff'] }], ctx()), /does not exist/);
  assert.throws(() => normalizeAssignments([{ product: '0000000000000000000000ff', mandals: [] }], ctx()), /does not exist/);
  assert.throws(() => normalizeAssignments([{ product: P_INACTIVE, mandals: [] }], ctx()), /inactive/);
});

test('malformed payloads are rejected', () => {
  assert.throws(() => normalizeAssignments({ product: P1 }, ctx()), /must be an array/);
  assert.throws(() => normalizeAssignments([{ product: 'abc', mandals: [] }], ctx()), /Invalid product/);
  assert.throws(() => normalizeAssignments([{ product: P1, mandals: [{ $ne: null }] }], ctx()), /Invalid Mandal/);
  assert.throws(() => normalizeAssignments([{ product: P1 }], ctx()), /mandals array/);
});

test('only sales, inside-sales and product-executive take assignments', () => {
  assert.equal(isAssignableRole('sales'), true);
  assert.equal(isAssignableRole('inside-sales'), true);
  assert.equal(isAssignableRole('product-executive'), true);
  assert.equal(isAssignableRole('employee'), false);
  assert.equal(isAssignableRole('admin'), false);
});
