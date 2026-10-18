"""Keep the Spine waiter timeout bounded while preventing warning floods."""
from pathlib import Path

ROOT = Path(r"I:\Linhhoasu\server\server")
MAIN = ROOT / "linhhoasu" / "webgame" / "game" / "js" / "main.min_a6195824.js"
source = MAIN.read_text(encoding="utf-8")
old = (
    'a=setTimeout(function(){var e=Date.now();(!xRt._lhsLastWaitWarnAt||e-xRt._lhsLastWaitWarnAt>=5e3)'
    '&&(xRt._lhsLastWaitWarnAt=e,console.warn("[LHS] spine waitPlayEnd timeout fallback")),n()},8e3);'
)
new = (
    'a=setTimeout(function(){var e=Date.now();(!xRt._lhsLastWaitWarnAt||e-xRt._lhsLastWaitWarnAt>=5e3)'
    '&&(xRt._lhsLastWaitWarnAt=e,console.debug("[LHS] spine waitPlayEnd timeout fallback")),n()},15e3);'
)
if source.count(old) != 1:
    raise RuntimeError(f"current spine timeout anchor count={source.count(old)}")
MAIN.write_text(source.replace(old, new, 1), encoding="utf-8", newline="")
print("updated spine timeout to 15s and debug-level throttled logging")
