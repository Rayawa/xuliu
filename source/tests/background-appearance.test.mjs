import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackground, backgroundPalette, backgroundContrast, backgroundStorageKey } from '../lib/background-appearance.ts';

test('background preferences reject malformed colors without changing the existing theme keys', () => {
  assert.deepEqual(normalizeBackground({ mode: 'custom', color: '#AABBCC' }), { mode: 'custom', color: '#aabbcc' });
  for (const value of [null, [], 'dark', { mode: 'system', color: 'red' }, { mode: 'light', color: '#000;display:none' }]) {
    assert.deepEqual(normalizeBackground(value), { mode: 'light', color: '#e9eeeb' });
  }
  assert.notEqual(backgroundStorageKey, 'xuliu-interface-color');
  assert.equal(backgroundPalette({ mode: 'light', color: '#000000' }), null);
});

test('dark and custom backgrounds keep their exact color when accent changes', () => {
  for (const mode of ['dark', 'custom']) {
    const blue = backgroundPalette({ mode, color: '#28373d' }, '#0000ff');
    const red = backgroundPalette({ mode, color: '#28373d' }, '#ff0000');
    for (const key of ['background', 'paper', 'soft', 'text', 'muted', 'sidebar']) assert.equal(blue[key], red[key]);
    assert.equal(blue.background, mode === 'dark' ? '#171c20' : '#28373d');
  }
});

test('text, secondary labels and accent links remain readable on light, dark and vivid custom surfaces', () => {
  for (const color of ['#000000', '#ffffff', '#757575', '#777777', '#0000ff', '#ff0000', '#ff00ff', '#00ffff', '#e9eeeb']) {
    const palette = backgroundPalette({ mode: 'custom', color }, '#80674d');
    for (const foreground of [palette.text, palette.muted, palette.faint, palette.link, palette.danger, palette.income, palette.expense]) {
      for (const surface of [palette.background, palette.paper, palette.soft]) {
        assert.ok(backgroundContrast(foreground, surface) >= 4.5, `${color}: ${foreground} / ${surface}`);
      }
    }
  }
});
