/**
 * Preset palettes for pixel art.
 * Each palette includes name, author/source, and color array.
 */

export interface PresetPalette {
  id: string;
  name: string;
  author: string;
  colors: string[];
}

// DB32 by DawnBringer - Classic 32-color palette
const DB32: PresetPalette = {
  id: 'db32',
  name: 'DB32',
  author: 'DawnBringer',
  colors: [
    '#000000', '#222034', '#45283c', '#663931', '#8f563b', '#df7126', '#d9a066', '#eec39a',
    '#fbf236', '#99e550', '#6abe30', '#37946e', '#4b692f', '#524b24', '#323c39', '#3f3f74',
    '#306082', '#5b6ee1', '#639bff', '#5fcde4', '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
    '#696a6a', '#595652', '#76428a', '#ac3232', '#d95763', '#d77bba', '#8f974a', '#8a6f30'
  ]
};

// PICO-8 - Fantasy console palette
const PICO8: PresetPalette = {
  id: 'pico8',
  name: 'PICO-8',
  author: 'Lexaloffle',
  colors: [
    '#000000', '#1d2b53', '#7e2553', '#008751',
    '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436',
    '#29adff', '#83769c', '#ff77a8', '#ffccaa'
  ]
};

// GameBoy - Original DMG green shades
const GAMEBOY: PresetPalette = {
  id: 'gameboy',
  name: 'GameBoy',
  author: 'Nintendo',
  colors: [
    '#0f380f', '#306230', '#8bac0f', '#9bbc0f'
  ]
};

// NES - Nintendo Entertainment System palette
const NES: PresetPalette = {
  id: 'nes',
  name: 'NES',
  author: 'Nintendo',
  colors: [
    '#7c7c7c', '#0000fc', '#0000bc', '#4428bc', '#940084', '#a80020', '#a81000', '#881400',
    '#503000', '#007800', '#006800', '#005800', '#004058', '#000000', '#000000', '#000000',
    '#bcbcbc', '#0078f8', '#0058f8', '#6844fc', '#d800cc', '#e40058', '#f83800', '#e45c10',
    '#ac7c00', '#00b800', '#00a800', '#00a844', '#008888', '#000000', '#000000', '#000000',
    '#f8f8f8', '#3cbcfc', '#6888fc', '#9878f8', '#f878f8', '#f85898', '#f87858', '#fca044',
    '#f8b800', '#b8f818', '#58d854', '#58f898', '#00e8d8', '#787878', '#000000', '#000000',
    '#fcfcfc', '#a4e4fc', '#b8b8f8', '#d8b8f8', '#f8b8f8', '#f8a4c0', '#f0d0b0', '#fce0a8',
    '#f8d878', '#d8f878', '#b8f8b8', '#b8f8d8', '#00fcfc', '#f8d8f8', '#000000', '#000000'
  ]
};

// Endesga 32 by Endesga - Modern pixel art palette
const ENDESGA32: PresetPalette = {
  id: 'endesga32',
  name: 'Endesga 32',
  author: 'Endesga',
  colors: [
    '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
    '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
    '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
    '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569'
  ]
};

// Sweetie 16 by GrafxKid - Compact and versatile
const SWEETIE16: PresetPalette = {
  id: 'sweetie16',
  name: 'Sweetie 16',
  author: 'GrafxKid',
  colors: [
    '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
    '#ffcd75', '#a7f070', '#38b764', '#257179',
    '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
    '#f4f4f4', '#94b0c2', '#566c86', '#333c57'
  ]
};

// All preset palettes
export const PRESET_PALETTES: PresetPalette[] = [
  DB32,
  PICO8,
  GAMEBOY,
  NES,
  ENDESGA32,
  SWEETIE16
];

// Quick lookup by ID
export const PALETTE_BY_ID = new Map<string, PresetPalette>(
  PRESET_PALETTES.map(p => [p.id, p])
);
