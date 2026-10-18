const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const indexPath = path.join(root, '_ai_workbench', 'temp', 'vusa_hit_route_v6_candidate_20260901', 'index.html');
const source = fs.readFileSync(indexPath, 'utf8');
const match = source.match(/<!-- LHS_MAIN_HIT_ROUTE_V6_START -->\n<script>(.*?)<\/script>\n<!-- LHS_MAIN_HIT_ROUTE_V6_END -->/s);
if (!match) throw new Error('guard block missing');
const guard = match[1];
const hash = crypto.createHash('sha256').update(Buffer.from(guard, 'utf8')).digest('hex');
if (hash !== '1e171081a591069243f9260440b7e8163d2bf56a8c82ac169d77ac1645c87678') {
  throw new Error(`guard hash mismatch: ${hash}`);
}

function node(cls, opts = {}) {
  return {
    cls,
    parent: opts.parent || null,
    visible: opts.visible !== false,
    alpha: opts.alpha === undefined ? 1 : opts.alpha,
    children: opts.children || [],
    hit: opts.hit || null,
    get numChildren() { return this.children.length; },
    getChildAt(index) { return this.children[index]; },
    getChildIndex(child) { return this.children.indexOf(child); },
    $hitTest() { return this.hit; },
  };
}

const rootNode = node('Main');
const lowLayer = node('BaseEuiLayer', { parent: null });
const uiLayer = node('eui.UILayer');
const highLayer = node('BaseEuiLayer', { parent: uiLayer });
const control = node('eui.Button', { parent: highLayer });
highLayer.children = [control];
highLayer.hit = control;
uiLayer.children = [lowLayer, highLayer];
rootNode.children = [node('eui.Rect', { parent: rootNode }), uiLayer];
for (const child of rootNode.children) child.parent = rootNode;
lowLayer.parent = uiLayer;
uiLayer.parent = rootNode;
highLayer.parent = uiLayer;
control.parent = highLayer;
// Mirror Egret DisplayObjectContainer.$hitTest's critical behavior: a direct
// child used as another object's mask is skipped by the parent traversal.
const maskOwner = node('eui.Rect');
uiLayer.$maskedObject = maskOwner;
rootNode.$hitTest = function () {
  for (let index = this.children.length - 1; index >= 0; index -= 1) {
    const child = this.children[index];
    if (child.$maskedObject) continue;
    const hit = child.$hitTest(10, 20);
    if (hit) return hit;
  }
  return rootNode;
};

const context = {
  console,
  setInterval: () => 1,
  clearInterval: () => {},
  Main: { Instance: rootNode },
  window: {},
  egret: { getQualifiedClassName: (value) => value && value.cls },
};
context.window = context;
vm.runInNewContext(guard, context, { filename: 'vusa-hit-route-v6.js' });
if (typeof context.__installLhsMainHitRouteV6 !== 'function') throw new Error('install export missing');
if (!context.__installLhsMainHitRouteV6()) throw new Error('install failed');
if (rootNode.__lhsMainHitRouteOriginal.call(rootNode, 10, 20) !== rootNode) {
  throw new Error('masked-layer original traversal did not reproduce Main fallback');
}
if (rootNode.$hitTest(10, 20) !== control) throw new Error('wrapper did not recover high-layer control');
if (rootNode.__lhsMainHitRouteV6 !== true || rootNode.__lhsMainHitRouteOwner !== 'v6') {
  throw new Error('guard ownership markers missing');
}

const directHit = node('eui.Image', { parent: highLayer });
highLayer.hit = directHit;
if (rootNode.$hitTest(1, 2) !== directHit) throw new Error('direct high-layer hit failed');

console.log(JSON.stringify({
  result: 'PASS',
  guardBytes: Buffer.byteLength(guard, 'utf8'),
  guardSha256: hash,
  recoveredClass: 'eui.Button',
  reproducedOriginalClass: 'Main',
  maskedLayerSkipped: true,
  directClass: 'eui.Image',
  mainBundleChanged: false,
  serverChanged: false,
}));
