// node tools/gen-trees-doc.js > docs/CLASS_TREES.md  — renders the class trees from js/trees.js
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/data.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/../js/trees.js', 'utf8') + '\nthis.__T = { TREES, SKILL_DEFS, TIER_REQ, CLASSES, XP_VAL };', ctx);
const { TREES, SKILL_DEFS, TIER_REQ, CLASSES, XP_VAL } = ctx.__T;
const o = [];
o.push('# Neon Vault — class upgrade trees', '',
'Borderlands-style trees, one per class. Generated from `js/trees.js` by `node tools/gen-trees-doc.js`.', '',
'## Rules', '',
'- Every class starts a run with a **Common Pistol** and **no skill**. The SKILL button shows a lock ("LVL 2").',
'- Kills give XP (' + Object.entries(XP_VAL).map(([k, v]) => k + ' ' + v).join(', ') + '); clearing a room gives `6 + 2×room` XP (+20 on boss rooms).',
'- XP to the next level: `16 + 7 × (level − 1)`. Each level gives **1 skill point**.',
'- **The first point picks 1 of 3 skills.** Until a skill is chosen, the tree nodes are locked.',
'- Each class has **3 branches** with 3 tiers. Tier 2 needs ' + TIER_REQ[2] + ' points in that branch; tier 3 needs ' + TIER_REQ[3] + '.',
'- Node kinds: **stat nodes** (1–5 ranks, stackable) and **choice nodes** ("pick 1 of 3", permanent). Every class has an augment choice in its skill branch that changes how any of its 3 skills behaves.',
'- The random perk offers after each room are still there. Loop mode (New Game+) keeps level, points, skill and tree.',
'- Co-op: XP from every kill goes to every player; each player has their own level, points, skill and tree, synced from the host.',
'- UI: level-up toast and ▲ UPGRADE pill on the HUD, the locked skill button, `T` key, or pause → **TREE** tab. Tap a node to see its details / options; tap **SPEND POINT** or **TAKE**. Drag to scroll.', '');
for (const c of CLASSES) {
  const T = TREES[c.id]; const ns = T.branches.flatMap(b => b.nodes);
  o.push('## ' + c.name + ' — ' + c.tag, '', `${ns.length + 1} nodes (incl. skill pick), ${ns.filter(n => n.kind === 'choice').length} choose-1-of-3 nodes.`, '', '**Skills (pick 1 of 3):**', '');
  T.skills.forEach(s => o.push(`- **${SKILL_DEFS[s].name}** (${SKILL_DEFS[s].cd}s): ${SKILL_DEFS[s].desc}`));
  o.push('');
  for (const b of T.branches) {
    o.push(`### ${b.name}${b.skill ? ' (skill branch)' : ''}`, '', '| Tier | Node | Ranks | Effect |', '|---|---|---|---|');
    for (const n of b.nodes) {
      if (n.kind === 'stat') o.push(`| ${n.tier} | ${n.name} | ${n.max} | ${n.desc} |`);
      else o.push(`| ${n.tier} | ${n.name} | pick 1 | ${n.opts.map(x => `**${x.name}**: ${x.desc}`).join('<br>')} |`);
    }
    o.push('');
  }
}
process.stdout.write(o.join('\n') + '\n');
