"""Add a read-only original-vs-wrapper proof probe to the hit-route candidate."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_candidate_20260901/index.html"
OUT = ROOT / "_ai_workbench/temp/vusa_hit_route_v6_proof_candidate_20260901"
EXPECTED_BASE = "b55d61265f9e32e5a31ea85e4352dd0f790abec53d0fcac028edcd705c6d9d61"
SCRIPT = r"""
(function () {
  'use strict';
  if (window.__lhsHitRouteProofV1) return;
  window.__lhsHitRouteProofV1 = true;
  var points = [
    { name: 'avatar', x: 58, y: 63 },
    { name: 'weapon', x: 200, y: 850 },
    { name: 'menu', x: 210, y: 1070 },
    { name: 'center', x: 450, y: 500 }
  ];
  function name(value) {
    try {
      return window.egret && egret.getQualifiedClassName
        ? egret.getQualifiedClassName(value)
        : value && value.constructor && value.constructor.name || '';
    } catch (_) { return ''; }
  }
  function describe(value) {
    return value ? {
      cls: name(value), name: String(value.name || ''),
      maskedBy: name(value.$maskedObject), mask: name(value.$mask),
      visible: value.visible, alpha: Number(value.alpha),
      touchEnabled: value.touchEnabled, touchChildren: value.touchChildren,
      children: Number(value.numChildren || 0)
    } : null;
  }
  function sample() {
    var root = window.Main && Main.Instance;
    if (!root || typeof root.$hitTest !== 'function') return;
    var original = root.__lhsMainHitRouteOriginal;
    var results = points.map(function (point) {
      var originalHit = null, wrappedHit = null;
      try { originalHit = typeof original === 'function' ? original.call(root, point.x, point.y) : null; } catch (_) {}
      try { wrappedHit = root.$hitTest(point.x, point.y); } catch (_) {}
      return { name: point.name, x: point.x, y: point.y,
        original: describe(originalHit), wrapped: describe(wrappedHit) };
    });
    var children = [];
    for (var i = 0; i < Number(root.numChildren || 0); i += 1) {
      var child = root.getChildAt(i);
      var row = describe(child);
      row.index = i;
      row.direct = points.map(function (point) {
        var hit = null;
        try { hit = child.$hitTest(point.x, point.y); } catch (_) {}
        return { point: point.name, hit: describe(hit) };
      });
      children.push(row);
    }
    var payload = {
      at: new Date().toISOString(),
      bootstrap: window.__lhsMainHitRouteV6Bootstrap,
      installed: root.__lhsMainHitRouteV6,
      owner: root.__lhsMainHitRouteOwner,
      wrapperActive: root.$hitTest === root.__lhsMainHitRouteWrapper,
      results: results,
      rootChildren: children
    };
    var node = document.getElementById('lhs-hit-route-proof');
    if (node) node.textContent = JSON.stringify(payload);
  }
  setInterval(sample, 500);
  sample();
}());
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    base = BASE.read_bytes()
    if sha(base) != EXPECTED_BASE:
        raise RuntimeError(f"base hash changed: {sha(base)}")
    if b"__lhsHitRouteProofV1" in base:
        raise RuntimeError("proof already present")
    block = ('\n<pre id="lhs-hit-route-proof" style="display:none"></pre>\n<script>' + SCRIPT + '</script>\n').encode('utf-8')
    if base.count(b"</body>") != 1:
        raise RuntimeError("body close precondition mismatch")
    candidate = base.replace(b"</body>", block + b"</body>", 1)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_bytes(candidate)
    manifest = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "baseSha256": sha(base),
        "proofScriptSha256": sha(SCRIPT.encode('utf-8')),
        "candidateSha256": sha(candidate),
        "candidateBytes": len(candidate),
        "contract": "read-only original-vs-wrapper probe; no hit-test mutation",
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
