"""Headless Blender script: build the IRON VANGUARD kit (mech, weapons, enemies, props) into one GLB.

Run:  D:/AI/tools/Blender/blender.exe -b -P build_kit.py -- --out D:/AI/mech_arena [--no-render] [--closeups]
Outputs: site/assets/kit.glb + preview.png (+ closeups/*.png)

Contract with the web side (site/*.js):
  * every kit item is an Empty named Kit_<Name>; children in local coords, Z up, FRONT = +Y
    (becomes -Z in three.js).  LEFT side of a mech = -X.
  * Mech pivots (rotated procedurally on the page):
      M_Hips > M_Torso > M_Head, M_Pack, M_ShoulderL/R > M_ArmL/R > M_ForeL/R > W_HandL/R
      M_Hips > M_ThighL/R > M_ShinL/R > M_FootL/R
      mounts: W_HandL/R (arm weapons), W_BackL/R (shoulder weapons)
      thruster nozzles: T_Back1, T_Back2 (M_Pack), T_LegL, T_LegR (shins)
  * weapon kits: origin = grip/mount, barrel along +Y, one Empty whose name starts with "Muzzle".
    Gatling spins "G_Spin".
  * enemies: Turret yaw "E_TYaw" > pitch "E_TPitch"; Drone rotors "E_Rotor*"; Walker legs
    "E_Leg{1..4}" > "E_Knee{1..4}", gun yaw "E_WGun".
  * materials named Armor / Armor2 / Accent are recoloured per mech on the page; anything with
    emission blooms.
"""
import bpy, math, random, sys, os

random.seed(11)
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[argv.index("--out") + 1] if "--out" in argv else os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(OUT, "site", "assets"), exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
COL = bpy.context.collection

# ---------------------------------------------------------------- materials
MATS = {}
def srgb(hexstr):
    h = hexstr.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b))

