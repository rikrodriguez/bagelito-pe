/** Offline source/handler review only: no browser, GPU, network, or app writes. */
const assert = require('node:assert/strict')
const { readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')

const root = process.env.BAGELITO_REPO || process.cwd()
const requireFromRepo = createRequire(resolve(root, 'package.json'))
const ts = requireFromRepo('typescript')
const codeRef = '0381000a91fc8eebe235c8ebf9c034def9dc64b6'
const baselineRef = '74595b8b42a6576f931c18ce95578a9a41a7bdc3'
const path = 'src/playable/GuidedCommerce.tsx'
const hash = value => createHash('sha256').update(value).digest('hex')
const gitRaw = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const git = args => gitRaw(args).trim()
const current = gitRaw(['show', codeRef + ':' + path])
const previous = gitRaw(['show', baselineRef + ':' + path])
const report = {
  kind: 'offline-focus-helper-and-source-preservation-review',
  createdAt: new Date().toISOString(),
  codeSHA: git(['rev-parse', codeRef]),
  baselineSHA: git(['rev-parse', baselineRef]),
  repositoryHEAD: git(['rev-parse', 'HEAD']),
  sourcePath: path,
  sourceHashesUseExactCommittedFileBytes: true,
  sourceSHA256: hash(current),
  baselineSourceSHA256: hash(previous),
  scriptSHA256: hash(readFileSync(__filename)),
  helperChecks: [],
  preservation: {},
  limitations: [
    'No browser, native Tab, layout, scrolling, pointer sequence, GPU, or provider execution.',
    'Element, closest, matches and scrollIntoView are explicit controlled seams.',
    'Source identity does not certify runtime checkout or payment behavior.',
    'The original browser RED and browser focus PASS remain separate evidence.',
  ],
}

const parse = source => ts.createSourceFile('GuidedCommerce.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const now = parse(current), before = parse(previous)
const component = tree => tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'GuidedCommerce')
const beforeRender = (fn, tree) => fn.body.statements.filter(node => !ts.isReturnStatement(node)).map(node => node.getText(tree))
const declarations = fn => {
  const named = []
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node !== fn && node.name) named.push(node)
    ts.forEachChild(node, visit)
  }
  visit(fn)
  return named
}
const collect = (tree, predicate) => {
  const found = []
  const visit = node => {
    if (predicate(node)) found.push(node.getText(tree))
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}
const save = () => writeFileSync(resolve(__dirname, 'review-results.json'), JSON.stringify(report, null, 2) + '\n')

try {
  const currentPrefix = beforeRender(component(now), now)
  const previousPrefix = beforeRender(component(before), before)
  assert.deepEqual(currentPrefix, previousPrefix)
  const currentFunctions = declarations(component(now))
  const previousFunctions = declarations(component(before))
  assert.deepEqual(currentFunctions.map(node => node.getText(now)), previousFunctions.map(node => node.getText(before)))
  const eventHandler = node => ts.isJsxAttribute(node) && ['onClick', 'onChange'].includes(node.name.getText())
  const oldHandlers = collect(before, eventHandler), newHandlers = collect(now, eventHandler)
  assert.deepEqual(newHandlers, oldHandlers)
  const checkout = node => ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'CulqiBrowserCheckout'
  const oldCheckout = collect(before, checkout), newCheckout = collect(now, checkout)
  assert.equal(newCheckout.length, 1)
  assert.deepEqual(newCheckout, oldCheckout)
  report.preservation = {
    status: 'PASS',
    componentStatementsBeforeRenderCount: currentPrefix.length,
    componentStatementsBeforeRenderSHA256: hash(currentPrefix.join('\n')),
    baselineComponentStatementsBeforeRenderSHA256: hash(previousPrefix.join('\n')),
    namedFunctionsBelowComponent: currentFunctions.map(node => ({name: node.name.text, sha256: hash(node.getText(now))})),
    existingOnClickAndOnChangeCount: newHandlers.length,
    existingOnClickAndOnChangeSHA256: hash(newHandlers.join('\n')),
    baselineOnClickAndOnChangeSHA256: hash(oldHandlers.join('\n')),
    checkoutElementSHA256: hash(newCheckout[0]),
    baselineCheckoutElementSHA256: hash(oldCheckout[0]),
  }

  const helper = now.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'revealFocusedCatalogCard')
  assert.ok(helper)
  report.helperSHA256 = hash(helper.getText(now))
  report.helperSource = helper.getText(now)
  const compiled = ts.transpileModule(helper.getText(now), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
  }).outputText
  let calls = []
  const card = {scrollIntoView: options => calls.push(options)}
  class Element {
    constructor(visible = true) { this.visible = visible }
    matches(selector) { assert.equal(selector, ':focus-visible'); return this.visible }
    closest(selector) { assert.equal(selector, '.mobile-bagel-card,.mobile-schmear-card'); return card }
  }
  const reveal = new Function('Element', compiled + ';return revealFocusedCatalogCard;')(Element)
  const target = new Element()
  const grid = {scrollWidth: 1000, clientWidth: 300, contains: element => element === card}
  const check = (name, event, expected) => {
    calls = []
    reveal(event)
    assert.deepEqual(calls, expected)
    report.helperChecks.push({name, status: 'PASS', scrollCalls: calls})
    console.log('PASS: ' + name)
  }
  check('Visible keyboard focus in a horizontally overflowing grid reveals its whole card', {currentTarget: grid, target}, [{block:'nearest', inline:'start', behavior:'auto'}])
  check('A non-overflowing grid does not scroll', {currentTarget: {...grid, scrollWidth:300}, target}, [])
  check('A card outside the current grid does not scroll', {currentTarget: {...grid, contains:()=>false}, target}, [])
  check('A non-Element focus target does not scroll', {currentTarget: grid, target:{}}, [])
  check('Pointer focus without focus-visible does not scroll', {currentTarget: grid, target:new Element(false)}, [])

  const focusProps = collect(now, node => ts.isJsxAttribute(node) && node.name.getText() === 'onFocusCapture')
  assert.deepEqual(focusProps, [
    'onFocusCapture={liveWorld ? revealFocusedCatalogCard : undefined}',
    'onFocusCapture={liveWorld ? revealFocusedCatalogCard : undefined}',
  ])
  report.focusScopeProps = focusProps
  report.status = 'PASS'
  report.summary = {helperChecksPassed: report.helperChecks.length, helperChecksFailed:0}
  console.log('PASS: source preservation and two liveWorld-only focus bindings')
} catch (error) {
  report.status = 'FAIL'
  report.error = String(error.stack || error)
  process.exitCode = 1
  console.error(report.error)
} finally {
  report.completedAt = new Date().toISOString()
  save()
}
