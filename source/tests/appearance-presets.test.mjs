import test from 'node:test';
import assert from 'node:assert/strict';
import { appearancePresetKey, appearancePresetsStorageKey, normalizeAppearancePresets } from '../lib/appearance-presets.ts';
import { backgroundColorsStorageKey, backgroundStorageKey } from '../lib/background-appearance.ts';

const preset = { id: 'one', name: ' 晚间 ', themeColor: '#657F91', background: { mode: 'custom', color: '#18232B' } };

test('appearance presets persist both colors, preserve names, and ignore malformed data without overwriting valid presets', () => {
  const values = [preset, { ...preset, id: 'two', themeColor: '#657f91' }, { ...preset, id: 'bad', background: { mode: 'custom', color: 'red' } }, { ...preset, id: 'bad-name', name: '' }, { ...preset, id: 'bad-mode', background: { mode: 'system', color: '#ffffff' } }, null];
  assert.deepEqual(normalizeAppearancePresets(JSON.parse(JSON.stringify(values))), [{ id: 'one', name: '晚间', themeColor: '#657f91', background: { mode: 'custom', color: '#18232b' } }]);
  assert.deepEqual(normalizeAppearancePresets(null), []);
  assert.notEqual(appearancePresetsStorageKey, backgroundStorageKey);
  assert.notEqual(appearancePresetsStorageKey, backgroundColorsStorageKey);
  assert.notEqual(appearancePresetsStorageKey, 'xuliu-saved-interface-colors-v1');
});

test('preset equality compares visible background modes and custom colors without coupling to design style', () => {
  const key = (mode, color) => appearancePresetKey('#657f91', { mode, color });
  assert.equal(key('dark', '#ffffff'), key('dark', '#000000'));
  assert.notEqual(key('dark', '#ffffff'), key('light', '#ffffff'));
  assert.notEqual(key('custom', '#ffffff'), key('custom', '#000000'));
  assert.equal(key('custom', '#AABBCC'), key('custom', '#aabbcc'));
});
