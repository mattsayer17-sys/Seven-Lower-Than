'use strict';
// One-off codemod: splits the single-closure UI script of the original artifact into ES modules.
// It rewrites shared mutable variables into properties of one state object (store) using scope analysis,
// then works out the imports and exports each module needs. Run once; the output is then maintained by hand.
//
//   node tools/split.js src/original.html src/ui
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const [, , inFile, outDir] = process.argv;
const html = fs.readFileSync(inFile, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = scripts[1];
const ast = parser.parse(src, { sourceType: 'script', tokens: true });
const STORE = 'store';
if (ast.tokens.some(tk => tk.type.label === 'name' && tk.value === STORE)) throw new Error(STORE + ' already used as an identifier');

// Mutable values that more than one module touches live on `st`.
const SHARED = new Set(['game', 'els', 'cw', 'ch', 'lastL', 'gen', 'ui', 'settings', 'stats', 'P', 'tour', 'demo']);

// name -> module for every top-level declaration
const MODS = {
  dom: ['$', 'table', 'cardsEl', 'esc'],
  state: ['FAST', 'SYM', 'FELTS', 'BACKS', 'SKILL', 'backURI', 'applyBack', 'applySkill', 'save', 'spd', 'later', 'who', 'ordinal', 'label', 'applyCB', 'applyFelt'],
  audio: ['AC', 'tone', 'buzz', 'noise', 'SFX'],
  cards: ['PIPS', 'sv', 'faceHTML', 'buildCard', 'allCards', 'findCard'],
  render: ['computeLayout', 'humanLegal', 'render', 'statusText', 'setMsg', 'hint'],
  flow: ['newGame', 'describe', 'outNote', 'flashLabel', 'isSting', 'afterAction', 'advance', 'cpuStep'],
  input: ['humanTap', 'humanPlay', 'shake', 'tableXY', 'onDown', 'endDrag'],
  profile: ['AVATARS', 'mkProfile', 'prof', 'keyName', 'ACH', 'toastQ', 'toastBusy', 'toast', 'nextToast', 'unlock', 'trackEvent', 'recordGame', 'showProfile', 'updateStats'],
  daily: ['dayKey', 'isoDay', 'hashSeed', 'dailyStreak', 'dailyLine', 'shareText', 'copyText', 'dailyBlock', 'wireShare', 'topPanel'],
  fx: ['fxEl', 'relPos', 'seatEl', 'addFx', 'burnFx', 'skipFx', 'pickFx', 'bigPick', 'lockFx', 'fxForEvent'],
  tour: ['rigTour', 'ABORT', 'chk', 'sleep', 'until', 'capShow', 'capWait', 'fingerAt', 'fingerTap', 'pointTap', 'tapCard', 'cpuMove', 'restoreSettings', 'startDemo', 'offerTour'],
  chat: ['chatMsgs', 'chatOpen', 'chatUnread', 'peekT', 'chatOn', 'chatDraw', 'chatSync', 'chatReset', 'chatIncoming', 'chatSend', 'chatOpenIt', 'chatMin'],
  sheets: ['showModal', 'hideModal', 'showOver', 'showLegend'],
  setup: ['aiBusy', 'showSetup'],
  header: ['sndIcon'],
};
const modOfName = {};
for (const [m, names] of Object.entries(MODS)) for (const n of names) modOfName[n] = m;

// executable top-level statements, by the line they start on
const LINE_MOD = {};
const put = (m, lines) => lines.forEach(l => (LINE_MOD[l] = m));
put('state', [13, 14, 20, 22]);
put('input', [412, 441, 442, 444, 445, 446, 457]);
put('profile', [467]);
put('chat', [770, 771, 772, 773]);
put('header', [289, 774, 775, 776, 777, 778, 940, 941, 942, 943, 944]);
put('main', [945, 946]);
// wrapped into exported init functions so nothing runs at import time
const INIT = { input: 'initInput', profile: 'loadProfiles', chat: 'initChat', header: 'initHeader' };

let fnPath;
traverse(ast, { FunctionExpression(p) { if (!fnPath) { fnPath = p; p.stop(); } } });
const fnScope = fnPath.scope;
const stmts = fnPath.get('body.body');

// 1. classify
const stateInit = []; // [name, initNode]
const items = [];     // { path, mod, kind: 'decl'|'exec' }
for (const sp of stmts) {
  const n = sp.node;
  if (t.isVariableDeclaration(n)) {
    const names = n.declarations.map(d => d.id.name);
    if (names.every(x => SHARED.has(x))) { n.declarations.forEach(d => stateInit.push([d.id.name, d.init])); continue; }
    const mod = modOfName[names[0]];
    if (!mod) throw new Error('unmapped declaration ' + names + ' line ' + n.loc.start.line);
    if (names.some(x => SHARED.has(x))) throw new Error('mixed declaration ' + names);
    items.push({ path: sp, mod, kind: 'decl' });
  } else if (t.isFunctionDeclaration(n)) {
    const mod = modOfName[n.id.name];
    if (!mod) throw new Error('unmapped function ' + n.id.name);
    items.push({ path: sp, mod, kind: 'decl' });
  } else {
    const mod = LINE_MOD[n.loc.start.line];
    if (!mod) throw new Error('unmapped statement at line ' + n.loc.start.line + ': ' + src.split('\n')[n.loc.start.line - 1].slice(0, 80));
    items.push({ path: sp, mod, kind: 'exec' });
  }
}
const declared = {}; // every top-level name -> module
for (const it of items) if (it.kind === 'decl') {
  const n = it.path.node;
  (t.isFunctionDeclaration(n) ? [n.id.name] : n.declarations.map(d => d.id.name)).forEach(x => (declared[x] = it.mod));
}
for (const n of Object.keys(modOfName)) if (!declared[n] && !SHARED.has(n)) throw new Error('declared nowhere: ' + n);

// 2. rewrite shared names and collect the imports each statement needs
const needs = new Map(); // module -> Map(sourceModule -> Set(names))
const needsSt = new Set(), needsShed = new Set(), exported = new Set();
const addNeed = (mod, from, name) => {
  if (!needs.has(mod)) needs.set(mod, new Map());
  const m = needs.get(mod);
  if (!m.has(from)) m.set(from, new Set());
  m.get(from).add(name);
};
for (const it of items) {
  it.path.traverse({
    Identifier(p) {
      const name = p.node.name, parent = p.parent;
      if (t.isMemberExpression(parent) && parent.property === p.node && !parent.computed) return;
      if (t.isObjectProperty(parent) && parent.key === p.node && !parent.computed) return;
      if (t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent)) return;
      const b = p.scope.getBinding(name);
      if (!b) { if (name === 'Shed') needsShed.add(it.mod); return; }
      if (b.identifier === p.node) return;       // the declaration itself
      if (b.scope !== fnScope) return;           // a local that shadows a top-level name
      if (SHARED.has(name)) {
        if (t.isObjectProperty(parent) && parent.shorthand) parent.shorthand = false;
        p.replaceWith(t.memberExpression(t.identifier(STORE), t.identifier(name)));
        p.skip();
        needsSt.add(it.mod);
        return;
      }
      const from = declared[name];
      if (!from) throw new Error('no module for ' + name);
      if (from !== it.mod) { addNeed(it.mod, from, name); exported.add(name); }
    },
  });
}

