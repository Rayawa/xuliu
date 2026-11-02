import test from 'node:test';
import assert from 'node:assert/strict';
import { appearancePresetKey, appearancePresetsStorageKey, normalizeAppearancePresets, saveAppearancePreset } from '../lib/appearance-presets.ts';
import { normalizeColorCode, normalizeSavedColor } from '../lib/saved-colors.ts';
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

test('manual color codes allow a missing hash without loosening the stored color format', () => {
  assert.equal(normalizeColorCode(' AABBCC '), '#aabbcc');
  assert.equal(normalizeColorCode(' #ABCDEF '), '#abcdef');
  for (const invalid of ['', 'red', '#12345', '#gg1122', '#12345678']) assert.equal(normalizeColorCode(invalid), '');
  assert.equal(normalizeSavedColor('AABBCC'), '');
});

test('saving a new pair keeps every existing preset and assigns the next default name', () => {
  const current = normalizeAppearancePresets([preset, { ...preset, id: 'two', name: '配色 1', themeColor: '#ffffff' }]);
  const result = saveAppearancePreset(current, { name: '', themeColor: '#AABBCC', background: { mode: 'custom', color: '#DDEEFF' } }, 'new');
  assert.equal(result.created, true);
  assert.deepEqual(result.presets.slice(0, 2), current);
  assert.deepEqual(result.preset, { id: 'new', name: '配色 2', themeColor: '#aabbcc', background: { mode: 'custom', color: '#ddeeff' } });
  assert.equal(current.length, 2);
});

test('resaving a pair keeps its identity and position, and renames only when a name is supplied', () => {
  const current = normalizeAppearancePresets([preset, { ...preset, id: 'two', name: '其他', themeColor: '#ffffff' }]);
  const result = saveAppearancePreset(current, { ...preset, name: '' }, 'unused');
  assert.equal(result.created, false);
  assert.equal(result.presets.length, 2);
  assert.equal(result.preset, current[0]);
  const renamed = saveAppearancePreset(current, { ...preset, name: ' 新名称 ' }, 'unused');
  assert.equal(renamed.preset.id, current[0].id);
  assert.equal(renamed.preset.name, '新名称');
  assert.equal(renamed.presets[1], current[1]);
  assert.equal(current[0].name, '晚间');
});

test('an invalid pair is rejected before saving either color, and unchanged modes are preserved', () => {
  const current = normalizeAppearancePresets([preset]);
  const before = JSON.stringify(current);
  assert.equal(saveAppearancePreset(current, { ...preset, themeColor: 'red' }, 'new'), null);
  assert.equal(saveAppearancePreset(current, { ...preset, background: { mode: 'custom', color: '#12345' } }, 'new'), null);
  assert.equal(saveAppearancePreset(current, { ...preset, name: 'a'.repeat(81) }, 'new'), null);
  assert.equal(JSON.stringify(current), before);
  const light = saveAppearancePreset(current, { ...preset, background: { mode: 'light', color: '#e9eeeb' } }, 'light');
  assert.deepEqual(light.preset.background, { mode: 'light', color: '#e9eeeb' });
});
