const fs = require('node:fs');
const path = require('node:path');
for (const file of ['module.js', 'plugin.json', 'img/pop-router.svg', 'img/pop-olt.svg', 'img/pop-datacenter.svg', 'img/sw.png']) {
  const filename = path.join(__dirname, '..', 'dist', file);
  if (!fs.existsSync(filename) || fs.statSync(filename).size === 0) {
    throw new Error(`Build incompleto: ${file} não foi gerado.`);
  }
}
console.log('Plugin compilado: módulo, manifesto e imagens verificados.');