// 3. emit
const code = n => generate(n, { comments: true, jsescOption: { minimal: true } }).code;
const mods = {}; // name -> { decls: [], inits: [], main: [] }
const ensure = m => (mods[m] = mods[m] || { decls: [], execs: [] });
for (const it of items) ensure(it.mod)[it.kind === 'decl' ? 'decls' : 'execs'].push(code(it.path.node));
ensure('state'); ensure('main');
const mainCalls = [];
for (const [m, fn] of Object.entries(INIT)) if (mods[m] && mods[m].execs.length) { addNeed('main', m, fn); mainCalls.push(fn + '();'); }
needsShed.add('main');
mods.main.execs.unshift(...mainCalls, 'window.Shed = Shed; // handy in the console, and used by the test driver');

// the state object
const stProps = stateInit.map(([k, v]) => t.objectProperty(t.identifier(k), v));
const stCode = '// Everything the modules share and reassign lives here. Import it, read and write store.x.\nexport const ' + code(t.variableDeclarator(t.identifier(STORE), t.objectExpression(stProps))) + ';';
needsSt.delete('state');
exported.add(STORE);

fs.mkdirSync(outDir, { recursive: true });
const order = ['dom', 'state', 'audio', 'cards', 'render', 'flow', 'input', 'profile', 'daily', 'fx', 'tour', 'chat', 'sheets', 'setup', 'header', 'main'];
const used = new Set();
for (const m of order) {
  if (!mods[m]) continue;
  used.add(m);
  const imp = [];
  if (needsShed.has(m)) imp.push("import Shed from '../engine.js';");
  const from = needs.get(m) || new Map();
  if (needsSt.has(m)) { if (!from.has('state')) from.set('state', new Set()); from.get('state').add(STORE); }
  const srcs = [...from.keys()].filter(x => x !== m).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const s of srcs) imp.push('import { ' + [...from.get(s)].sort().join(', ') + " } from './" + s + ".js';");
  let body = '';
  const decls = mods[m].decls;
  // handle exports by name after the fact
  const exportNames = [...exported].filter(n => declared[n] === m);
  if (m === 'state') body += stCode + '\n\n';
  body += decls.join('\n\n');
  if (mods[m].execs.length) {
    const fn = INIT[m];
    if (fn) { body += '\n\nexport function ' + fn + '() {\n' + mods[m].execs.join('\n') + '\n}\n'; }
    else body += '\n\n' + mods[m].execs.join('\n');
  }
  if (exportNames.length) body += '\n\nexport { ' + exportNames.sort().join(', ') + ' };\n';
  fs.writeFileSync(path.join(outDir, m + '.js'), (imp.length ? imp.join('\n') + '\n\n' : '') + body.trimEnd() + '\n');
}
console.log('modules:', [...used].join(', '));
console.log('state props:', stateInit.map(x => x[0]).join(', '));
console.log('exports:', exported.size);
