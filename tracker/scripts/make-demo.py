"""Generate a deterministic 30 fps teaching/demo clip. Requires Pillow and ffmpeg.
Scale: 100 pixels/m. x=0.3+t m, y=2.2-0.9*t*t m relative to bottom-left.
The simulated vertical acceleration is -1.8 m/s² (not Earth's gravity).
"""
from pathlib import Path
from PIL import Image, ImageDraw
import subprocess

output = Path(__file__).resolve().parents[1] / 'docs/examples/projectile.mp4'
command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo',
           '-pix_fmt', 'rgb24', '-s', '320x240', '-r', '30', '-i', '-', '-an',
           '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
           '-pix_fmt', 'yuv420p', '-threads', '1', '-movflags', '+faststart', str(output)]
with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
    for frame in range(45):
        t = frame / 30
        im = Image.new('RGB', (320, 240), '#f3f5f0')
        d = ImageDraw.Draw(im)
        for x in range(0, 320, 20): d.line((x, 0, x, 240), fill='#dce3da')
        for y in range(0, 240, 20): d.line((0, y, 320, y), fill='#dce3da')
        d.line((205, 215, 305, 215), fill='#16352f', width=2)
        for x in [205, 305]: d.line((x, 211, x, 219), fill='#16352f', width=2)
        d.text((235, 222), '1.00 m', fill='#16352f')
        d.text((210, 8), 'SIMULATION / 30 FPS', fill='#16352f')
        x, y = 30 + 100 * t, 20 + 90 * t * t
        d.ellipse((x - 7, y - 7, x + 7, y + 7), fill='#cc5738', outline='#93381e', width=2)
        encoder.stdin.write(im.tobytes())
    encoder.stdin.close()
    if encoder.wait(): raise SystemExit('ffmpeg failed')
print(output)
