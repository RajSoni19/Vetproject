const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const cache = new Map();
// Execute the actual TypeScript domain functions without a build or extra package.
// Installed export libraries are loaded for workbook/PDF artifact assertions;
// no browser downloads or external service calls are performed by this loader.
function loadSource(name) {
  if (cache.has(name)) return cache.get(name);
  let source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, '..', name + '.ts'), 'utf8'));
  source = source.replace(/import\s+["']server-only["'];/g, ''); // Server-side test process only.
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:const|function|class)\s+(\w+)/g)].map(match => match[1]);
  source = source.replace(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)";/g, (_, bindings, id) => 'const {' + bindings.replace(/\s+as\s+/g, ': ') + '}=require(' + JSON.stringify(id) + ');');
  source = source.replace(/import\s+\*\s+as\s+(\w+)\s+from\s*"([^"]+)";/g, (_, binding, id) => 'const ' + binding + '=require(' + JSON.stringify(id) + ');');
  source = source.replace(/import\s+(\w+)\s+from\s*"([^"]+)";/g, (_, binding, id) => 'const ' + binding + '=require(' + JSON.stringify(id) + ');');
  source = source.replace(/export\s+(?=(?:async\s+)?(?:const|function|class))/g, '');
  const module = { exports: {} };
  new Function('require', 'module', source + '\nmodule.exports={' + names.join(',') + '};')(id => id.startsWith('@/') ? loadSource(id.slice(2)) : id === 'jspdf' ? require('jspdf').jsPDF : require(id), module);
  cache.set(name, module.exports);
  return module.exports;
}
module.exports = { loadSource };

