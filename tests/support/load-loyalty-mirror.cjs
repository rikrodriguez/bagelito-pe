const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../../src/server/loyalty/loyalty-mirror.server.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText
const mod = new Module(filename, module)
mod.filename = filename
mod.paths = Module._nodeModulePaths(path.dirname(filename))
const normalRequire = mod.require.bind(mod)
mod.require = id => id === './loyalty.server' ? require('./load-loyalty.cjs') : normalRequire(id)
mod._compile(compiled, filename)
module.exports = mod.exports
