import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagLabelOutside } from '../src/components/graph-labels';

test('tag titles move outside small nodes without shrinking text', () => {
  const result = [0.15, 0.35, 1, 2, 4].map((zoom) => tagLabelOutside(65, zoom, 48));
  assert.deepEqual(result, [true, true, false, false, false]);
  assert.equal(tagLabelOutside(65, 1, 180), true, 'long names remain external at ordinary zoom');
  assert.equal(tagLabelOutside(65, 4, 180), false, 'long names return inside when there is room');
});

test('tag placement has stable thresholds in both zoom directions', () => {
  assert.equal(tagLabelOutside(60, 1, 48, true), true);
  assert.equal(tagLabelOutside(60, 1, 48, false), false);
  assert.equal(tagLabelOutside(60, 1.1, 48, true), false);
  assert.equal(tagLabelOutside(60, 0.9, 48, false), true);
});
