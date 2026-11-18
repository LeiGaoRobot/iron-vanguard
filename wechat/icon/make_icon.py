# -*- coding: utf-8 -*-
"""微信小游戏头像生成。4x 超采样绘制后 LANCZOS 缩到 144/512。
用法: D:\\AI\\comfyui-venv\\Scripts\\python.exe make_icon.py
输出: out/<name>_144.png / _512.png / contact.jpg(对比图)
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 1152                      # 绘制尺寸(8x of 144)
C = S / 2
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)

# 取自 site/index.html 的界面主色
BG0 = (18, 26, 34)
BG1 = (7, 10, 14)
CYAN = (95, 227, 255)
AMBER = (255, 194, 60)
RED = (255, 74, 58)
ARMOR = (226, 234, 239)
ARMOR_D = (150, 164, 175)
ARMOR_S = (96, 110, 122)
DARK = (24, 31, 39)

FONT_ZH = 'C:/Windows/Fonts/msyhbd.ttc'
FONT_EN = 'C:/Windows/Fonts/bahnschrift.ttf'


def k(v):
    """144 坐标 -> 绘制坐标"""
    return v * S / 144.0


def background(tint=CYAN, grid=True):
    """径向渐变底 + 细网格 + 四角暗角"""
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.sqrt((x - C) ** 2 + (y - C * 0.82) ** 2) / (S * 0.62)
    d = np.clip(d, 0, 1)
    img = np.zeros((S, S, 3), np.float32)
    for i in range(3):
        img[..., i] = BG0[i] * (1 - d) + BG1[i] * d
    # 顶部一点主色辉光
    g = np.exp(-(((x - C) / (S * 0.5)) ** 2 + ((y - C * 0.55) / (S * 0.42)) ** 2) * 2.2)
    for i in range(3):
        img[..., i] += tint[i] * g * 0.10
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    if grid:
        g = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        dr = ImageDraw.Draw(g)
        step = k(12)
        a = 16
        for i in range(0, int(S / step) + 1):
            dr.line([(i * step, 0), (i * step, S)], fill=(*tint, a), width=max(1, int(k(0.4))))
            dr.line([(0, i * step), (S, i * step)], fill=(*tint, a), width=max(1, int(k(0.4))))
        im = Image.alpha_composite(im.convert('RGBA'), g).convert('RGB')
    return im.convert('RGBA')


def glow(layer, radius, strength=1.0):
    """把一个 RGBA 图层做成辉光"""
    b = layer.filter(ImageFilter.GaussianBlur(radius))
    if strength != 1.0:
        a = b.split()[3].point(lambda v: min(255, int(v * strength)))
        b.putalpha(a)
    return b


def finish(im, name):
    im = im.convert('RGB')
    im.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, name + '_512.png'))
    im.resize((144, 144), Image.LANCZOS).save(os.path.join(OUT, name + '_144.png'))
    return im


# ---------------------------------------------------------------- A 面罩
def icon_visor():
    im = background()
    d = ImageDraw.Draw(im)

    # V 形天线
    d.polygon([(k(72), k(10)), (k(52), k(32)), (k(61), k(38)), (k(72), k(25)),
               (k(83), k(38)), (k(92), k(32))], fill=ARMOR)
    d.polygon([(k(72), k(10)), (k(72), k(25)), (k(83), k(38)), (k(92), k(32))], fill=ARMOR_D)

    # 耳部侧块
    for sx in (-1, 1):
        x0 = k(72) + sx * k(40)
        x1 = k(72) + sx * k(31)
        d.polygon([(x0, k(58)), (x1, k(53)), (x1, k(80)), (x0, k(74))],
                  fill=ARMOR_D if sx > 0 else ARMOR_S)
        d.rectangle([min(x0, x1) + k(1.5), k(62), max(x0, x1) - k(1.5), k(66)], fill=AMBER)

    # 头盔主体
    head = [(k(45), k(36)), (k(99), k(36)), (k(104), k(48)), (k(101), k(82)),
            (k(90), k(102)), (k(54), k(102)), (k(43), k(82)), (k(40), k(48))]
    d.polygon(head, fill=ARMOR)
    # 右半暗面
    d.polygon([(k(72), k(36)), (k(99), k(36)), (k(104), k(48)), (k(101), k(82)),
               (k(90), k(102)), (k(72), k(102))], fill=ARMOR_D)
    # 额甲
    d.polygon([(k(50), k(40)), (k(94), k(40)), (k(90), k(53)), (k(54), k(53))], fill=ARMOR_S)
    d.polygon([(k(68), k(40)), (k(76), k(40)), (k(75), k(53)), (k(69), k(53))], fill=RED)

    # 下颌
    d.polygon([(k(54), k(86)), (k(90), k(86)), (k(84), k(102)), (k(60), k(102))], fill=DARK)
    for i in range(4):
        d.rectangle([k(62) + i * k(5.5), k(91), k(64.5) + i * k(5.5), k(97)], fill=ARMOR_S)

    # 发光眼缝(一条贯穿横缝,中间细分隔)
    eye = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    de = ImageDraw.Draw(eye)
    de.polygon([(k(46), k(62)), (k(98), k(62)), (k(95), k(73)), (k(49), k(73))], fill=(*CYAN, 255))
    im = Image.alpha_composite(im, glow(eye, k(5), 0.9))
    im = Image.alpha_composite(im, glow(eye, k(1.6), 1.0))
    im = Image.alpha_composite(im, eye)
    d = ImageDraw.Draw(im)
    d.polygon([(k(70), k(62)), (k(74), k(62)), (k(73.5), k(73)), (k(70.5), k(73))], fill=ARMOR_S)
    return finish(im, 'A_visor')


# ---------------------------------------------------------------- B 翼徽
def icon_wing():
    im = background(tint=AMBER)
    d = ImageDraw.Draw(im)

    # 两片推进翼
    for sx in (-1, 1):
        def X(v):
            return k(72) + sx * k(v)
        d.polygon([(X(8), k(46)), (X(53), k(31)), (X(48), k(49)), (X(14), k(64))],
                  fill=ARMOR if sx < 0 else ARMOR_D)
        d.polygon([(X(8), k(64)), (X(43), k(55)), (X(38), k(71)), (X(12), k(78))],
                  fill=ARMOR_S if sx < 0 else (84, 96, 107))
        d.polygon([(X(23), k(42)), (X(51), k(33)), (X(49), k(41)), (X(25), k(49))], fill=RED)

    # 中心核心
    core = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dc = ImageDraw.Draw(core)
    dc.polygon([(k(72), k(34)), (k(84), k(60)), (k(72), k(86)), (k(60), k(60))], fill=(*CYAN, 255))
    im = Image.alpha_composite(im, glow(core, k(7), 0.85))
    im = Image.alpha_composite(im, glow(core, k(2), 1.0))
    im = Image.alpha_composite(im, core)
    d = ImageDraw.Draw(im)
    d.polygon([(k(72), k(46)), (k(78), k(60)), (k(72), k(74)), (k(66), k(60))], fill=(240, 252, 255))

    # 推进尾焰
    fl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    df = ImageDraw.Draw(fl)
    for sx in (-1, 1):
        x = k(72) + sx * k(17)
        df.polygon([(x - k(5), k(88)), (x + k(5), k(88)), (x + k(2), k(122)), (x - k(2), k(122))],
                   fill=(*AMBER, 255))
    im = Image.alpha_composite(im, glow(fl, k(6), 0.8))
    im = Image.alpha_composite(im, fl)
    return finish(im, 'B_wing')


# ---------------------------------------------------------------- C 面罩+翼
def icon_combo():
    im = background()
    d = ImageDraw.Draw(im)

    # 背后推进翼(厚实后掠)
    for sx in (-1, 1):
        def X(v):
            return k(72) + sx * k(v)
        d.polygon([(X(20), k(48)), (X(54), k(31)), (X(56), k(46)), (X(28), k(68)), (X(20), k(66))],
                  fill=ARMOR if sx < 0 else ARMOR_D)
        d.polygon([(X(32), k(47)), (X(52), k(36)), (X(53), k(43)), (X(35), k(54))], fill=RED)
        d.polygon([(X(24), k(58)), (X(46), k(48)), (X(47), k(54)), (X(27), k(64))], fill=ARMOR_S)

    # 头盔(略小于 A)
    d.polygon([(k(72), k(20)), (k(60), k(32)), (k(84), k(32))], fill=ARMOR)
    head = [(k(52), k(38)), (k(92), k(38)), (k(96), k(48)), (k(94), k(76)),
            (k(84), k(96)), (k(60), k(96)), (k(50), k(76)), (k(48), k(48))]
    d.polygon(head, fill=ARMOR)
    d.polygon([(k(72), k(38)), (k(92), k(38)), (k(96), k(48)), (k(94), k(76)),
               (k(84), k(96)), (k(72), k(96))], fill=ARMOR_D)
    d.polygon([(k(57), k(42)), (k(87), k(42)), (k(84), k(53)), (k(60), k(53))], fill=ARMOR_S)
    d.polygon([(k(69), k(42)), (k(76), k(42)), (k(75), k(53)), (k(70), k(53))], fill=RED)
    d.polygon([(k(60), k(82)), (k(84), k(82)), (k(79), k(96)), (k(65), k(96))], fill=DARK)

    eye = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    de = ImageDraw.Draw(eye)
    de.polygon([(k(54), k(60)), (k(69), k(58)), (k(69), k(70)), (k(56), k(70))], fill=(*CYAN, 255))
    de.polygon([(k(75), k(58)), (k(90), k(60)), (k(88), k(70)), (k(75), k(70))], fill=(*CYAN, 255))
    im = Image.alpha_composite(im, glow(eye, k(5), 0.9))
    im = Image.alpha_composite(im, eye)

    # 底部尾焰
    fl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    df = ImageDraw.Draw(fl)
    df.polygon([(k(62), k(100)), (k(82), k(100)), (k(77), k(126)), (k(67), k(126))],
               fill=(*AMBER, 255))
    im = Image.alpha_composite(im, glow(fl, k(7), 0.75))
    im = Image.alpha_composite(im, fl)
    return finish(im, 'C_combo')


# ---------------------------------------------------------------- D 字标
def icon_word(text='钢翼', name='D_word'):
    im = background()
    d = ImageDraw.Draw(im)

    # 顶部面罩剪影
    d.polygon([(k(72), k(12)), (k(63), k(21)), (k(81), k(21))], fill=ARMOR_D)
    d.polygon([(k(58), k(22)), (k(86), k(22)), (k(88), k(28)), (k(84), k(40)),
               (k(60), k(40)), (k(56), k(28))], fill=ARMOR)
    vz = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(vz).polygon([(k(59), k(29)), (k(85), k(29)), (k(83), k(35)), (k(61), k(35))],
                               fill=(*CYAN, 255))
    im = Image.alpha_composite(im, glow(vz, k(4), 0.9))
    im = Image.alpha_composite(im, vz)
    d = ImageDraw.Draw(im)

    f = ImageFont.truetype(FONT_ZH, int(k(42)))
    bb = d.textbbox((0, 0), text, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx, ty = C - tw / 2 - bb[0], k(76) - th / 2 - bb[1]
    # 字的辉光
    tl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(tl).text((tx, ty), text, font=f, fill=(*CYAN, 160))
    im = Image.alpha_composite(im, glow(tl, k(4), 0.7))
    d = ImageDraw.Draw(im)
    d.text((tx, ty), text, font=f, fill=(242, 250, 253))

    # 底部装饰线
    ln = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dl = ImageDraw.Draw(ln)
    dl.rectangle([k(42), k(107), k(102), k(111)], fill=(*CYAN, 255))
    im = Image.alpha_composite(im, glow(ln, k(4), 0.9))
    im = Image.alpha_composite(im, ln)
    d = ImageDraw.Draw(im)
    d.rectangle([k(66), k(106), k(78), k(112)], fill=AMBER)
    return finish(im, name)


# ---------------------------------------------------------------- E 面罩特写
def icon_faceplate():
    im = background()
    d = ImageDraw.Draw(im)

    # 额甲斜面
    d.polygon([(k(32), k(34)), (k(112), k(34)), (k(105), k(58)), (k(39), k(58))], fill=ARMOR)
    d.polygon([(k(72), k(34)), (k(112), k(34)), (k(105), k(58)), (k(72), k(58))], fill=ARMOR_D)
    d.polygon([(k(67), k(34)), (k(78), k(34)), (k(76), k(58)), (k(69), k(58))], fill=RED)
    d.polygon([(k(36), k(39)), (k(53), k(39)), (k(51), k(46)), (k(38), k(46))], fill=AMBER)

    # 侧面装甲块
    for sx in (-1, 1):
        x0 = k(72) + sx * k(45)
        x1 = k(72) + sx * k(35)
        d.polygon([(x0, k(60)), (x1, k(60)), (x1, k(92)), (x0, k(85))],
                  fill=ARMOR_S if sx < 0 else (78, 90, 101))

    # 单眼横缝
    eye = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    de = ImageDraw.Draw(eye)
    de.polygon([(k(35), k(62)), (k(109), k(62)), (k(104), k(79)), (k(40), k(79))],
               fill=(*CYAN, 255))
    im = Image.alpha_composite(im, glow(eye, k(8), 0.85))
    im = Image.alpha_composite(im, glow(eye, k(2), 1.0))
    im = Image.alpha_composite(im, eye)
    d = ImageDraw.Draw(im)
    for xx in (k(60), k(72), k(84)):
        d.polygon([(xx - k(1.6), k(62)), (xx + k(1.6), k(62)),
                   (xx + k(1.2), k(79)), (xx - k(1.2), k(79))], fill=(20, 42, 52))

    # 下颌格栅
    d.polygon([(k(42), k(83)), (k(102), k(83)), (k(95), k(110)), (k(49), k(110))], fill=DARK)
    for i in range(5):
        x = k(55) + i * k(8)
        d.polygon([(x, k(88)), (x + k(4), k(88)), (x + k(3.2), k(105)), (x - k(0.8), k(105))],
                  fill=ARMOR_S)
    return finish(im, 'E_face')


def contact():
    names = ['A_visor', 'E_face', 'B_wing', 'C_combo', 'D_word']
    pad, cell = 24, 320
    W = pad + (cell + pad) * len(names)
    H = pad + cell + 24 + 144 + pad + 30
    sheet = Image.new('RGB', (W, H), (238, 240, 242))
    dr = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT_EN, 22)
    for i, n in enumerate(names):
        x = pad + i * (cell + pad)
        big = Image.open(os.path.join(OUT, n + '_512.png')).resize((cell, cell), Image.LANCZOS)
        sheet.paste(big, (x, pad))
        dr.text((x, pad + cell + 4), n, font=f, fill=(40, 46, 52))
        small = Image.open(os.path.join(OUT, n + '_144.png'))
        sheet.paste(small, (x, pad + cell + 34))
        # 圆形裁切预览
        mask = Image.new('L', (144 * 4, 144 * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, 144 * 4 - 1, 144 * 4 - 1], fill=255)
        mask = mask.resize((144, 144), Image.LANCZOS)
        circ = Image.new('RGB', (144, 144), (238, 240, 242))
        circ.paste(small, (0, 0), mask)
        sheet.paste(circ, (x + 160, pad + cell + 34))
    dr.text((pad, H - 26), 'left: 144px square   right: 144px circular crop (WeChat avatar preview)',
            font=f, fill=(90, 98, 106))
    sheet.save(os.path.join(OUT, 'contact.jpg'), quality=93)


FINAL = 'A_visor'          # 选定方案(2026-11-18)


def finalize():
    """把选定方案复制成 icon_144.png / icon_512.png,上传微信时直接用这两个。"""
    import shutil
    for sz in (144, 512):
        src = os.path.join(OUT, '%s_%d.png' % (FINAL, sz))
        dst = os.path.join(HERE, 'icon_%d.png' % sz)
        shutil.copyfile(src, dst)
        im = Image.open(dst)
        print('icon_%d.png  %s  %s  %.1f KB'
              % (sz, im.size, im.mode, os.path.getsize(dst) / 1024))


if __name__ == '__main__':
    icon_visor()
    icon_faceplate()
    icon_wing()
    icon_combo()
    icon_word()
    contact()
    finalize()
    print('ok ->', OUT)
