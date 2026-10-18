"""Read-only font decoder matching FntHelper.loadSingleFntPack; no game writes."""
import json
import zlib
from pathlib import Path
from decode_bin_manifest import Reader

ROOT = Path(__file__).resolve().parents[2]
CFG = ROOT / 'linhhoasu/webgame/game/update/resource/assets/cfg'


def read_pack(path):
    reader = Reader(zlib.decompress(path.read_bytes()))
    fonts = {}
    while reader.pos < len(reader.data):
        name = reader.utf8(reader.auto())
        frames = {}
        for _ in range(reader.auto()):
            char = reader.utf8(reader.auto())
            frame = {key: reader.auto() for key in ('x', 'y', 'w', 'h')}
            if reader.u8():
                frame['offX'] = reader.auto(True)
                frame['offY'] = reader.auto(True)
                frame['sourceW'] = reader.auto()
                frame['sourceH'] = reader.auto()
            else:
                frame.update(offX=0, offY=0, sourceW=frame['w'], sourceH=frame['h'])
            frames[char] = frame
        fonts[name + '_fnt'] = frames
    return fonts


if __name__ == '__main__':
    fonts = {}
    for relative in ('fnt_pack_128141c4.bin', 'lang_cn/fnt_lang_pack_3f07747f.bin'):
        fonts.update(read_pack(CFG / relative))
    font = fonts['font_num_prop_fnt']
    print(json.dumps({'glyphs': list(font), 'frames': font,
                     'missing': {s: sorted(set(s) - set(font))
                                 for s in ('10Vạn', '100Vạn', '1Tỷ', '1Triệu', '300K', '1M', '1.000.000')}},
                     ensure_ascii=False, indent=2))
