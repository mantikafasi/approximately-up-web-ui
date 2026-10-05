// Authored positions and mean radii, in game-universe metres (X, Y, Z).
// Transcribed from the installed game's level0 Planet/Star authoring components;
// black-hole position from CRPBlackHoleFeature in globalgamemanagers.assets.
// world is the serialized UniverseSpheroid._wormholeWorldIndex: 0 regular, 1 through the black hole.
// No game textures, meshes, code, or raw assets are redistributed.
export const bodies = [
  { name: 'Sun', world: 0, kind: 'Star', position: [0, 0, 0], radius: 2800000, color: '#ffd381' },
  { name: 'Earth', world: 0, kind: 'Planet', position: [-386424958.9, 19352932.2, -56486945.3], radius: 550000, color: '#67a9ce' },
  { name: 'Moon', world: 0, kind: 'Moon', position: [-386172074.2, 21028831, -53973978.3], radius: 97000, color: '#c5c6be' },
  { name: 'Aundara', world: 0, kind: 'Planet', position: [-448458851.1, -29733355.5, -2702177.5], radius: 476000, color: '#b97f70' },
  { name: 'Baobara', world: 0, kind: 'Planet', position: [-166841423.2, 41033780.2, -159784562.5], radius: 1120000, color: '#74ae97' },
  { name: 'Helirion', world: 0, kind: 'Planet', position: [118745253.7, -68805255.7, -40779314.7], radius: 36220, color: '#e5af83' },
  { name: 'Corona Silva', world: 0, kind: 'Planet', position: [149931135.9, 91930190.9, 239939973.7], radius: 329000, color: '#7fb18b' },
  { name: 'Basalt', world: 0, kind: 'Planet', position: [-15652067.3, 7051474.8, 223834991.3], radius: 715000, color: '#a47d73' },
  { name: 'Kovo', world: 0, kind: 'Planet', position: [-13936346.8, 5864051.3, 223106715.1], radius: 57000, color: '#d1b29a' },
  { name: 'Ascensia', world: 1, kind: 'Planet', position: [231252465.6, 50381024.9, -120543012.5], radius: 433300, color: '#95aec6' },
  { name: 'Rimshell', world: 0, kind: 'Planet', position: [319276889.7, 64540422.9, -48856228.4], radius: 223000, color: '#bec2ab' },
  { name: 'Ashbelt', world: 1, kind: 'Planet', position: [349152800.1, 33615295.3, -55347863.8], radius: 191000, color: '#d58d6f' },
  { name: 'Red Dwarf', world: 0, kind: 'Star', position: [383638537, 109319946.2, -100975315.8], radius: 417000, color: '#ff875e' },
  { name: 'Outcast', world: 0, kind: 'Planet', position: [442638288.8, 104931365.6, -211937718.5], radius: 573000, color: '#96a9b2' },
  { name: 'Goldtwin', world: 1, kind: 'Planet', position: [474768114.9, 50793673.5, -159913023.2], radius: 304000, color: '#d8b882' },
  { name: 'Pinktwin', world: 1, kind: 'Planet', position: [475186771.5, 50884409, -159377164.2], radius: 256000, color: '#d7a3b7' },
  { name: 'Tenebra', world: 1, kind: 'Planet', position: [-262460917.5, -13965398.5, -394370909.4], radius: 103000, color: '#998fae' },
  { name: 'Black Hole', world: 0, kind: 'Anomaly', position: [330560964.2, 35963338.1, -54971750.5], radius: null, color: '#e7a976' }
];