def mat(name, hexcol, rough=0.6, emit=None, strength=0.0, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*srgb(hexcol), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*srgb(emit), 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    m.diffuse_color = (*srgb(hexcol), 1.0)
    MATS[name] = m
    return m

M = dict(
    Armor=mat("Armor", "#e6e4df", 0.5, metal=0.15), Armor2=mat("Armor2", "#a9adb3", 0.5, metal=0.25),
    Accent=mat("Accent", "#cf3a2b", 0.45, metal=0.1), Frame=mat("Frame", "#3a3e46", 0.45, metal=0.55),
    Joint=mat("Joint", "#6a6f78", 0.35, metal=0.8), Black=mat("Black", "#15171b", 0.6),
    Hazard=mat("Hazard", "#e3b11f", 0.55), Piston=mat("Piston", "#c9ced6", 0.2, metal=0.9),
    Visor=mat("Visor", "#7ff0ff", 0.2, emit="#4fe6ff", strength=6.0),
    Nozzle=mat("Nozzle", "#2a2c31", 0.4, metal=0.7),
    NozzleGlow=mat("NozzleGlow", "#9fdcff", 0.3, emit="#6fc8ff", strength=4.0),
    Coil=mat("Coil", "#8ff4ff", 0.2, emit="#56e8ff", strength=5.0),
    Rail=mat("Rail", "#d6a4ff", 0.2, emit="#b06bff", strength=6.0),
    Plasma=mat("Plasma", "#ffcf8a", 0.2, emit="#ff9a3a", strength=5.0),
    Lens=mat("Lens", "#ff9df0", 0.2, emit="#ff5fe0", strength=6.0),
    EArmor=mat("EArmor", "#5b6450", 0.6, metal=0.2), EArmor2=mat("EArmor2", "#3d4436", 0.6, metal=0.2),
    EEye=mat("EEye", "#ff6a55", 0.2, emit="#ff3220", strength=7.0),
    Crate=mat("Crate", "#6c7466", 0.7, metal=0.2), CrateDark=mat("CrateDark", "#4b5148", 0.7, metal=0.2),
    Concrete=mat("Concrete", "#8d9096", 0.9), Barrel=mat("Barrel", "#b8402e", 0.5, metal=0.3),
    Repair=mat("Repair", "#8dffb0", 0.2, emit="#3cff86", strength=5.0),
    Ammo=mat("Ammo", "#ffe58a", 0.2, emit="#ffc23c", strength=5.0),
    Blade=mat("Blade", "#d8fbff", 0.1, emit="#7ff6ff", strength=9.0),
    Glass=mat("Glass", "#1c2a33", 0.15, metal=0.6),
    ShieldEmit=mat("ShieldEmit", "#9fe8ff", 0.2, emit="#4fd8ff", strength=6.0),
)

# ---------------------------------------------------------------- helpers
def link(o):
    COL.objects.link(o)
    return o

def _finish(o, name, material, bevel=0.0, parent=None, smooth=False):
    o.name = name
    if material is not None:
        o.data.materials.clear()
        o.data.materials.append(material)
    if bevel > 0:
        b = o.modifiers.new("Bevel", "BEVEL")
        b.width = bevel
        b.segments = 1
        b.limit_method = "ANGLE"
    for p in o.data.polygons:
        p.use_smooth = smooth
    if parent is not None:
        o.parent = parent
    return o

def empty(name, loc=(0, 0, 0), parent=None, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    link(e)
    e.location = loc
    e.rotation_euler = rot
    e.empty_display_size = 0.2
    if parent is not None:
        e.parent = parent
    return e

N = {"i": 0}
def nm(base):
    N["i"] += 1
    return f"{base}.{N['i']}"

def box(loc, size, material, parent, rot=(0, 0, 0), bevel=0.0, name="Box"):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    return _finish(o, nm(name), material, bevel, parent)

def wedge(loc, size, material, parent, rot=(0, 0, 0), taper=0.6, bevel=0.0):
    """Box whose top face (+Z) is shrunk along Y by `taper` (armour plate with a slanted front)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    for v in o.data.vertices:
        if v.co.z > 0:
            v.co.y = v.co.y * taper - (1 - taper) * 0.5 * 0.5
    o.scale = size
    return _finish(o, nm("Wedge"), material, bevel, parent)

def cyl(loc, r, h, material, parent, rot=(0, 0, 0), verts=12, r2=None, smooth=True):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = _finish(bpy.context.object, nm("Cyl"), material, 0, parent, smooth)
    if smooth:
        o.data.shade_smooth()
        # keep the caps flat-looking: autosmooth by angle via modifier is costly; caps are tiny so accept
    return o

def ball(loc, r, material, parent, scale=(1, 1, 1), sub=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.object
    o.scale = scale
    return _finish(o, nm("Ball"), material, 0, parent, True)

def torus(loc, r, t, material, parent, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=t, major_segments=16, minor_segments=6, location=loc, rotation=rot)
    return _finish(bpy.context.object, nm("Torus"), material, 0, parent, True)

ALONG_Y = (-math.pi / 2, 0, 0)   # rotates a +Z primitive so it points toward +Y (front)

KIT = []
def kit(name):
    i = len(KIT)
    e = empty(f"Kit_{name}", ((i % 6) * 8.0, (i // 6) * 9.0, 0))
    KIT.append(e)
    return e

# ================================================================= MECH
def side_name(s):
    return "L" if s < 0 else "R"

def grille(loc, size, parent, n=4, axis="z", mat_bg="Black", mat_slat="Frame"):
    """Recessed vent: dark plate with n slats across `axis`."""
    box(loc, size, M[mat_bg], parent)
    sx, sy, sz = size
    for i in range(n):
        k = (i + 0.5) / n - 0.5
        if axis == "z":
            box((loc[0], loc[1], loc[2] + k * sz * 0.9), (sx * 1.3, sy * 1.3, sz * 0.12) if sx < sy else (sx * 0.95, sy * 1.3, sz * 0.12), M[mat_slat], parent)
        else:
            box((loc[0] + k * sx * 0.9, loc[1], loc[2]), (sx * 0.12, sy * 1.3, sz * 0.95), M[mat_slat], parent)

def build_mech():
    K = kit("Mech")
    hips = empty("M_Hips", (0, 0, 2.75), K)
    box((0, 0, 0.02), (1.05, 0.78, 0.46), M["Frame"], hips, bevel=0.05)
    cyl((0, 0, -0.05), 0.2, 1.4, M["Joint"], hips, rot=(0, math.pi / 2, 0))
    for s in (-1, 1):
        wedge((s * 0.3, 0.42, -0.2), (0.48, 0.16, 0.62), M["Armor"], hips, rot=(math.radians(14), 0, s * math.radians(-8)), bevel=0.03, taper=0.75)
        box((s * 0.3, 0.51, -0.06), (0.3, 0.03, 0.06), M["Accent"], hips, rot=(math.radians(14), 0, 0))
        wedge((s * 0.7, 0.02, -0.18), (0.18, 0.86, 0.7), M["Armor"], hips, rot=(0, s * math.radians(10), 0), bevel=0.03, taper=0.8)
        box((s * 0.8, 0.12, -0.12), (0.03, 0.42, 0.12), M["Hazard"], hips, rot=(0, s * math.radians(10), 0))
    box((0, 0.42, -0.25), (0.2, 0.16, 0.42), M["Accent"], hips, bevel=0.03)
    wedge((0, -0.46, -0.12), (0.8, 0.14, 0.56), M["Armor2"], hips, rot=(math.radians(-12), 0, 0), bevel=0.03, taper=0.75)

    for side, s in (("L", -1), ("R", 1)):
        th = empty(f"M_Thigh{side}", (s * 0.62, 0, -0.12), hips)
        ball((0, 0, 0), 0.26, M["Joint"], th)
        cyl((0, 0, -0.55), 0.15, 1.0, M["Frame"], th)
        wedge((0, 0.12, -0.5), (0.5, 0.48, 0.85), M["Armor"], th, bevel=0.05, taper=0.85)
        box((s * 0.27, 0.0, -0.52), (0.07, 0.5, 0.7), M["Armor2"], th, bevel=0.02)
        box((s * 0.31, 0.0, -0.52), (0.02, 0.3, 0.4), M["Frame"], th)
        box((0, 0.37, -0.48), (0.1, 0.03, 0.55), M["Accent"], th)
        for k in (-1, 1):
            cyl((k * 0.15, -0.22, -0.55), 0.045, 0.8, M["Piston"], th)
            cyl((k * 0.15, -0.22, -0.3), 0.07, 0.3, M["Frame"], th)
        sh = empty(f"M_Shin{side}", (0, 0, -1.15), th)
        ball((0, 0, 0), 0.24, M["Joint"], sh)
        wedge((0, 0.3, 0.08), (0.46, 0.26, 0.5), M["Armor2"], sh, bevel=0.04, taper=0.6)
        box((0, 0.44, 0.12), (0.12, 0.06, 0.3), M["Accent"], sh)
        cyl((0, 0.45, 0.36), 0.08, 0.26, M["Armor2"], sh, r2=0.0, verts=6, smooth=False)
        wedge((0, 0.1, -0.62), (0.66, 0.74, 1.1), M["Armor"], sh, rot=(math.pi, 0, 0), bevel=0.05, taper=0.82)
        box((0, 0.47, -0.55), (0.08, 0.03, 0.6), M["Visor"], sh)
        box((0, 0.46, -0.98), (0.42, 0.04, 0.1), M["Accent"], sh)
        for k in (-1, 1):
            grille((k * 0.34, 0.1, -0.62), (0.03, 0.42, 0.38), sh, n=4)
        box((0, -0.3, -0.5), (0.46, 0.34, 0.8), M["Frame"], sh, bevel=0.04)
        for k in (-1, 1):
            cyl((k * 0.17, -0.12, -0.3), 0.05, 0.7, M["Piston"], sh)
        cyl((0, -0.42, -0.82), 0.16, 0.24, M["Nozzle"], sh, r2=0.2)
        cyl((0, -0.42, -0.93), 0.13, 0.02, M["NozzleGlow"], sh)
        empty(f"T_Leg{side}", (0, -0.42, -0.95), sh)
        ft = empty(f"M_Foot{side}", (0, 0, -1.2), sh)
        ball((0, 0, 0), 0.2, M["Joint"], ft)
        wedge((0, 0.02, -0.06), (0.56, 0.6, 0.3), M["Armor2"], ft, bevel=0.03, taper=0.7)
        box((0, 0.12, -0.24), (0.86, 1.3, 0.24), M["Frame"], ft, bevel=0.05)
        for k in (-1, 0, 1):
            wedge((k * 0.28, 0.85, -0.25), (0.24, 0.5, 0.22), M["Armor"], ft, bevel=0.03, taper=0.35)
        wedge((0, -0.58, -0.22), (0.44, 0.4, 0.26), M["Armor"], ft, rot=(0, 0, math.pi), bevel=0.03, taper=0.5)
        for k in (-1, 1):
            box((k * 0.44, 0.12, -0.24), (0.03, 0.9, 0.12), M["Hazard"], ft)

    tor = empty("M_Torso", (0, 0, 0.3), hips)
    cyl((0, 0, 0.12), 0.3, 0.4, M["Joint"], tor)
    for i, w in enumerate((0.8, 0.86, 0.92)):
        box((0, 0.04, 0.24 + i * 0.16), (w, 0.6, 0.13), M["Frame"] if i % 2 == 0 else M["Armor2"], tor, bevel=0.03)
    box((0, 0.02, 1.0), (1.8, 1.15, 0.95), M["Armor"], tor, bevel=0.08)
    for s in (-1, 1):
        wedge((s * 0.42, 0.56, 1.1), (0.68, 0.22, 0.7), M["Armor"], tor, rot=(math.radians(-10), 0, s * math.radians(6)), bevel=0.04, taper=0.7)
        box((s * 0.42, 0.68, 0.82), (0.5, 0.04, 0.06), M["Accent"], tor)
        box((s * 0.66, 0.66, 1.15), (0.04, 0.04, 0.45), M["Visor"], tor)
        grille((s * 0.86, 0.3, 0.92), (0.06, 0.4, 0.42), tor, n=5)
        box((s * 0.92, -0.1, 1.05), (0.04, 0.5, 0.6), M["Armor2"], tor, bevel=0.02)
    box((0, 0.66, 1.0), (0.24, 0.12, 0.62), M["Armor2"], tor, bevel=0.03)
    box((0, 0.73, 1.22), (0.16, 0.04, 0.14), M["Visor"], tor)
    grille((0, 0.62, 0.6), (0.6, 0.06, 0.16), tor, n=4, axis="x")
    box((0, -0.05, 1.52), (1.2, 0.95, 0.18), M["Frame"], tor, bevel=0.04)
    for s in (-1, 1):
        wedge((s * 0.42, 0.25, 1.55), (0.3, 0.5, 0.2), M["Armor2"], tor, bevel=0.02, taper=0.6)
    hd = empty("M_Head", (0, 0.15, 1.62), tor)
    cyl((0, 0, 0.05), 0.17, 0.15, M["Joint"], hd)
    wedge((0, 0.04, 0.22), (0.54, 0.62, 0.34), M["Armor"], hd, bevel=0.05, taper=0.7)
    wedge((0, 0.16, 0.4), (0.4, 0.42, 0.08), M["Armor2"], hd, bevel=0.02, taper=0.6)
    box((0, 0.36, 0.24), (0.44, 0.06, 0.08), M["Black"], hd)
    box((0, 0.375, 0.24), (0.3, 0.04, 0.05), M["Visor"], hd)
    box((0, 0.34, 0.1), (0.28, 0.12, 0.1), M["Frame"], hd, bevel=0.02)
    box((0, 0.1, 0.45), (0.08, 0.5, 0.05), M["Accent"], hd)
    for s in (-1, 1):
        grille((s * 0.3, 0.05, 0.2), (0.06, 0.3, 0.18), hd, n=3)
        cyl((s * 0.26, -0.18, 0.45), 0.018, 0.55, M["Piston"], hd, rot=(math.radians(-30), 0, 0), smooth=False)
    pk = empty("M_Pack", (0, -0.72, 1.0), tor)
    box((0, 0, 0), (1.25, 0.5, 1.0), M["Frame"], pk, bevel=0.06)
    box((0, -0.27, 0.15), (0.8, 0.06, 0.5), M["Armor2"], pk, bevel=0.02)
    grille((0, -0.3, -0.25), (0.5, 0.04, 0.24), pk, n=3, axis="x")
    for idx, s in ((1, -1), (2, 1)):
        cyl((s * 0.44, -0.22, -0.1), 0.23, 0.9, M["Armor"], pk)
        cyl((s * 0.44, -0.22, 0.38), 0.15, 0.14, M["Accent"], pk)
        box((s * 0.44, -0.47, -0.05), (0.04, 0.2, 0.6), M["Armor2"], pk)
        cyl((s * 0.44, -0.22, -0.66), 0.17, 0.26, M["Nozzle"], pk, r2=0.24)
        cyl((s * 0.44, -0.22, -0.8), 0.18, 0.02, M["NozzleGlow"], pk)
        empty(f"T_Back{idx}", (s * 0.44, -0.22, -0.82), pk)
        wing = empty(f"M_Wing{side_name(s)}", (s * 0.55, 0.0, 0.38), pk, rot=(math.radians(-18), 0, s * math.radians(-28)))
        box((s * 0.55, -0.1, 0.05), (1.1, 0.07, 0.5), M["Armor"], wing, bevel=0.02)
        box((s * 0.75, -0.1, 0.26), (0.7, 0.08, 0.06), M["Accent"], wing)
        box((s * 1.05, -0.1, -0.1), (0.16, 0.09, 0.5), M["Armor2"], wing, bevel=0.02)
        box((s * 0.95, -0.15, 0.05), (0.04, 0.03, 0.36), M["NozzleGlow"], wing)
    empty("W_BackL", (-0.64, -0.5, 1.64), tor)
    empty("W_BackR", (0.64, -0.5, 1.64), tor)
    for side, s in (("L", -1), ("R", 1)):
        shd = empty(f"M_Shoulder{side}", (s * 1.12, 0, 1.12), tor)
        ball((0, 0, 0), 0.3, M["Joint"], shd)
        wedge((s * 0.24, 0, 0.16), (0.66, 1.06, 0.66), M["Armor"], shd, bevel=0.06, taper=0.7)
        wedge((s * 0.3, 0.05, 0.52), (0.5, 0.8, 0.12), M["Armor2"], shd, bevel=0.02, taper=0.7)
        box((s * 0.58, 0, 0.16), (0.04, 0.84, 0.14), M["Accent"], shd)
        box((s * 0.57, 0.1, -0.06), (0.04, 0.45, 0.14), M["Hazard"], shd)
        box((s * 0.24, 0.54, 0.2), (0.4, 0.04, 0.05), M["Visor"], shd)
        wedge((s * 0.3, 0, -0.26), (0.5, 0.86, 0.22), M["Armor2"], shd, rot=(math.pi, 0, 0), bevel=0.02, taper=0.8)
        arm = empty(f"M_Arm{side}", (s * 0.3, 0, -0.18), shd)
        cyl((0, 0, -0.4), 0.15, 0.8, M["Frame"], arm)
        box((0, 0, -0.38), (0.42, 0.46, 0.55), M["Armor2"], arm, bevel=0.05)
        box((s * 0.22, 0, -0.38), (0.03, 0.3, 0.35), M["Frame"], arm)
        fo = empty(f"M_Fore{side}", (0, 0, -0.85), arm)
        ball((0, 0, 0), 0.2, M["Joint"], fo)
        wedge((0, -0.2, 0.0), (0.4, 0.3, 0.36), M["Armor2"], fo, rot=(math.pi / 2, 0, 0), bevel=0.02, taper=0.6)
        box((0, 0.36, -0.04), (0.5, 0.92, 0.5), M["Armor"], fo, bevel=0.06)
        wedge((s * 0.27, 0.32, -0.02), (0.08, 0.7, 0.36), M["Armor2"], fo, bevel=0.02, taper=0.8)
        box((s * 0.315, 0.36, -0.02), (0.02, 0.5, 0.1), M["Accent"], fo)
        box((0, 0.36, 0.23), (0.1, 0.6, 0.03), M["Visor"], fo)
        box((0, 0.36, -0.31), (0.32, 0.6, 0.06), M["Frame"], fo)
        empty(f"W_Hand{side}", (0, 0.82, -0.08), fo)


# ================================================================= ARM WEAPONS
def muzzle(name, loc, parent):
    empty(name, loc, parent)

def build_rifle():
    K = kit("W_Rifle")
    box((0, 0.3, 0), (0.32, 1.1, 0.36), M["Frame"], K, bevel=0.04)
    box((0, 0.25, 0.22), (0.26, 0.7, 0.1), M["Armor2"], K, bevel=0.02)
    box((0, 0.1, -0.32), (0.18, 0.3, 0.4), M["Black"], K, bevel=0.02, rot=(math.radians(-12), 0, 0))
    cyl((0, 1.3, 0.04), 0.075, 1.1, M["Joint"], K, rot=ALONG_Y)
    cyl((0, 1.85, 0.04), 0.1, 0.16, M["Frame"], K, rot=ALONG_Y)
    box((0, 0.55, 0.32), (0.12, 0.3, 0.1), M["Visor"], K)
    box((0.17, 0.4, 0), (0.02, 0.5, 0.12), M["Accent"], K)
    muzzle("Muzzle_Rifle", (0, 1.95, 0.04), K)

def build_gatling():
    K = kit("W_Gatling")
    cyl((0, 0.3, 0), 0.32, 0.8, M["Frame"], K, rot=ALONG_Y)
    box((0, 0.2, -0.38), (0.4, 0.55, 0.32), M["Armor2"], K, bevel=0.04)
    box((0.33, 0.2, 0), (0.06, 0.5, 0.2), M["Hazard"], K)
    spin = empty("G_Spin", (0, 0.75, 0), K)
    for i in range(6):
        a = i * math.pi / 3
        cyl((math.cos(a) * 0.17, 0.55, math.sin(a) * 0.17), 0.055, 1.1, M["Joint"], spin, rot=ALONG_Y, verts=8)
    cyl((0, 0.3, 0), 0.26, 0.08, M["Frame"], spin, rot=ALONG_Y)
    cyl((0, 1.0, 0), 0.27, 0.08, M["Frame"], spin, rot=ALONG_Y)
    muzzle("Muzzle_Gatling", (0, 1.9, 0), K)

def build_coil():
    K = kit("W_Coil")
    box((0, 0.25, 0), (0.36, 0.9, 0.38), M["Frame"], K, bevel=0.05)
    cyl((0, 1.0, 0), 0.1, 1.0, M["Joint"], K, rot=ALONG_Y)
    for i in range(3):
        torus((0, 0.75 + i * 0.25, 0), 0.2, 0.05, M["Coil"], K, rot=(math.pi / 2, 0, 0))
    for s in (-1, 1):
        box((s * 0.14, 1.55, 0), (0.05, 0.4, 0.08), M["Armor2"], K, rot=(0, 0, s * 0.25))
    box((0, 0.2, 0.24), (0.2, 0.5, 0.1), M["Accent"], K)
    muzzle("Muzzle_Coil", (0, 1.75, 0), K)

def build_rail():
    K = kit("W_Rail")
    box((0, 0.1, 0), (0.42, 0.7, 0.44), M["Frame"], K, bevel=0.05)
    for s in (-1, 1):
        box((s * 0.13, 1.05, 0), (0.08, 1.8, 0.24), M["Armor"], K, bevel=0.02)
        box((s * 0.18, 1.05, 0), (0.02, 1.4, 0.08), M["Accent"], K)
    box((0, 1.0, 0), (0.05, 1.6, 0.06), M["Rail"], K)
    cyl((0, 0.1, 0.3), 0.12, 0.6, M["Rail"], K, rot=ALONG_Y)
    muzzle("Muzzle_Rail", (0, 1.95, 0), K)

def build_blade():
    K = kit("W_Blade")
    # forearm-mounted emitter; the beam itself lives under B_Blade so the page can extend it
    box((0, 0.15, 0), (0.4, 0.8, 0.42), M["Frame"], K, bevel=0.05)
    box((0, 0.1, 0.26), (0.3, 0.6, 0.08), M["Armor"], K, bevel=0.02)
    box((0.22, 0.1, 0), (0.04, 0.55, 0.2), M["Accent"], K)
    cyl((0, 0.65, 0), 0.17, 0.3, M["Joint"], K, rot=ALONG_Y)
    torus((0, 0.82, 0), 0.15, 0.04, M["Blade"], K, rot=(math.pi / 2, 0, 0))
    b = empty("B_Blade", (0, 0.85, 0), K)
    box((0, 1.5, 0), (0.08, 3.0, 0.22), M["Blade"], b)
    box((0, 3.05, 0), (0.06, 0.18, 0.14), M["Blade"], b)
    muzzle("Muzzle_Blade", (0, 1.0, 0), K)

# ================================================================= SHOULDER WEAPONS
def build_missile():
    K = kit("S_Missile")
    box((0, 0.1, 0.35), (0.78, 1.1, 0.62), M["Armor"], K, bevel=0.05)
    box((0, 0.67, 0.35), (0.7, 0.06, 0.54), M["Frame"], K)
    for i in range(3):
        for j in range(2):
            cyl((-0.22 + i * 0.22, 0.7, 0.22 + j * 0.25), 0.075, 0.04, M["Black"], K, rot=ALONG_Y, verts=8)
    box((0.4, 0.1, 0.35), (0.03, 0.8, 0.12), M["Accent"], K)
    box((0, -0.2, 0.05), (0.3, 0.3, 0.1), M["Joint"], K)
    muzzle("Muzzle_Missile", (0, 0.75, 0.35), K)

def build_cannon():
    K = kit("S_Cannon")
    box((0, -0.05, 0.3), (0.5, 0.9, 0.5), M["Armor2"], K, bevel=0.05)
    cyl((0, 1.0, 0.32), 0.16, 1.9, M["Frame"], K, rot=ALONG_Y)
    cyl((0, 1.9, 0.32), 0.21, 0.24, M["Armor"], K, rot=ALONG_Y)
    for i in range(3):
        torus((0, 0.55 + i * 0.3, 0.32), 0.18, 0.035, M["Plasma"], K, rot=(math.pi / 2, 0, 0))
    box((0, -0.05, 0.58), (0.2, 0.6, 0.06), M["Accent"], K)
    muzzle("Muzzle_Cannon", (0, 2.05, 0.32), K)

def build_laser():
    K = kit("S_Laser")
    box((0, 0.1, 0.32), (0.46, 1.2, 0.42), M["Armor"], K, bevel=0.05)
    box((0, 0.78, 0.32), (0.3, 0.2, 0.3), M["Frame"], K, bevel=0.03)
    cyl((0, 0.9, 0.32), 0.1, 0.06, M["Lens"], K, rot=ALONG_Y)
    for s in (-1, 1):
        box((s * 0.25, 0.2, 0.32), (0.04, 0.8, 0.14), M["Accent"], K)
    muzzle("Muzzle_Laser", (0, 0.95, 0.32), K)

def build_shotgun():
    K = kit("W_Shotgun")
    # short heavy receiver, two stacked wide barrels, pump grip
    box((0, 0.2, 0), (0.42, 0.9, 0.44), M["Frame"], K, bevel=0.05)
    box((0, 0.1, 0.27), (0.34, 0.6, 0.1), M["Armor"], K, bevel=0.02)
    for z in (0.09, -0.11):
        cyl((0, 1.0, z), 0.11, 0.95, M["Joint"], K, rot=ALONG_Y, verts=10)
        cyl((0, 1.47, z), 0.13, 0.08, M["Frame"], K, rot=ALONG_Y, verts=10)
    box((0, 0.85, -0.02), (0.3, 0.32, 0.36), M["Armor2"], K, bevel=0.03)
    box((0.23, 0.25, 0), (0.04, 0.6, 0.22), M["Hazard"], K)
    box((0, 0.45, 0.34), (0.12, 0.2, 0.06), M["Visor"], K)
    muzzle("Muzzle_Shotgun", (0, 1.55, 0), K)

def build_shield():
    K = kit("S_Shield")
    # shoulder projector: armored housing with an emitter dish facing forward
    box((0, 0.0, 0.32), (0.6, 0.8, 0.52), M["Armor2"], K, bevel=0.05)
    box((0, 0.0, 0.6), (0.5, 0.6, 0.06), M["Accent"], K)
    cyl((0, 0.44, 0.32), 0.27, 0.1, M["Frame"], K, rot=ALONG_Y, verts=16)
    cyl((0, 0.5, 0.32), 0.2, 0.05, M["ShieldEmit"], K, rot=ALONG_Y, verts=16)
    for s in (-1, 1):
        box((s * 0.33, 0.25, 0.32), (0.05, 0.5, 0.36), M["Frame"], K)
    muzzle("Muzzle_Shield", (0, 0.56, 0.32), K)

# ================================================================= ENEMIES
def build_turret():
    K = kit("E_Turret")
    cyl((0, 0, 0.3), 1.25, 0.6, M["CrateDark"], K, verts=8, smooth=False)
    cyl((0, 0, 0.62), 1.05, 0.06, M["Hazard"], K, verts=8, smooth=False)
    cyl((0, 0, 0.95), 0.4, 0.7, M["Frame"], K)
    yaw = empty("E_TYaw", (0, 0, 1.35), K)
    box((0, -0.1, 0.3), (1.3, 1.4, 0.75), M["EArmor"], yaw, bevel=0.08)
    box((0, 0.62, 0.42), (0.6, 0.1, 0.18), M["EEye"], yaw)
    pit = empty("E_TPitch", (0, 0.3, 0.3), yaw)
    for s in (-1, 1):
        cyl((s * 0.32, 0.9, 0), 0.12, 1.5, M["Frame"], pit, rot=ALONG_Y)
        cyl((s * 0.32, 1.62, 0), 0.16, 0.2, M["EArmor2"], pit, rot=ALONG_Y)
    muzzle("Muzzle_Turret", (0, 1.75, 0), pit)

def build_drone():
    K = kit("E_Drone")
    ball((0, 0, 0), 0.75, M["EArmor"], K, scale=(1, 1, 0.55))
    box((0, 0, -0.25), (0.6, 0.9, 0.3), M["EArmor2"], K, bevel=0.05)
    box((0, 0.6, 0.0), (0.4, 0.1, 0.16), M["EEye"], K)
    for i, (x, y) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        box((x * 0.6, y * 0.6, 0.1), (0.9, 0.16, 0.12), M["Frame"], K, rot=(0, 0, math.atan2(y, x)))
        cyl((x * 1.0, y * 1.0, 0.1), 0.38, 0.12, M["EArmor2"], K, verts=12, smooth=False)
        r = empty(f"E_Rotor{i + 1}", (x * 1.0, y * 1.0, 0.2), K)
        box((0, 0, 0), (0.7, 0.08, 0.03), M["Black"], r)
    cyl((0, 0.4, -0.45), 0.07, 0.5, M["Joint"], K, rot=ALONG_Y)
    muzzle("Muzzle_Drone", (0, 0.7, -0.45), K)

def build_walker():
    K = kit("E_Walker")
    body = empty("E_WBody", (0, 0, 2.2), K)
    box((0, 0, 0), (1.8, 2.3, 0.8), M["EArmor"], body, bevel=0.1)
    wedge((0, 0.9, 0.05), (1.4, 0.7, 0.7), M["EArmor2"], body, bevel=0.06, taper=0.6)
    box((0, 1.25, 0.1), (0.8, 0.08, 0.16), M["EEye"], body)
    box((0, -0.3, 0.45), (1.2, 1.0, 0.15), M["Hazard"], body)
    gun = empty("E_WGun", (0, 0, 0.6), body)
    box((0, 0, 0.2), (0.8, 0.9, 0.45), M["EArmor2"], gun, bevel=0.05)
    for s in (-1, 1):
        cyl((s * 0.25, 0.9, 0.22), 0.1, 1.3, M["Frame"], gun, rot=ALONG_Y)
    muzzle("Muzzle_Walker", (0, 1.6, 0.22), gun)
    for i, (x, y) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        leg = empty(f"E_Leg{i + 1}", (x * 0.85, y * 0.95, -0.1), body, rot=(0, 0, math.atan2(y, x)))
        ball((0, 0, 0), 0.25, M["Joint"], leg)
        box((0.65, 0, 0.25), (1.3, 0.3, 0.3), M["EArmor"], leg, rot=(0, math.radians(-25), 0), bevel=0.04)
        kn = empty(f"E_Knee{i + 1}", (1.25, 0, 0.55), leg)
        ball((0, 0, 0), 0.2, M["Joint"], kn)
        box((0.15, 0, -1.2), (0.26, 0.26, 2.4), M["Frame"], kn, rot=(0, math.radians(-8), 0), bevel=0.03)
        box((0.32, 0, -2.45), (0.5, 0.5, 0.18), M["EArmor2"], kn, bevel=0.03)

def build_gunship():
    K = kit("E_Gunship")
    # fuselage along +Y, ~7 m long
    box((0, 0, 0), (1.9, 4.6, 1.5), M["EArmor"], K, bevel=0.12)
    wedge((0, 2.7, -0.05), (1.6, 1.2, 1.2), M["EArmor2"], K, taper=0.4, bevel=0.08)
    box((0, 3.05, 0.25), (0.9, 0.5, 0.35), M["Glass"], K, bevel=0.05)
    box((0, 3.25, 0.05), (0.7, 0.08, 0.14), M["EEye"], K)
    box((0, -2.9, 0.3), (0.6, 2.0, 0.5), M["EArmor2"], K, bevel=0.05)
    box((0, -3.8, 0.9), (0.12, 0.8, 1.1), M["EArmor"], K, bevel=0.03)
    box((0, -0.4, 0.8), (1.2, 2.0, 0.2), M["Hazard"], K)
    box((0, -0.4, -0.85), (1.4, 3.0, 0.3), M["Frame"], K)
    for s in (-1, 1):
        side = "L" if s < 0 else "R"
        box((s * 1.8, 0.2, 0.2), (1.8, 0.6, 0.18), M["Frame"], K)
        # rotor nacelle
        cyl((s * 2.9, 0.2, 0.2), 0.75, 0.7, M["EArmor2"], K, verts=16, smooth=False)
        torus((s * 2.9, 0.2, 0.55), 1.45, 0.08, M["Frame"], K)
        r = empty(f"E_GRotor{side}", (s * 2.9, 0.2, 0.62), K)
        for a in (0, math.pi / 3, 2 * math.pi / 3):
            box((0, 0, 0), (2.7, 0.18, 0.04), M["Black"], r, rot=(0, 0, a))
        # missile pod
        box((s * 1.25, 0.9, -0.55), (0.55, 1.3, 0.55), M["EArmor2"], K, bevel=0.05)
        for i in range(2):
            for j in range(2):
                cyl((s * 1.25 - 0.12 + i * 0.24, 1.56, -0.67 + j * 0.24), 0.08, 0.04, M["EEye"], K, rot=ALONG_Y, verts=8)
        muzzle(f"Muzzle_Gunship{side}", (s * 1.25, 1.7, -0.55), K)
    cyl((0, 2.3, -0.9), 0.22, 0.4, M["Frame"], K)
    cyl((0, 2.75, -1.05), 0.08, 0.9, M["Joint"], K, rot=ALONG_Y)
    muzzle("Muzzle_GunshipC", (0, 3.25, -1.05), K)

def build_bulwark():
    K = kit("E_Bulwark")
    box((0, 0, 0.95), (3.2, 4.6, 1.1), M["EArmor"], K, bevel=0.1)
    wedge((0, 2.0, 1.15), (2.8, 0.9, 0.8), M["EArmor2"], K, taper=0.5, bevel=0.06)
    for s in (-1, 1):
        box((s * 1.85, 0, 0.6), (0.7, 5.0, 1.2), M["Black"], K, bevel=0.15)
        for i in range(5):
            cyl((s * 1.85, -1.9 + i * 0.95, 0.55), 0.42, 0.75, M["Frame"], K, rot=(0, math.pi / 2, 0), verts=12)
        box((s * 1.85, 0, 1.25), (0.78, 4.6, 0.12), M["EArmor2"], K)
    box((0, -1.6, 1.55), (2.0, 1.0, 0.15), M["Hazard"], K)
    tur = empty("E_BTurret", (0, -0.2, 1.5), K)
    cyl((0, 0, 0.35), 1.15, 0.7, M["EArmor2"], tur, verts=10, smooth=False)
    box((0, 0.4, 0.75), (1.2, 1.4, 0.5), M["EArmor"], tur, bevel=0.06)
    box((0, 1.1, 0.8), (0.6, 0.08, 0.14), M["EEye"], tur)
    cyl((0, 1.3, 1.25), 0.22, 1.6, M["Frame"], tur, rot=(-math.pi / 2 + 0.55, 0, 0))
    muzzle("Muzzle_Bulwark", (0, 1.75, 1.95), tur)
    # shield emitter arms at the front of the turret; the page hangs the shield off E_BShield
    for s in (-1, 1):
        box((s * 0.9, 1.0, 0.55), (0.2, 0.9, 0.2), M["Frame"], tur, rot=(0, 0, s * -0.4))
        ball((s * 1.15, 1.45, 0.6), 0.2, M["ShieldEmit"], tur)
    empty("E_BShield", (0, 2.0, 0.4), tur)

def build_relay():
    # ~15 m comms relay: armored base, four tapering legs, glowing core, spinning dish (E_RDish)
    K = kit("E_Relay")
    box((0, 0, 0.6), (6.0, 6.0, 1.2), M["EArmor2"], K, bevel=0.12)
    box((0, 0, 1.3), (4.6, 4.6, 0.3), M["Hazard"], K)
    for (x, y) in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        box((x * 2.6, y * 2.6, 0.9), (1.1, 1.1, 1.8), M["EArmor"], K, bevel=0.08)
        a, b = (x * 2.1, y * 2.1, 1.4), (x * 0.7, y * 0.7, 12.5)
        mid = tuple((a[i] + b[i]) / 2 for i in range(3))
        dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        tilt = math.acos(dz / L)
        cyl(mid, 0.22, L, M["Frame"], K, rot=(0, tilt, math.atan2(dy, dx)), verts=8)
    for z in (4.5, 8.0, 11.0):
        k = 1 - (z - 1.4) / 11.1 * 0.68
        for (x, y, rz) in ((0, 1, 0), (0, -1, 0), (1, 0, math.pi / 2), (-1, 0, math.pi / 2)):
            box((x * 2.1 * k, y * 2.1 * k, z), (4.2 * k, 0.16, 0.16), M["Frame"], K, rot=(0, 0, rz))
    # core: armored housing with glowing slots (the hit point)
    cyl((0, 0, 3.2), 1.3, 2.6, M["EArmor"], K, verts=10, smooth=False)
    for i in range(5):
        a = i * 2 * math.pi / 5
        box((math.cos(a) * 1.28, math.sin(a) * 1.28, 3.2), (0.22, 0.22, 1.9), M["EEye"], K, rot=(0, 0, a))
    cyl((0, 0, 4.6), 1.5, 0.3, M["Hazard"], K, verts=10, smooth=False)
    cyl((0, 0, 7.5), 0.35, 6.0, M["Frame"], K)
    ball((0, 0, 12.8), 0.7, M["EEye"], K)
    dish = empty("E_RDish", (0, 0, 13.4), K)
    cyl((0, 0, 0.2), 0.25, 0.6, M["Joint"], dish)
    cyl((0, 0.7, 0.9), 1.9, 0.25, M["EArmor"], dish, rot=(math.radians(70), 0, 0), verts=16, r2=0.6, smooth=False)
    cyl((0, 1.6, 1.2), 0.06, 1.6, M["Frame"], dish, rot=(math.radians(70), 0, 0))
    for s in (-1, 1):
        box((s * 0.9, 0, 0.5), (0.12, 0.12, 0.9), M["Frame"], dish)
    empty("E_RCore", (0, 0, 3.2), K)

def build_reactor():
    # friendly reactor core for the defense mission: ~11 m, octagonal base, glowing coil column, spinning ring F_RRing
    K = kit("F_Reactor")
    cyl((0, 0, 0.5), 6.2, 1.0, M["Concrete"], K, verts=8, smooth=False)
    cyl((0, 0, 1.05), 5.4, 0.12, M["Hazard"], K, verts=8, smooth=False)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 4.0, math.sin(a) * 4.0
        box((x, y, 2.6), (1.4, 1.4, 3.2), M["Frame"], K, rot=(0, 0, a), bevel=0.08)
        box((x * 0.82, y * 0.82, 4.4), (1.2, 0.5, 0.5), M["Joint"], K, rot=(0, 0, a))
        cyl((x, y, 4.35), 0.45, 0.25, M["Coil"], K, verts=10)
    cyl((0, 0, 2.2), 2.6, 2.4, M["Frame"], K, verts=12, smooth=False)
    cyl((0, 0, 6.0), 1.55, 5.4, M["Glass"], K, verts=16)
    for z in (3.9, 5.1, 6.3, 7.5):
        cyl((0, 0, z), 1.75, 0.22, M["Coil"], K, verts=16)
    cyl((0, 0, 6.0), 0.8, 5.0, M["Coil"], K, verts=12)
    cyl((0, 0, 8.9), 2.3, 0.7, M["Frame"], K, verts=12, smooth=False)
    cyl((0, 0, 9.4), 1.4, 0.4, M["Piston"], K, verts=12)
    ball((0, 0, 10.1), 0.75, M["Coil"], K)
    ring = empty("F_RRing", (0, 0, 6.0), K)
    for i in range(6):
        a = i * math.pi / 3
        box((math.cos(a) * 2.6, math.sin(a) * 2.6, 0), (0.35, 1.3, 0.25), M["Piston"], ring, rot=(0, 0, a))
        box((math.cos(a) * 2.6, math.sin(a) * 2.6, 0), (0.12, 0.8, 0.3), M["Coil"], ring, rot=(0, 0, a))

# ================================================================= PROPS / PICKUPS
def build_props():
    K = kit("P_Crate")
    box((0, 0, 1.25), (5.0, 2.5, 2.5), M["Crate"], K, bevel=0.04)
    for i in range(9):
        box((-2.2 + i * 0.55, 1.27, 1.25), (0.12, 0.06, 2.3), M["CrateDark"], K)
        box((-2.2 + i * 0.55, -1.27, 1.25), (0.12, 0.06, 2.3), M["CrateDark"], K)
    for s in (-1, 1):
        box((s * 2.5, 0, 1.25), (0.08, 2.5, 2.5), M["CrateDark"], K)
    K = kit("P_Barrier")
    wedge((0, 0, 0.55), (3.0, 0.9, 1.1), M["Concrete"], K, taper=0.45, bevel=0.03)
    for i in range(5):
        box((-1.2 + i * 0.6, 0.0, 0.85), (0.3, 0.6, 0.22), M["Hazard"], K)
    K = kit("P_Pillar")
    box((0, 0, 4.0), (2.0, 2.0, 8.0), M["Frame"], K, bevel=0.05)
    for z in (0.6, 7.2):
        box((0, 0, z), (2.06, 2.06, 0.5), M["Hazard"], K)
    K = kit("P_Barrel")
    for (x, y) in ((0, 0), (0.95, 0.2), (0.4, 0.9)):
        cyl((x, y, 0.7), 0.45, 1.4, M["Barrel"], K, verts=12)
        cyl((x, y, 1.0), 0.47, 0.08, M["Hazard"], K, verts=12)
    K = kit("P_Repair")
    box((0, 0, 0), (0.25, 0.25, 0.8), M["Repair"], K)
    box((0, 0, 0), (0.8, 0.25, 0.25), M["Repair"], K)
    cyl((0, 0, 0), 0.55, 0.12, M["Frame"], K, rot=(math.pi / 2, 0, 0), verts=16)
    K = kit("P_Ammo")
    box((0, 0, 0), (0.7, 0.5, 0.45), M["Frame"], K, bevel=0.04)
    box((0, 0, 0.26), (0.6, 0.4, 0.08), M["Ammo"], K)

build_mech()
build_rifle(); build_gatling(); build_coil(); build_rail(); build_blade(); build_shotgun()
build_missile(); build_cannon(); build_laser(); build_shield()
build_turret(); build_drone(); build_walker(); build_gunship(); build_bulwark(); build_relay(); build_reactor()
build_props()

# a display-only mech in the lineup with weapons mounted, so the preview shows the full loadout
def mounted_demo():
    from mathutils import Matrix
    D = kit("Demo")
    src = bpy.data.objects["Kit_Mech"]
    def dup(o, parent):
        c = o.copy()
        if c.data: c.data = o.data
        link(c); c.name = "Demo_" + o.name.split(".")[0]
        c.parent = parent
        for ch in o.children: dup(ch, c)
        return c
    root = dup(src, D); root.location = (0, 0, 0)
    for mount, weap in (("W_HandR", "Kit_W_Gatling"), ("W_HandL", "Kit_W_Rifle"), ("W_BackR", "Kit_S_Missile"), ("W_BackL", "Kit_S_Cannon")):
        m = [o for o in root.children_recursive if o.name == "Demo_" + mount][0]
        dup(bpy.data.objects[weap], m).location = (0, 0, 0)
    return D

DEMO = mounted_demo() if "--no-render" not in argv or "--closeups" in argv else None

# ---------------------------------------------------------------- preview render (kit lineup)
target = None
if "--no-render" not in argv:
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 46.0
    cam = link(bpy.data.objects.new("Cam", cam_data))
    cols = 6; rows = (len(KIT) + 5) // 6
    cx, cy = (cols - 1) * 4.0, (rows - 1) * 4.5
    cam.location = (cx + 30, cy - 40, 30)
    target = link(bpy.data.objects.new("CamTarget", None))
    target.location = (cx, cy, 1.5)
    tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"
    scene.camera = cam
    sun_data = bpy.data.lights.new("Sun", "SUN"); sun_data.energy = 3.0
    sun = link(bpy.data.objects.new("Sun", sun_data))
    sun.rotation_euler = (math.radians(50), math.radians(-15), math.radians(35))
    world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
    bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.55, 0.6, 0.66, 1); bg.inputs[1].default_value = 0.8
    scene.render.resolution_x, scene.render.resolution_y = 1800, 1100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(OUT, "preview.png")
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    try:
        bpy.ops.render.render(write_still=True)
        print("preview written:", scene.render.filepath)
    except Exception as e:
        print("render failed:", e)

if "--closeups" in argv:
    from mathutils import Vector
    cdir = os.path.join(OUT, "closeups"); os.makedirs(cdir, exist_ok=True)
    cam_data = bpy.data.cameras.new("CCam"); cam_data.type = "ORTHO"
    ccam = link(bpy.data.objects.new("CCam", cam_data)); scene.camera = ccam
    if not any(o.type == "LIGHT" for o in bpy.data.objects):
        sd = bpy.data.lights.new("CSun", "SUN"); sd.energy = 3.0
        cs = link(bpy.data.objects.new("CSun", sd)); cs.rotation_euler = (math.radians(50), math.radians(-15), math.radians(35))
    if scene.world is None:
        w = bpy.data.worlds.new("CW"); scene.world = w; w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"; scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = scene.render.resolution_y = 520
    views = {"": Vector((1.0, 1.4, 0.8)), "_back": Vector((-0.8, -1.4, 0.6))}
    for K in KIT:
        pts = [o.matrix_world @ Vector(c) for o in K.children_recursive if o.type == "MESH" for c in o.bound_box]
        if not pts: continue
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        c = (lo + hi) / 2; ext = max((hi - lo).length, 0.5)
        for o in KIT:
            for ch in [o] + list(o.children_recursive):
                ch.hide_render = o is not K
        for suffix, dv in views.items():
            if suffix and K.name not in ("Kit_Demo", "Kit_Mech"): continue
            d = dv.normalized()
            ccam.location = c + d * ext * 3
            ccam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
            cam_data.ortho_scale = ext * 0.95
            scene.render.filepath = os.path.join(cdir, K.name[4:] + suffix + ".png")
            bpy.ops.render.render(write_still=True)
    for o in bpy.data.objects: o.hide_render = False

# ---------------------------------------------------------------- export GLB (Demo is preview-only)
demo_objs = set([DEMO] + list(DEMO.children_recursive)) if DEMO else set()
bpy.ops.object.select_all(action="DESELECT")
for o in bpy.data.objects:
    if o.type in ("MESH", "EMPTY") and o is not target and o not in demo_objs:
        o.select_set(True)
glb = os.path.join(OUT, "site", "assets", "kit.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                          export_materials="EXPORT", export_animations=False, export_normals=True,
                          export_lights=False, export_cameras=False)
meshes = sum(1 for o in bpy.data.objects if o.type == "MESH" and o not in demo_objs)
print(f"exported {glb}: {len(KIT)} kit items, {meshes} meshes, {os.path.getsize(glb)/1e6:.2f} MB")
