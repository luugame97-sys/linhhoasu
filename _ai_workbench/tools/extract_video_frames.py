import sys
from pathlib import Path

import av
from PIL import Image, ImageDraw


def main():
    video = Path(sys.argv[1])
    output = Path(sys.argv[2])
    times = [float(value) for value in sys.argv[3:]]
    output.mkdir(parents=True, exist_ok=True)
    container = av.open(str(video))
    stream = container.streams.video[0]
    duration = float(stream.duration * stream.time_base) if stream.duration is not None else 0.0
    print(f"duration={duration:.3f} fps={float(stream.average_rate):.3f} size={stream.width}x{stream.height}")
    for second in times:
        container.seek(int(second / float(stream.time_base)), stream=stream, any_frame=False, backward=True)
        selected = None
        for frame in container.decode(stream):
            current = float(frame.pts * stream.time_base) if frame.pts is not None else 0.0
            selected = frame
            if current >= second:
                break
        if selected is None:
            continue
        image = selected.to_image()
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 0, 220, 36), fill=(0, 0, 0))
        draw.text((10, 8), f"t={second:.1f}s", fill=(255, 255, 255))
        target = output / f"frame_{second:05.1f}.png"
        image.save(target)
        print(target)


if __name__ == "__main__":
    main()
