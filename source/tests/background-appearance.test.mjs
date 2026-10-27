import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackground, normalizeBackgroundColors, loadSavedBackgroundColors, backgroundPalette, backgroundContrast, backgroundStorageKey, backgroundColorsStorageKey } from '../lib/background-appearance.ts';

const colorStorage = (values = []) => {
  const data = new Map(values);
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('the requested screenshot background is saved once alongside existing colors without applying it', () => {
  const current = JSON.stringify({ mode: 'custom', color: '#123456' });
  const storage = colorStorage([[backgroundColorsStorageKey, JSON.stringify(['#AABBCC', '#1A2122'])], [backgroundStorageKey, current]]);
  assert.deepEqual(loadSavedBackgroundColors(storage), ['#aabbcc', '#1a2122']);
  assert.equal(storage.getItem(backgroundStorageKey), current);
  storage.setItem(backgroundColorsStorageKey, JSON.stringify(['#aabbcc']));
  assert.deepEqual(loadSavedBackgroundColors(storage), ['#aabbcc']);
  assert.equal(storage.getItem(backgroundStorageKey), current);
});

test('first use saves the requested background, while an unsuccessful save can be retried', () => {
  const storage = colorStorage();
  assert.deepEqual(loadSavedBackgroundColors(storage), ['#1a2122']);
  assert.equal(storage.getItem(backgroundStorageKey), null);
  const existing = JSON.stringify(['#123456']);
  const retryStorage = colorStorage([[backgroundColorsStorageKey, existing]]);
  assert.throws(() => loadSavedBackgroundColors({ getItem: retryStorage.getItem, setItem() { throw new Error('full'); } }));
  assert.equal(retryStorage.getItem(backgroundColorsStorageKey), existing);
  assert.deepEqual(loadSavedBackgroundColors(retryStorage), ['#123456', '#1a2122']);
});

test('saved backgrounds preserve valid colors and order, deduplicate case, and stay separate from current background and theme colors', () => {
  const colors = ['#AABBCC', '#123456', '#aabbcc', null, '#abc', 'red', '#000;display:none', ' #EFEFEF '];
  assert.deepEqual(normalizeBackgroundColors(JSON.parse(JSON.stringify(colors))), ['#aabbcc', '#123456', '#efefef']);
  for (const value of [null, {}, '[]', 5]) assert.deepEqual(normalizeBackgroundColors(value), []);
  assert.notEqual(backgroundColorsStorageKey, backgroundStorageKey);
  assert.notEqual(backgroundColorsStorageKey, 'xuliu-saved-interface-colors-v1');
});

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
