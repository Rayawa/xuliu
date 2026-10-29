import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundColorNamesKey, normalizeSavedColorNames, normalizeSavedColors, savedColorMatches, themeColorNamesKey, withSavedColorName } from '../lib/saved-colors.ts';
import { appearancePresetMatches, normalizeAppearancePresets, renameAppearancePreset } from '../lib/appearance-presets.ts';

test('old saved color arrays retain every valid color without a new limit or format migration', () => {
  const old = ['#ABCDEF', ' #112233 ', '#abcdef', null, 'red', ...Array.from({ length: 500 }, (_, index) => '#' + index.toString(16).padStart(6, '0'))];
  const colors = normalizeSavedColors(old);
  assert.equal(colors.length, 502);
  assert.deepEqual(colors.slice(0, 2), ['#abcdef', '#112233']);
  assert.deepEqual(normalizeSavedColors(JSON.parse(JSON.stringify(colors))), colors);
  assert.deepEqual(normalizeSavedColors(null), []);
  assert.notEqual(themeColorNamesKey, 'xuliu-saved-interface-colors-v1');
  assert.notEqual(backgroundColorNamesKey, 'xuliu-saved-background-colors-v1');
  assert.notEqual(themeColorNamesKey, backgroundColorNamesKey);
});

test('color names are optional metadata and renaming preserves all other colors and names', () => {
  const oldColors = ['#112233', '#abcdef'];
  const names = normalizeSavedColorNames({ '#112233': ' 雾蓝 ', '#ABCDEF': '暖白', bad: '无效色', '#123456': 1, '#654321': ' ', '#000000': 'a'.repeat(81) });
  assert.deepEqual(names, { '#112233': '雾蓝', '#abcdef': '暖白' });
  const renamed = withSavedColorName(names, '#112233', ' 深蓝 ');
  assert.deepEqual(renamed, { '#112233': '深蓝', '#abcdef': '暖白' });
  assert.deepEqual(withSavedColorName(renamed, '#112233', ''), { '#abcdef': '暖白' });
  assert.deepEqual(oldColors, ['#112233', '#abcdef']);
  assert.deepEqual(names, { '#112233': '雾蓝', '#abcdef': '暖白' });
  assert.equal(withSavedColorName(names, 'bad', '名字'), names);
  assert.deepEqual(normalizeSavedColorNames([]), {});
});

test('search covers names and case-insensitive full or partial hex values, including old unnamed colors', () => {
  assert.equal(savedColorMatches('#abcdef', ' 晨雾蓝 ', '晨雾'), true);
  assert.equal(savedColorMatches('#abcdef', undefined, ' ABC '), true);
  assert.equal(savedColorMatches('#abcdef', undefined, '#ABCDEF'), true);
  assert.equal(savedColorMatches('#abcdef', '晨雾蓝', '夜色'), false);
  assert.equal(savedColorMatches('#abcdef', undefined, ' '), true);
});

test('renaming a combination preserves its ID, both colors, order, selection key and other combinations', () => {
  const presets = normalizeAppearancePresets([
    { id: 'one', name: '晚间', themeColor: '#657f91', background: { mode: 'custom', color: '#18232b' } },
    { id: 'two', name: '白天', themeColor: '#80674d', background: { mode: 'light', color: '#ffffff' } },
  ]);
  const renamed = renameAppearancePreset(presets, 'one', ' 深夜蓝 ');
  assert.deepEqual(renamed, [{ ...presets[0], name: '深夜蓝' }, presets[1]]);
  assert.equal(renamed[0].background, presets[0].background);
  assert.equal(renamed[1], presets[1]);
  assert.equal(presets[0].name, '晚间');
  assert.deepEqual(normalizeAppearancePresets(JSON.parse(JSON.stringify(renamed))), renamed);
  assert.equal(renameAppearancePreset(presets, 'missing', '名称'), null);
  assert.equal(renameAppearancePreset(presets, 'one', ' '), null);
  assert.equal(renameAppearancePreset(presets, 'one', 'a'.repeat(81)), null);
  assert.equal(appearancePresetMatches(renamed[0], '深夜'), true);
  assert.equal(appearancePresetMatches(renamed[0], '657F'), true);
  assert.equal(appearancePresetMatches(renamed[0], '#18232B'), true);
  assert.equal(appearancePresetMatches(presets[1], '浅色'), true);
  assert.equal(appearancePresetMatches(presets[1], 'no match'), false);
});
