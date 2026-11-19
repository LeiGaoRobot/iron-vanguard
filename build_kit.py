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
    Jam=mat("Jam", "#d8a8ff", 0.2, emit="#b060ff", strength=7.0), EmpGlow=mat("EmpGlow", "#c8f0ff", 0.2, emit="#78c8ff", strength=6.0),
    DomeEmit=mat("DomeEmit", "#ffd8a0", 0.2, emit="#ffa030", strength=6.0), Grav=mat("Grav", "#c8b8ff", 0.2, emit="#8a6cff", strength=7.0),
    Magma=mat("Magma", "#ffb070", 0.2, emit="#ff5010", strength=7.0), Ice=mat("Ice", "#d8f6ff", 0.15, emit="#7ad8ff", strength=5.0),
    BArmor=mat("BArmor", "#5a4436", 0.65, metal=0.3), BArmor2=mat("BArmor2", "#2c2420", 0.6, metal=0.4),
    MendEmit=mat("MendEmit", "#a8ffc8", 0.2, emit="#3dff8a", strength=6.0), MArmor=mat("MArmor", "#d8dcd6", 0.45, metal=0.2),
    SArmor=mat("SArmor", "#3a3d48", 0.45, metal=0.45), SArmor2=mat("SArmor2", "#22242b", 0.5, metal=0.5),
    TArmor=mat("TArmor", "#6e5f4a", 0.6, metal=0.35), TArmor2=mat("TArmor2", "#2f2d2a", 0.55, metal=0.5),
    Orbit=mat("Orbit", "#e8fbff", 0.2, emit="#9fe8ff", strength=7.0),
    DiscEdge=mat("DiscEdge", "#ffd0f4", 0.2, emit="#ff4ad8", strength=7.0),
    Tether=mat("Tether", "#c8fff0", 0.2, emit="#30ffc8", strength=6.5),
    Blink=mat("Blink", "#c8dcff", 0.25, emit="#6a8cff", strength=2.2),
    EelGlow=mat("EelGlow", "#9ad8ec", 0.2, emit="#30c8ff", strength=2.2),
    EelSkin=mat("EelSkin", "#1c2a34", 0.45, metal=0.5),
    SplitGlow=mat("SplitGlow", "#ffb0f0", 0.2, emit="#ff40d0", strength=1.8),
    LevGlow=mat("LevGlow", "#ffc080", 0.3, emit="#ff7a20", strength=2.0),
    LevSkin=mat("LevSkin", "#8a6c4c", 0.75),
    LevPlate=mat("LevPlate", "#54443a", 0.55, metal=0.3),
    SmokeTube=mat("SmokeTube", "#6a7078", 0.5, metal=0.4),
    Sonar=mat("Sonar", "#c8fff8", 0.25, emit="#40f0e0", strength=1.8),
    Bark=mat("Bark", "#4a3a2c", 0.95),
    Leaf=mat("Leaf", "#3c6e2c", 0.8),
    Leaf2=mat("Leaf2", "#2c5624", 0.85),
    Vine=mat("Vine", "#4a6a2a", 0.9),
    Moss=mat("Moss", "#4e6a34", 0.95),
    Mirror=mat("Mirror", "#bff0ff", 0.08, metal=0.85, emit="#2a8aa8", strength=0.6),
    PrismGlow=mat("PrismGlow", "#e0fbff", 0.2, emit="#60e8ff", strength=2.0),
    SonicGlow=mat("SonicGlow", "#ffe8c0", 0.3, emit="#ffb040", strength=1.6),
    Fence=mat("Fence", "#ffd0c8", 0.3, emit="#ff3020", strength=2.2),
    Stasis=mat("Stasis", "#e0f0ff", 0.25, emit="#80c8ff", strength=1.8),
    TankPaint=mat("TankPaint", "#8a8e78", 0.6, metal=0.3),
    Rust=mat("Rust", "#6a4a32", 0.9),
    Toxic=mat("Toxic", "#c8f060", 0.4, emit="#90d020", strength=0.9),
    HiveGlow=mat("HiveGlow", "#ffe0a0", 0.3, emit="#ffa020", strength=2.2),
    Pylon=mat("Pylon", "#5a6470", 0.5, metal=0.6),
    Insul=mat("Insul", "#c8d0d8", 0.35),
    BlinkGlow=mat("BlinkGlow", "#f0c8ff", 0.3, emit="#c050ff", strength=2.2),
    Turbine=mat("Turbine", "#e6e8ea", 0.45),
    Hay=mat("Hay", "#c8a050", 0.95),
    Lamp=mat("Lamp", "#fff6d8", 0.2, emit="#fff0c0", strength=3.0),
    Flare=mat("Flare", "#ffd0a0", 0.3, emit="#ff9040", strength=1.6),
    FrostGlow=mat("FrostGlow", "#c8f2ff", 0.2, emit="#58c8ff", strength=2.4),
    Rime=mat("Rime", "#c6d6e2", 0.5, metal=0.1),
    Envelope=mat("Envelope", "#8a8f80", 0.75, metal=0.05),
    Envelope2=mat("Envelope2", "#6e7364", 0.75, metal=0.05),
    HoloGlow=mat("HoloGlow", "#e0c8ff", 0.2, emit="#b070ff", strength=2.2),
    StickyGlow=mat("StickyGlow", "#ffb0a0", 0.3, emit="#ff4030", strength=2.0),
    MagGlow=mat("MagGlow", "#c8e6ff", 0.2, emit="#4aa8ff", strength=2.2),
    RamGlow=mat("RamGlow", "#ffd0a0", 0.3, emit="#ff6a20", strength=2.4),
    RicoGlow=mat("RicoGlow", "#d8fff0", 0.2, emit="#40ffc0", strength=2.0),
    NeedleGlow=mat("NeedleGlow", "#ffd0f4", 0.2, emit="#ff50d8", strength=2.2),
    HeraldGlow=mat("HeraldGlow", "#ffd0c0", 0.3, emit="#ff3020", strength=2.2),
    RodGlow=mat("RodGlow", "#e0f6ff", 0.2, emit="#80d8ff", strength=2.4),
    AcidGlow=mat("AcidGlow", "#e0ffc0", 0.25, emit="#90ff30", strength=2.2),
    RiftGlow=mat("RiftGlow", "#f0e0ff", 0.2, emit="#b070ff", strength=2.4),
    MeltGlow=mat("MeltGlow", "#fff0d8", 0.2, emit="#ff8a20", strength=2.4),
    FuelPaint=mat("FuelPaint", "#d8d4c8", 0.6, metal=0.3),
    PlantGlow=mat("PlantGlow", "#ff8070", 0.2, emit="#ff2a10", strength=2.6),
    SalvGlow=mat("SalvGlow", "#d8fff0", 0.2, emit="#30ffb0", strength=2.6),
    ScavPaint=mat("ScavPaint", "#b08a3a", 0.55, metal=0.35),
    HackGlow=mat("HackGlow", "#ffe0ff", 0.2, emit="#ff30d0", strength=2.4),
    PadGlow=mat("PadGlow", "#e8f8ff", 0.2, emit="#40c8ff", strength=2.0),
    ReflGlow=mat("ReflGlow", "#f0fbff", 0.2, emit="#80f0ff", strength=2.2),
    HijackPaint=mat("HijackPaint", "#3a2f48", 0.5, metal=0.4),
    ShadeGlow=mat("ShadeGlow", "#ece0ff", 0.2, emit="#9a60ff", strength=2.2),
    RepairGlow=mat("RepairGlow", "#e4ffe8", 0.2, emit="#40ff70", strength=2.2),
    AllyPaint=mat("AllyPaint", "#4a6a8e", 0.5, metal=0.3),
    CitadelPaint=mat("CitadelPaint", "#4a3a34", 0.65, metal=0.3),
    TowerGlow=mat("TowerGlow", "#ffe4d8", 0.2, emit="#ff4a20", strength=2.4),
    GateGlow=mat("GateGlow", "#e0fbff", 0.2, emit="#30e0ff", strength=2.4),
    EngPaint=mat("EngPaint", "#b8861e", 0.55, metal=0.35),
    BurnerGlow=mat("BurnerGlow", "#fff0d8", 0.2, emit="#ff8a28", strength=2.2),
    FogLampGlow=mat("FogLampGlow", "#fff6e0", 0.2, emit="#ffe0a0", strength=2.6),
    LurkEye=mat("LurkEye", "#ff7060", 0.2, emit="#ff3020", strength=2.5),
    LurkCore=mat("LurkCore", "#2a2c30", 0.5, metal=0.5),
    RewindGlow=mat("RewindGlow", "#e0fff8", 0.2, emit="#40ffd0", strength=2.2),
    CrateGlow=mat("CrateGlow", "#fff4d0", 0.2, emit="#ffc040", strength=2.4),
    Chute=mat("Chute", "#e8e0d0", 0.9),
    ChuteRed=mat("ChuteRed", "#c8402c", 0.9),
    CrateWood=mat("CrateWood", "#6e7a4a", 0.8),
    SnatchGlow=mat("SnatchGlow", "#fff0d8", 0.2, emit="#ff9a30", strength=2.2),
    PoundGlow=mat("PoundGlow", "#e0f0ff", 0.2, emit="#60c0ff", strength=2.2),
    DisarmGlow=mat("DisarmGlow", "#f4e0ff", 0.2, emit="#c050ff", strength=2.2),
    SiphonGlow=mat("SiphonGlow", "#ffe0e4", 0.2, emit="#ff3050", strength=2.2),
    RiftStone=mat("RiftStone", "#3a3446", 0.8),
    Headlight=mat("Headlight", "#fff8e0", 0.2, emit="#fff0c0", strength=3.0),
    TruckRed=mat("TruckRed", "#a8322a", 0.5),
    Trailer=mat("Trailer", "#9aa0a6", 0.55, metal=0.4),
    Rust2=mat("Rust2", "#5a3a26", 0.9, metal=0.2),
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

def build_grenade():
    K = kit("W_Grenade")
    # stubby launcher: boxy receiver, revolver drum under it, one fat short barrel
    box((0, 0.15, 0.05), (0.44, 0.85, 0.42), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.3), (0.36, 0.55, 0.1), M["Armor"], K, bevel=0.02)
    cyl((0, 0.25, -0.24), 0.3, 0.5, M["Armor2"], K, rot=ALONG_Y, verts=12)
    for i in range(6):
        a = i * math.pi / 3
        cyl((math.cos(a) * 0.18, 0.25, -0.24 + math.sin(a) * 0.18), 0.07, 0.52, M["Black"], K, rot=ALONG_Y, verts=8)
    cyl((0, 0.95, 0.06), 0.17, 0.95, M["Joint"], K, rot=ALONG_Y, verts=12)
    cyl((0, 1.42, 0.06), 0.2, 0.12, M["Frame"], K, rot=ALONG_Y, verts=12)
    box((0.24, 0.3, 0.05), (0.04, 0.5, 0.2), M["Hazard"], K)
    box((0, 0.6, 0.31), (0.12, 0.22, 0.06), M["Visor"], K)
    muzzle("Muzzle_Grenade", (0, 1.5, 0.06), K)

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

def mini_drone(K):
    # small player attack drone (also docked on the shoulder pod). front = +Y
    ball((0, 0, 0), 0.34, M["Armor"], K, scale=(1, 1.15, 0.55))
    box((0, 0, 0.15), (0.12, 0.55, 0.05), M["Accent"], K)
    box((0, 0.36, 0.0), (0.2, 0.06, 0.07), M["Visor"], K)
    for i, (x, y) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        box((x * 0.26, y * 0.26, 0.02), (0.38, 0.07, 0.05), M["Armor2"], K, rot=(0, 0, math.atan2(y, x)))
        cyl((x * 0.44, y * 0.44, 0.04), 0.17, 0.05, M["Armor2"], K, verts=10, smooth=False)
    cyl((0, 0.3, -0.16), 0.035, 0.32, M["Frame"], K, rot=ALONG_Y, verts=6)

def build_drones():
    K = kit("S_Drones")
    # shoulder hangar: armored box with a docked mini drone on top
    box((0, 0.0, 0.3), (0.72, 1.0, 0.46), M["Armor2"], K, bevel=0.05)
    box((0, 0.0, 0.55), (0.62, 0.9, 0.04), M["Frame"], K)
    for sx in (-1, 1):
        box((sx * 0.33, 0, 0.62), (0.05, 0.9, 0.12), M["Accent"], K)
    box((0, 0.51, 0.3), (0.5, 0.03, 0.2), M["Hazard"], K)
    dock = empty("D_Dock", (0, 0.05, 0.78), K)
    mini_drone(dock)
    muzzle("Muzzle_Drones", (0, 0.1, 0.9), K)

def build_mini():
    K = kit("D_Mini")
    mini_drone(K)
    for i, (x, y) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        r = empty(f"D_Rotor{i + 1}", (x * 0.44, y * 0.44, 0.08), K)
        box((0, 0, 0), (0.3, 0.04, 0.015), M["Black"], r)
    muzzle("Muzzle_Mini", (0, 0.48, -0.16), K)

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

def build_mender():
    # Mender: field repair drone. Light hull, three rotors, green repair emitter under the nose. front = +Y
    K = kit("E_Mender")
    ball((0, 0, 0), 0.62, M["MArmor"], K, scale=(1, 1.2, 0.6))
    box((0, 0, 0.3), (0.5, 0.7, 0.12), M["EArmor2"], K, bevel=0.03)
    box((0, 0.1, 0.38), (0.12, 0.42, 0.04), M["MendEmit"], K)
    box((0, 0.1, 0.38), (0.42, 0.12, 0.04), M["MendEmit"], K)
    box((0, 0.66, 0.0), (0.34, 0.08, 0.12), M["EEye"], K)
    for i in range(3):
        a = math.pi / 2 + i * 2 * math.pi / 3 + math.pi / 3
        x, y = math.cos(a), math.sin(a)
        box((x * 0.55, y * 0.55, 0.05), (0.75, 0.12, 0.08), M["Frame"], K, rot=(0, 0, a))
        cyl((x * 0.95, y * 0.95, 0.05), 0.34, 0.1, M["EArmor2"], K, verts=12, smooth=False)
        r = empty(f"E_MRotor{i + 1}", (x * 0.95, y * 0.95, 0.14), K)
        box((0, 0, 0), (0.62, 0.07, 0.03), M["Black"], r)
    cyl((0, 0.35, -0.38), 0.12, 0.3, M["Frame"], K, verts=10)
    ball((0, 0.35, -0.56), 0.13, M["MendEmit"], K)
    muzzle("Muzzle_Mender", (0, 0.35, -0.62), K)

def build_pile():
    K = kit("W_Pile")
    # pile bunker: heavy forearm housing with recoil pistons; the spike lives under P_Spike so the page can fire it along +Y
    box((0, 0.2, 0), (0.52, 1.05, 0.52), M["Frame"], K, bevel=0.05)
    box((0, 0.12, 0.3), (0.44, 0.8, 0.1), M["Armor2"], K, bevel=0.02)
    for s_ in (-1, 1):
        box((s_ * 0.28, 0.3, 0), (0.06, 0.75, 0.3), M["Hazard"], K)
        cyl((s_ * 0.17, 0.5, -0.24), 0.07, 0.75, M["Piston"], K, rot=ALONG_Y, verts=8)
    cyl((0, 0.82, 0), 0.25, 0.3, M["Joint"], K, rot=ALONG_Y, verts=12)
    cyl((0, 0.98, 0), 0.19, 0.08, M["Accent"], K, rot=ALONG_Y, verts=12)
    sp = empty("P_Spike", (0, 0.7, 0), K)
    cyl((0, 0.45, 0), 0.11, 0.9, M["Piston"], sp, rot=ALONG_Y, verts=10)
    cyl((0, 1.02, 0), 0.11, 0.26, M["Piston"], sp, rot=ALONG_Y, verts=10, r2=0.015)
    muzzle("Muzzle_Pile", (0, 1.3, 0), K)

def build_flamer():
    K = kit("W_Flamer")
    # flamethrower: fuel tank slung under a stubby receiver, long ribbed nozzle with a pilot light
    box((0, 0.15, 0.04), (0.42, 0.85, 0.42), M["Frame"], K, bevel=0.05)
    box((0, 0.1, 0.28), (0.34, 0.6, 0.1), M["Armor"], K, bevel=0.02)
    cyl((0, 0.15, -0.32), 0.22, 0.85, M["Barrel"], K, rot=ALONG_Y, verts=12)
    for y in (-0.15, 0.45):
        cyl((0, y, -0.32), 0.235, 0.06, M["Hazard"], K, rot=ALONG_Y, verts=12)
    cyl((0, 0.95, 0.04), 0.12, 0.8, M["Joint"], K, rot=ALONG_Y, verts=10)
    for i in range(4):
        torus((0, 0.7 + i * 0.16, 0.04), 0.13, 0.03, M["Frame"], K, rot=(math.pi / 2, 0, 0))
    cyl((0, 1.38, 0.04), 0.17, 0.12, M["Frame"], K, rot=ALONG_Y, verts=10, r2=0.13)
    ball((0, 1.36, 0.2), 0.05, M["Plasma"], K)
    box((0.23, 0.3, 0.04), (0.04, 0.5, 0.2), M["Accent"], K)
    muzzle("Muzzle_Flamer", (0, 1.46, 0.04), K)

def build_sapper():
    # Sapper: twin-rotor mine-laying drone, ~3 m long, mine rack underneath. front = +Y
    K = kit("E_Sapper")
    box((0, 0, 0), (1.1, 2.2, 0.7), M["EArmor"], K, bevel=0.1)
    wedge((0, 1.2, 0.0), (0.9, 0.5, 0.6), M["EArmor2"], K, taper=0.5, bevel=0.05)
    box((0, 1.38, 0.08), (0.5, 0.06, 0.14), M["EEye"], K)
    box((0, -0.3, -0.5), (0.9, 1.2, 0.3), M["Frame"], K, bevel=0.03)
    for i in range(3):
        cyl((0, -0.75 + i * 0.45, -0.68), 0.26, 0.1, M["EArmor2"], K, verts=12, smooth=False)
        cyl((0, -0.75 + i * 0.45, -0.62), 0.05, 0.04, M["EEye"], K, verts=8)
    box((0, -0.3, -0.36), (0.6, 0.05, 0.05), M["Hazard"], K)
    for s_ in (-1, 1):
        box((s_ * 1.0, 0, 0.15), (1.0, 0.25, 0.14), M["Frame"], K)
        cyl((s_ * 1.6, 0, 0.15), 0.62, 0.14, M["EArmor2"], K, verts=16, smooth=False)
        r = empty(f"E_BRotor{1 if s_ < 0 else 2}", (s_ * 1.6, 0, 0.26), K)
        box((0, 0, 0), (1.1, 0.1, 0.03), M["Black"], r)
        box((0, 0, 0), (0.1, 1.1, 0.03), M["Black"], r)
    box((0, -1.25, 0.25), (0.08, 0.4, 0.5), M["EArmor2"], K)

def build_mine():
    K = kit("E_Mine")
    cyl((0, 0, 0.12), 0.75, 0.24, M["EArmor2"], K, verts=16, smooth=False)
    cyl((0, 0, 0.27), 0.5, 0.08, M["Frame"], K, verts=16, smooth=False)
    for i in range(4):
        a = i * math.pi / 2
        box((math.cos(a) * 0.62, math.sin(a) * 0.62, 0.24), (0.18, 0.18, 0.06), M["Hazard"], K, rot=(0, 0, a))
    lt = empty("E_MineLight", (0, 0, 0.36), K)
    ball((0, 0, 0), 0.13, M["EEye"], lt)

def build_jammer():
    # Jammer: hovering ECM platform. Octagonal hull, mast with a spinning dish, purple emitter rings. front = +Y
    K = kit("E_Jammer")
    cyl((0, 0, 0), 1.25, 0.8, M["EArmor"], K, verts=8, smooth=False)
    cyl((0, 0, 0.45), 1.0, 0.12, M["EArmor2"], K, verts=8, smooth=False)
    cyl((0, 0, -0.5), 0.85, 0.25, M["Frame"], K, verts=8, smooth=False)
    cyl((0, 0, -0.66), 0.55, 0.08, M["NozzleGlow"], K, verts=12)
    box((0, 1.15, 0.05), (0.55, 0.12, 0.14), M["EEye"], K)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        box((math.cos(a) * 1.25, math.sin(a) * 1.25, -0.1), (0.5, 0.22, 0.5), M["EArmor2"], K, rot=(0, 0, a), bevel=0.03)
        box((math.cos(a) * 1.5, math.sin(a) * 1.5, -0.1), (0.06, 0.3, 0.36), M["Jam"], K, rot=(0, 0, a))
    cyl((0, 0, 1.2), 0.12, 1.5, M["Frame"], K, verts=8)
    core = empty("E_JCore", (0, 0, 0.62), K)
    cyl((0, 0, 0), 0.5, 0.14, M["Jam"], core, verts=16)
    torus((0, 0, 1.25), 0.42, 0.05, M["Jam"], K)
    dish = empty("E_JDish", (0, 0, 2.0), K)
    cyl((0, 0.1, 0.3), 0.75, 0.12, M["EArmor2"], dish, rot=(-math.pi / 2 + 0.35, 0, 0), verts=16, r2=0.5, smooth=False)
    cyl((0, 0.18, 0.32), 0.08, 0.5, M["Frame"], dish, rot=(-math.pi / 2 + 0.35, 0, 0), verts=6)
    ball((0, 0.42, 0.42), 0.1, M["Jam"], dish)
    box((0, -0.25, 0.1), (0.2, 0.5, 0.14), M["Frame"], dish)
    for s_ in (-1, 1):
        cyl((s_ * 0.5, -0.5, 1.6), 0.03, 0.9, M["Frame"], K, verts=6)
        ball((s_ * 0.5, -0.5, 2.08), 0.06, M["Jam"], K)

def build_emp():
    K = kit("S_Emp")
    # shoulder EMP pod: armored drum with three capacitor coils and a glowing emitter cap
    box((0, 0.0, 0.3), (0.66, 0.9, 0.48), M["Armor2"], K, bevel=0.05)
    cyl((0, 0.0, 0.62), 0.3, 0.2, M["Frame"], K, verts=16)
    cyl((0, 0.0, 0.76), 0.24, 0.08, M["EmpGlow"], K, verts=16)
    for i in range(3):
        y = -0.3 + i * 0.3
        cyl((0.36, y, 0.32), 0.1, 0.36, M["Frame"], K, rot=(0, math.pi / 2, 0), verts=10)
        torus((0.44, y, 0.32), 0.1, 0.025, M["EmpGlow"], K, rot=(0, math.pi / 2, 0))
    box((-0.34, 0, 0.32), (0.05, 0.8, 0.3), M["Accent"], K)
    box((0, 0.46, 0.32), (0.5, 0.03, 0.2), M["Hazard"], K)
    muzzle("Muzzle_Emp", (0, 0.0, 0.86), K)

def build_howitzer():
    # Howitzer: tracked self-propelled gun, ~7 m long. Turret E_HTurret (yaw about Z), barrel E_HBarrel (pitch about X). front = +Y
    K = kit("E_Howitzer")
    box((0, 0, 0.95), (3.0, 5.6, 0.9), M["EArmor"], K, bevel=0.1)
    wedge((0, 2.6, 0.95), (2.8, 0.8, 0.8), M["EArmor2"], K, taper=0.55, bevel=0.06)
    box((0, -2.5, 1.35), (2.4, 0.8, 0.5), M["EArmor2"], K, bevel=0.05)
    for s_ in (-1, 1):
        box((s_ * 1.75, 0, 0.55), (0.75, 5.9, 1.05), M["Black"], K, bevel=0.18)
        for i in range(6):
            cyl((s_ * 1.75, -2.4 + i * 0.96, 0.5), 0.38, 0.8, M["Frame"], K, rot=(0, math.pi / 2, 0), verts=12)
        box((s_ * 1.75, 0, 1.12), (0.82, 5.4, 0.1), M["EArmor2"], K)
        # stabiliser spades at the rear
        box((s_ * 1.0, -3.2, 0.45), (0.5, 0.9, 0.12), M["Frame"], K, rot=(0.5, 0, 0))
        box((s_ * 1.0, -3.65, 0.12), (0.7, 0.12, 0.45), M["Hazard"], K)
    box((0, 1.6, 1.42), (1.8, 0.7, 0.06), M["Hazard"], K)
    tur = empty("E_HTurret", (0, -0.4, 1.4), K)
    box((0, 0, 0.55), (2.4, 2.8, 1.1), M["EArmor2"], tur, bevel=0.08)
    wedge((0, 1.45, 0.55), (2.2, 0.4, 0.9), M["EArmor"], tur, taper=0.7, bevel=0.04)
    box((0.85, -0.6, 1.2), (0.5, 0.9, 0.3), M["EArmor"], tur, bevel=0.04)
    ball((-0.7, 0.9, 1.15), 0.14, M["EEye"], tur)
    cyl((-0.7, -0.9, 1.6), 0.04, 1.1, M["Frame"], tur)
    brl = empty("E_HBarrel", (0, 1.3, 0.75), tur)
    box((0, 0.2, 0), (0.9, 0.9, 0.8), M["EArmor"], brl, bevel=0.05)
    cyl((0, 2.6, 0), 0.24, 4.6, M["Frame"], brl, rot=(-math.pi / 2, 0, 0), verts=14)
    cyl((0, 1.3, 0), 0.34, 1.4, M["EArmor2"], brl, rot=(-math.pi / 2, 0, 0), verts=14)
    cyl((0, 5.0, 0), 0.36, 0.6, M["EArmor2"], brl, rot=(-math.pi / 2, 0, 0), verts=12, smooth=False)
    for s_ in (-1, 1):
        box((s_ * 0.38, 5.0, 0), (0.12, 0.5, 0.28), M["Black"], brl)
    muzzle("Muzzle_Howitzer", (0, 5.4, 0), brl)

def build_warden():
    # Warden: tripod dome projector, ~5 m tall. Spinning emitter ring E_WdRing, pulsing core E_WdCore. front = +Y
    K = kit("E_Warden")
    for i in range(3):
        a = i * 2 * math.pi / 3 + math.pi / 2
        x, y = math.cos(a), math.sin(a)
        box((x * 1.95, y * 1.95, 0.95), (0.36, 0.36, 1.3), M["Frame"], K, rot=(0, 0, a), bevel=0.04)
        box((x * 1.55, y * 1.55, 1.62), (0.95, 0.32, 0.32), M["EArmor2"], K, rot=(0, 0, a), bevel=0.04)
        box((x * 2.0, y * 2.0, 0.18), (0.9, 0.9, 0.36), M["EArmor2"], K, rot=(0, 0, a), bevel=0.06)
        cyl((x * 2.0, y * 2.0, 0.02), 0.32, 0.06, M["NozzleGlow"], K, verts=12)
    cyl((0, 0, 1.9), 1.35, 0.9, M["EArmor"], K, verts=6, smooth=False)
    cyl((0, 0, 2.42), 1.1, 0.16, M["EArmor2"], K, verts=6, smooth=False)
    cyl((0, 0, 1.4), 0.9, 0.2, M["Frame"], K, verts=6, smooth=False)
    box((0, 1.2, 1.95), (0.7, 0.14, 0.18), M["EEye"], K)
    box((0, 1.17, 1.65), (1.1, 0.12, 0.1), M["Hazard"], K)
    cyl((0, 0, 3.4), 0.22, 2.0, M["Frame"], K, verts=8)
    core = empty("E_WdCore", (0, 0, 3.0), K)
    ball((0, 0, 0), 0.55, M["DomeEmit"], core)
    for s_ in (-1, 1):
        cyl((0, 0, s_ * 0.45), 0.62, 0.1, M["EArmor2"], core, verts=12)
    ring = empty("E_WdRing", (0, 0, 4.1), K)
    torus((0, 0, 0), 1.0, 0.07, M["DomeEmit"], ring)
    for i in range(4):
        a = i * math.pi / 2
        box((math.cos(a) * 1.0, math.sin(a) * 1.0, 0), (0.34, 0.34, 0.34), M["EArmor"], ring, rot=(0, 0, a), bevel=0.04)
    cyl((0, 0, 4.55), 0.32, 0.4, M["EArmor"], K, verts=8, r2=0.12)
    ball((0, 0, 4.85), 0.16, M["DomeEmit"], K)

def build_burrower():
    # Burrower: armoured drill-worm that surfaces from the ground. Body segments stacked on +Z, drill head E_BDrill on top,
    # three mandible plates E_BJaw1-3 hinge open around it. front = +Y
    K = kit("E_Burrower")
    body = empty("E_BBody", (0, 0, 0), K)
    for i in range(5):
        z = 0.3 + i * 0.78; r = 1.35 - i * 0.1
        cyl((0, 0, z), r, 0.62, M["BArmor"], body, verts=10, smooth=False)
        cyl((0, 0, z + 0.36), r * 0.86, 0.14, M["Magma"], body, verts=10)
        for k in range(5):
            a = k * 2 * math.pi / 5 + i * 0.6
            box((math.cos(a) * r * 0.98, math.sin(a) * r * 0.98, z), (0.34, 0.5, 0.5), M["BArmor2"], body, rot=(0, 0, a), bevel=0.05)
    box((0, 1.05, 3.0), (0.7, 0.16, 0.2), M["EEye"], body)
    head = empty("E_BHead", (0, 0, 4.15), body)
    cyl((0, 0, 0.0), 1.0, 0.4, M["BArmor2"], head, verts=10, smooth=False)
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        j = empty("E_BJaw%d" % (k + 1), (math.cos(a) * 0.85, math.sin(a) * 0.85, 0.15), head, rot=(0, 0, a))
        wedge((0.15, 0, 0.75), (0.32, 0.9, 1.5), M["BArmor"], j, taper=0.25, bevel=0.04)
        box((0.32, 0, 0.6), (0.06, 0.5, 0.9), M["Magma"], j)
    drill = empty("E_BDrill", (0, 0, 0.2), head)
    cyl((0, 0, 0.9), 0.78, 1.8, M["Joint"], drill, verts=12, r2=0.05)
    for k in range(4):
        a = k * math.pi / 2
        for t in range(4):
            z = 0.35 + t * 0.38; rr = 0.72 - t * 0.17
            box((math.cos(a + t * 0.5) * rr, math.sin(a + t * 0.5) * rr, z), (0.16, 0.36, 0.12), M["Piston"], drill, rot=(0, 0, a + t * 0.5 + 0.5))
    ball((0, 0, 1.85), 0.12, M["Magma"], drill)

def bogie(y, parent):
    # two-axle bogie under a rail car: frame + four wheels (rails are 1.5 m apart)
    box((0, y, 0.55), (1.9, 2.4, 0.35), M["Frame"], parent, bevel=0.04)
    for wy in (-0.75, 0.75):
        for sx in (-0.78, 0.78):
            cyl((sx, y + wy, 0.48), 0.46, 0.18, M["Black"], parent, rot=(0, math.pi / 2, 0), verts=12)
            cyl((sx * 1.06, y + wy, 0.48), 0.16, 0.06, M["Joint"], parent, rot=(0, math.pi / 2, 0), verts=8)

def car_base(K, L=11.0):
    # common rail-car chassis: deck, side skirts, couplers, bogies. front = +Y, deck top at z 1.5
    box((0, 0, 1.2), (3.6, L, 0.6), M["TArmor2"], K, bevel=0.06)
    for sx in (-1, 1):
        box((sx * 1.86, 0, 1.05), (0.12, L - 1.6, 0.7), M["TArmor"], K)
        box((sx * 1.93, 0, 1.26), (0.04, L - 2.2, 0.12), M["Hazard"], K)
    for sy in (-1, 1):
        box((0, sy * (L / 2 + 0.25), 1.05), (0.5, 0.6, 0.35), M["Joint"], K)
        bogie(sy * (L / 2 - 2.1), K)

def build_train():
    # Armoured train: locomotive + three weapon cars. Each car is its own kit; JS lays them along the track.
    # Locomotive: wedge nose, cab, engine block, reactor core E_TLCore on the roof (weak point once the cars are gone)
    K = kit("E_TrainLoco")
    car_base(K, 12.0)
    box((0, -1.0, 3.1), (3.4, 8.6, 3.2), M["TArmor"], K, bevel=0.15)
    wedge((0, 4.6, 2.6), (3.4, 2.6, 2.2), M["TArmor2"], K, taper=0.35, bevel=0.1)
    box((0, 5.95, 1.55), (3.0, 0.5, 0.9), M["Hazard"], K, rot=(0.5, 0, 0))   # cow-catcher
    box((0, 2.2, 4.95), (3.0, 2.4, 1.1), M["TArmor2"], K, bevel=0.1)          # cab
    box((0, 3.42, 5.0), (2.4, 0.06, 0.5), M["EEye"], K)
    for sx in (-1, 1):
        ball((sx * 1.1, 5.6, 2.75), 0.32, M["EEye"], K)
        box((sx * 1.74, -1.6, 3.4), (0.06, 6.0, 1.6), M["Frame"], K)
        for j in range(6):
            box((sx * 1.78, -4.0 + j * 1.0, 3.4), (0.06, 0.3, 1.3), M["Black"], K)
    for i in range(3):
        cyl((0, -4.2 + i * 1.3, 4.9), 0.42, 0.9, M["Nozzle"], K, verts=10)
        cyl((0, -4.2 + i * 1.3, 5.38), 0.3, 0.06, M["NozzleGlow"], K, verts=10)
    core = empty("E_TLCore", (0, -0.6, 5.5), K)
    ball((0, 0, 0), 1.0, M["Plasma"], core, sub=2)
    torus((0, 0, 0), 1.25, 0.14, M["Frame"], core)
    torus((0, 0, 0), 1.25, 0.14, M["Frame"], core, rot=(math.pi / 2, 0, 0))
    empty("Muzzle_TLoco", (0, -0.6, 6.7), K)

    # Gun car: armoured flatbed with a twin-cannon turret E_TGTurret (yaws about Z)
    K = kit("E_TrainGun")
    car_base(K)
    box((0, 0, 2.2), (3.4, 9.6, 1.4), M["TArmor"], K, bevel=0.12)
    for sy in (-1, 1):
        wedge((0, sy * 4.2, 3.2), (3.2, 1.2, 0.7), M["TArmor2"], K, rot=(0, 0, 0 if sy > 0 else math.pi), taper=0.4)
    cyl((0, 0, 3.05), 1.9, 0.3, M["TArmor2"], K, verts=16)
    tur = empty("E_TGTurret", (0, 0, 3.3), K)
    box((0, -0.2, 0.75), (2.6, 3.0, 1.5), M["TArmor"], tur, bevel=0.15)
    box((0, 1.25, 1.05), (1.8, 0.3, 0.3), M["EEye"], tur)
    for sx in (-0.55, 0.55):
        cyl((sx, 2.8, 0.75), 0.22, 3.4, M["Frame"], tur, rot=ALONG_Y, verts=10)
        cyl((sx, 4.45, 0.75), 0.3, 0.4, M["Joint"], tur, rot=ALONG_Y, verts=10)
    box((0, -1.75, 0.75), (2.2, 0.1, 1.0), M["Hazard"], tur)
    empty("Muzzle_TGun", (0, 4.8, 0.75), tur)

    # Missile car: box wagon with a raised 4x2 launcher E_TMPod pitched up
    K = kit("E_TrainMsl")
    car_base(K)
    box((0, 0, 2.8), (3.4, 9.6, 2.6), M["TArmor"], K, bevel=0.12)
    for j in range(5):
        box((0, -3.8 + j * 1.9, 4.16), (3.5, 0.2, 0.12), M["Frame"], K)
    pod = empty("E_TMPod", (0, 0.6, 4.6), K, rot=(0.5, 0, 0))
    box((0, 0, 0), (2.8, 3.4, 1.4), M["TArmor2"], pod, bevel=0.1)
    for ix in range(4):
        for iz in range(2):
            cyl((-1.05 + ix * 0.7, 1.72, -0.3 + iz * 0.6), 0.24, 0.12, M["Black"], pod, rot=ALONG_Y, verts=8)
            cyl((-1.05 + ix * 0.7, 1.76, -0.3 + iz * 0.6), 0.12, 0.06, M["EEye"], pod, rot=ALONG_Y, verts=8)
    box((1.42, 0, 0), (0.06, 3.0, 1.0), M["Hazard"], pod)
    empty("Muzzle_TMsl", (0, 2.0, 0.2), pod)

    # Carrier car: drone hangar with two roof hatches E_TCHatchL/R that swing open (about Y) when drones launch
    K = kit("E_TrainCarrier")
    car_base(K)
    box((0, 0, 2.9), (3.4, 9.6, 2.8), M["TArmor"], K, bevel=0.12)
    box((0, 0, 4.32), (2.6, 6.4, 0.1), M["Black"], K)
    for sx in (-1, 1):
        h = empty("E_TCHatch" + ("L" if sx < 0 else "R"), (sx * 1.3, 0, 4.36), K)
        box((-sx * 0.65, 0, 0.06), (1.3, 6.2, 0.12), M["TArmor2"], h, bevel=0.03)
        box((-sx * 0.65, 0, 0.13), (0.08, 5.6, 0.04), M["Hazard"], h)
        for j in range(3):
            box((sx * 1.74, -3 + j * 3, 3.0), (0.06, 1.6, 1.6), M["Frame"], K)
            box((sx * 1.76, -3 + j * 3, 3.6), (0.04, 1.2, 0.12), M["EEye"], K)
    for sy in (-1, 1):
        cyl((0, sy * 3.9, 4.6), 0.12, 0.6, M["Frame"], K, verts=6)
        ball((0, sy * 3.9, 4.95), 0.14, M["EEye"], K)
    empty("Muzzle_TCar", (0, 0, 4.6), K)

def build_orbital():
    K = kit("S_Orbital")
    # shoulder orbital-strike uplink: armoured base, tilting dish with a glowing feed horn and a target-designator lens
    box((0, -0.15, 0.2), (0.6, 0.8, 0.3), M["Armor2"], K, bevel=0.05)
    box((0.31, -0.15, 0.26), (0.04, 0.7, 0.2), M["Accent"], K)
    cyl((0, 0.0, 0.42), 0.1, 0.3, M["Frame"], K, verts=8)
    cyl((0, 0.12, 0.72), 0.42, 0.14, M["Armor"], K, rot=(-1.0, 0, 0), verts=20, r2=0.12)
    cyl((0, 0.16, 0.76), 0.3, 0.04, M["Black"], K, rot=(-1.0, 0, 0), verts=20)
    for k in range(3):
        a = k * 2 * math.pi / 3
        box((math.cos(a) * 0.16, 0.25 + math.sin(a) * 0.08, 0.86 + math.sin(a) * 0.1), (0.03, 0.03, 0.4), M["Frame"], K, rot=(-1.0 + math.sin(a) * 0.3, math.cos(a) * 0.3, 0))
    ball((0, 0.32, 1.02), 0.08, M["Orbit"], K)
    box((-0.22, 0.25, 0.25), (0.12, 0.18, 0.12), M["Frame"], K)
    ball((-0.22, 0.35, 0.25), 0.05, M["Orbit"], K)
    box((0, -0.5, 0.2), (0.46, 0.03, 0.18), M["Hazard"], K)
    muzzle("Muzzle_Orbital", (0, 0.32, 1.08), K)

def build_grappler():
    # Grappler: heavy hover craft with a harpoon cannon slung under the nose and a cable winch on its back. front = +Y
    K = kit("E_Grappler")
    box((0, 0, 0), (2.0, 2.6, 0.9), M["EArmor"], K, bevel=0.12)
    box((0, 0.2, 0.55), (1.5, 1.8, 0.3), M["EArmor2"], K, bevel=0.06)
    box((0, 1.35, 0.05), (1.2, 0.3, 0.5), M["EArmor2"], K, bevel=0.05)
    box((0, 1.5, 0.15), (0.7, 0.08, 0.14), M["EEye"], K)
    for s_ in (-1, 1):
        box((s_ * 1.35, -0.2, 0.0), (0.7, 1.6, 0.5), M["EArmor2"], K, bevel=0.06)
        cyl((s_ * 1.45, -0.2, -0.38), 0.42, 0.2, M["Frame"], K, verts=14)
        cyl((s_ * 1.45, -0.2, -0.5), 0.3, 0.06, M["NozzleGlow"], K, verts=14)
        box((s_ * 1.72, 0.3, 0.1), (0.06, 0.8, 0.3), M["Hazard"], K)
    cyl((0, -1.3, -0.25), 0.5, 0.25, M["Frame"], K, verts=14)
    cyl((0, -1.3, -0.4), 0.36, 0.06, M["NozzleGlow"], K, verts=14)
    # winch drum on the back
    w = empty("E_GWinch", (0, -0.6, 0.85), K)
    cyl((0, 0, 0), 0.45, 1.3, M["Frame"], w, rot=(0, math.pi / 2, 0), verts=14)
    for k in range(5):
        cyl((-0.5 + k * 0.25, 0, 0), 0.5, 0.06, M["Tether"], w, rot=(0, math.pi / 2, 0), verts=14)
    # harpoon cannon under the nose
    box((0, 1.2, -0.55), (0.6, 1.2, 0.5), M["Frame"], K, bevel=0.05)
    cyl((0, 2.0, -0.6), 0.22, 1.2, M["Joint"], K, rot=(-math.pi / 2, 0, 0), verts=10)
    cyl((0, 2.62, -0.6), 0.28, 0.12, M["Frame"], K, rot=(-math.pi / 2, 0, 0), verts=10)
    h = empty("E_GHook", (0, 2.7, -0.6), K)
    cyl((0, 0.25, 0), 0.16, 0.5, M["Tether"], h, rot=(-math.pi / 2, 0, 0), verts=8, r2=0.0)
    for k in range(3):
        a = k * 2 * math.pi / 3
        box((math.cos(a) * 0.2, 0.05, math.sin(a) * 0.2), (0.05, 0.35, 0.05), M["Joint"], h, rot=(math.sin(a) * 0.6, 0, -math.cos(a) * 0.6))
    muzzle("Muzzle_Grap", (0, 2.75, -0.6), K)

def build_blink():
    K = kit("S_Blink")
    # shoulder blink drive: slim pod with three stacked phase rings and a glowing core lens
    box((0, -0.1, 0.22), (0.56, 0.9, 0.34), M["Armor2"], K, bevel=0.05)
    box((0.29, -0.1, 0.26), (0.04, 0.8, 0.2), M["Accent"], K)
    cyl((0, 0.05, 0.5), 0.26, 0.26, M["Frame"], K, verts=14)
    for k in range(3):
        torus((0, -0.25 + k * 0.28, 0.5), 0.3, 0.04, M["Blink"], K, rot=(math.pi / 2, 0, 0))
    ball((0, 0.42, 0.5), 0.14, M["Blink"], K)
    box((0, -0.55, 0.22), (0.44, 0.03, 0.18), M["Hazard"], K)
    muzzle("Muzzle_Blink", (0, 0.5, 0.5), K)

def build_jet():
    # Striker: delta-wing attack jet with a chin cannon. front = +Y
    K = kit("E_Jet")
    box((0, 0.2, 0), (0.9, 5.2, 0.8), M["EArmor"], K, bevel=0.15)            # fuselage
    box((0, 2.8, -0.05), (0.6, 1.0, 0.55), M["EArmor"], K, bevel=0.12, rot=(0.12, 0, 0))   # nose
    box((0, 3.4, -0.12), (0.3, 0.5, 0.3), M["Frame"], K, bevel=0.06)
    box((0, 1.4, 0.42), (0.55, 1.3, 0.3), M["EEye"], K, bevel=0.1)          # canopy glow
    for s_ in (-1, 1):
        # swept delta wing built from three stepped slabs
        box((s_ * 1.2, -0.6, -0.05), (1.6, 2.6, 0.14), M["EArmor2"], K)
        box((s_ * 2.3, -1.1, -0.05), (1.0, 1.7, 0.12), M["EArmor2"], K)
        box((s_ * 3.0, -1.5, -0.05), (0.6, 0.9, 0.1), M["EArmor2"], K)
        box((s_ * 3.25, -1.5, 0.12), (0.1, 0.9, 0.35), M["Hazard"], K)       # wingtip fins
        box((s_ * 0.55, -2.3, 0.55), (0.1, 1.0, 0.9), M["EArmor2"], K, rot=(0, s_ * 0.35, 0))   # twin tails
        cyl((s_ * 0.32, -2.55, 0.0), 0.32, 0.4, M["Frame"], K, rot=(math.pi / 2, 0, 0), verts=12)
        cyl((s_ * 0.32, -2.78, 0.0), 0.24, 0.08, M["NozzleGlow"], K, rot=(math.pi / 2, 0, 0), verts=12)
        box((s_ * 1.6, -0.2, -0.22), (0.18, 1.2, 0.18), M["Frame"], K)       # pylons
    cyl((0, 2.2, -0.5), 0.12, 0.9, M["Joint"], K, rot=(-math.pi / 2, 0, 0), verts=8)
    muzzle("Muzzle_Jet", (0, 2.7, -0.5), K)

def build_split():
    # Splitter: armoured ball of eight curved plates around a glowing core, centred on the origin (rolls freely)
    K = kit("E_Split")
    ball((0, 0, 0), 0.66, M["SplitGlow"], K, sub=2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                c = 0.5
                box((sx * c, sy * c, sz * c), (0.74, 0.74, 0.74), M["EArmor"] if (sx * sy * sz) > 0 else M["EArmor2"], K, bevel=0.12,
                    rot=(0.0, 0.0, 0.0))
    for ax in range(3):
        rot = [(0, 0, 0), (math.pi / 2, 0, 0), (0, math.pi / 2, 0)][ax]
        torus((0, 0, 0), 0.9, 0.06, M["Frame"], K, rot=rot)
    for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
        ball((d[0] * 0.9, d[1] * 0.9, d[2] * 0.9), 0.13, M["SplitGlow"], K, sub=1)

def build_sentry():
    # deployable sentry: tripod base, yawing head with twin barrels and a cyan sensor; front = +Y
    K = kit("D_Sentry")
    cyl((0, 0, 0.35), 0.55, 0.3, M["Frame"], K, verts=16)
    for i in range(3):
        a = i / 3 * math.pi * 2
        box((math.cos(a) * 0.75, math.sin(a) * 0.75, 0.2), (0.16, 0.16, 0.9), M["Joint"], K, rot=(math.sin(a) * 0.9, -math.cos(a) * 0.9, 0))
        box((math.cos(a) * 1.15, math.sin(a) * 1.15, 0.05), (0.32, 0.32, 0.1), M["Frame"], K)
    cyl((0, 0, 0.75), 0.18, 0.6, M["Joint"], K, verts=10)
    h = empty("SY_Head", (0, 0, 1.15), K)
    box((0, 0.05, 0.1), (0.9, 0.95, 0.55), M["Armor2"], h, bevel=0.08)
    box((0, -0.1, 0.42), (0.6, 0.6, 0.12), M["Accent"], h, bevel=0.03)
    box((0.48, 0.05, 0.1), (0.06, 0.7, 0.3), M["Hazard"], h)
    ball((-0.28, 0.5, 0.22), 0.11, M["Sonar"], h, sub=1)
    for sx in (-1, 1):
        cyl((sx * 0.18, 0.95, 0.05), 0.07, 0.9, M["Black"], h, rot=(-math.pi / 2, 0, 0), verts=10)
        cyl((sx * 0.18, 1.4, 0.05), 0.1, 0.12, M["Joint"], h, rot=(-math.pi / 2, 0, 0), verts=10)
    muzzle("Muzzle_Sentry", (0, 1.5, 0.05), h)

def build_sentry_pod():
    K = kit("S_Sentry")
    # shoulder rack carrying a folded sentry: armoured cradle, folded legs, barrel tips poking forward
    box((0, -0.1, 0.25), (0.7, 0.95, 0.42), M["Armor2"], K, bevel=0.05)
    box((0, -0.1, 0.5), (0.5, 0.7, 0.1), M["Frame"], K)
    box((0, 0.42, 0.5), (0.42, 0.3, 0.2), M["Accent"], K, bevel=0.03)
    for sx in (-1, 1):
        cyl((sx * 0.1, 0.62, 0.5), 0.05, 0.28, M["Black"], K, rot=(-math.pi / 2, 0, 0), verts=8)
        box((sx * 0.37, -0.1, 0.25), (0.05, 0.8, 0.12), M["Hazard"], K)
    ball((0.14, 0.4, 0.62), 0.06, M["Sonar"], K, sub=1)
    muzzle("Muzzle_SentryPod", (0, 0.7, 0.55), K)

def build_skimmer():
    # Skimmer: hover gunboat. Wedge hull on a black skirt, two ducted fans at the back, chin gun, torpedo pods. front = +Y
    K = kit("E_Skimmer")
    box((0, 0.1, 0.55), (2.2, 3.6, 0.7), M["EArmor"], K, bevel=0.18)
    box((0, 1.95, 0.45), (1.5, 0.9, 0.5), M["EArmor"], K, bevel=0.15, rot=(0.25, 0, 0))
    box((0, 0.0, 0.12), (2.5, 4.0, 0.3), M["Black"], K, bevel=0.12)                 # skirt
    box((0, 0.6, 1.0), (1.0, 1.2, 0.45), M["EArmor2"], K, bevel=0.1)                 # cabin
    box((0, 1.05, 1.08), (0.8, 0.35, 0.22), M["EEye"], K, bevel=0.05)
    for s_ in (-1, 1):
        cyl((s_ * 0.62, -1.9, 1.15), 0.62, 0.35, M["Frame"], K, rot=(math.pi / 2, 0, 0), verts=16)
        torus((s_ * 0.62, -1.9, 1.15), 0.62, 0.08, M["EArmor2"], K, rot=(math.pi / 2, 0, 0))
        cyl((s_ * 0.62, -2.05, 1.15), 0.42, 0.05, M["NozzleGlow"], K, rot=(math.pi / 2, 0, 0), verts=12)
        box((s_ * 1.2, 0.3, 0.75), (0.32, 1.4, 0.32), M["EArmor2"], K, bevel=0.06)     # torpedo pods
        box((s_ * 1.2, 1.02, 0.75), (0.22, 0.08, 0.22), M["Hazard"], K)
        box((s_ * 1.28, -0.4, 0.55), (0.06, 2.2, 0.12), M["Hazard"], K)
    cyl((0, 2.45, 0.28), 0.1, 0.8, M["Joint"], K, rot=(-math.pi / 2, 0, 0), verts=8)
    muzzle("Muzzle_Skim", (0, 2.9, 0.28), K)
    muzzle("Muzzle_SkimT", (0, 1.1, 0.8), K)

def build_hook():
    K = kit("W_Hook")
    # grapple launcher: chunky barrel with a winch drum; the claw HK_Head sits in the muzzle and is hidden while it flies
    box((0, 0.15, 0.0), (0.38, 1.0, 0.38), M["Frame"], K, bevel=0.05)
    box((0, 0.2, 0.2), (0.3, 0.7, 0.06), M["Armor"], K, bevel=0.02)
    cyl((0, 0.85, 0.02), 0.15, 0.5, M["Joint"], K, rot=(-math.pi / 2, 0, 0), verts=12)
    cyl((0.28, -0.05, 0.0), 0.2, 0.18, M["Armor2"], K, rot=(0, math.pi / 2, 0), verts=14)  # winch
    cyl((0.37, -0.05, 0.0), 0.12, 0.04, M["Hazard"], K, rot=(0, math.pi / 2, 0), verts=12)
    h = empty("HK_Head", (0, 1.15, 0.02), K)
    cyl((0, 0, 0), 0.07, 0.3, M["Joint"], h, rot=(-math.pi / 2, 0, 0), verts=8)
    for k in range(3):
        a = k / 3 * math.pi * 2
        box((math.cos(a) * 0.12, 0.16, math.sin(a) * 0.12), (0.05, 0.22, 0.05), M["Hazard"], h, rot=(math.sin(a) * 0.6, 0, -math.cos(a) * 0.6))
    muzzle("Muzzle_Hook", (0, 1.25, 0.02), K)

def build_lev():
    # Leviathan sandworm. Head: armoured cylinder with three mandibles around a glowing maw. front = +Y
    K = kit("E_LevHead")
    cyl((0, -0.2, 0), 1.5, 2.2, M["LevSkin"], K, rot=(math.pi / 2, 0, 0), verts=16)
    cyl((0, 1.05, 0), 1.35, 0.5, M["LevPlate"], K, rot=(math.pi / 2, 0, 0), verts=16, r2=1.55)
    cyl((0, 1.32, 0), 0.9, 0.08, M["LevGlow"], K, rot=(math.pi / 2, 0, 0), verts=16)
    for k in range(6):
        a = k / 6 * math.pi * 2
        box((math.cos(a) * 1.45, -0.3, math.sin(a) * 1.45), (0.7, 1.9, 0.35), M["LevPlate"], K, bevel=0.1, rot=(0, -a, 0) if False else (0, 0, 0))
    for k in range(3):
        a = k / 3 * math.pi * 2 + math.pi / 2
        m = empty(f"LV_Jaw{k}", (math.cos(a) * 1.0, 1.2, math.sin(a) * 1.0), K)
        box((math.cos(a) * 0.25, 0.75, math.sin(a) * 0.25), (0.45, 1.6, 0.45), M["LevPlate"], m, bevel=0.12, rot=(math.sin(a) * -0.35, 0, math.cos(a) * 0.35))
        box((math.cos(a) * 0.05, 1.55, math.sin(a) * 0.05), (0.25, 0.7, 0.25), M["Joint"], m, bevel=0.06, rot=(math.sin(a) * 0.45, 0, -math.cos(a) * 0.45))
    for s_ in (-1, 1):
        ball((s_ * 0.9, 0.7, 0.95), 0.18, M["LevGlow"], K, sub=1)
    K = kit("E_LevSeg")
    cyl((0, 0, 0), 1.3, 2.0, M["LevSkin"], K, rot=(math.pi / 2, 0, 0), verts=14)
    torus((0, 0.95, 0), 1.25, 0.12, M["LevGlow"], K, rot=(math.pi / 2, 0, 0))
    for k in range(5):
        a = (k - 2) * 0.55 + math.pi / 2
        box((math.cos(a) * 1.3, 0.0, math.sin(a) * 1.3), (0.6, 1.7, 0.3), M["LevPlate"], K, bevel=0.1)
    box((0, -0.2, -1.25), (0.5, 1.2, 0.3), M["LevPlate"], K, bevel=0.08)

def build_jungle():
    # big rainforest tree: tapered trunk with buttress roots, a lumpy two-tone canopy and hanging vines
    for name, H, R in (("P_JTree", 12.5, 4.4), ("P_JTree2", 9.0, 3.4)):
        K = kit(name)
        cyl((0, 0, H / 2), 0.9 * R / 4.4 + 0.1, H, M["Bark"], K, verts=9, r2=0.45, smooth=False)
        for k in range(5):
            a = k / 5 * math.pi * 2 + 0.4
            wedge((math.cos(a) * 0.9, math.sin(a) * 0.9, 0.9), (0.35, 1.8, 1.8), M["Bark"], K, rot=(0, 0, a + math.pi / 2), taper=0.15)
        ball((0, 0, H + 0.4), R, M["Leaf"], K, scale=(1, 1, 0.5), sub=1)
        for k in range(4):
            a = k / 4 * math.pi * 2 + 0.8
            ball((math.cos(a) * R * 0.62, math.sin(a) * R * 0.62, H - 0.4 + (k % 2) * 0.8), R * 0.62, M["Leaf2" if k % 2 else "Leaf"], K, scale=(1, 1, 0.55), sub=1)
        for k in range(7):
            a = k / 7 * math.pi * 2 + 0.2
            L = 2.5 + (k * 1.7) % 3.2
            box((math.cos(a) * R * 0.75, math.sin(a) * R * 0.75, H - 1.2 - L / 2), (0.08, 0.08, L), M["Vine"], K)
        box((0, 0, 1.6), (1.95 * R / 4.4 + 0.3, 1.95 * R / 4.4 + 0.3, 1.0), M["Moss"], K)
    K = kit("P_Fern")
    for k in range(7):
        a = k / 7 * math.pi * 2
        wedge((math.cos(a) * 0.7, math.sin(a) * 0.7, 0.35), (0.35, 1.6, 0.12), M["Leaf2" if k % 2 else "Leaf"], K, rot=(0.45, 0, a - math.pi / 2), taper=0.1)

def build_prism():
    # Prism: tripod walker carrying a big hexagonal mirror in front (reflects bullets and missiles back). front = +Y
    K = kit("E_Prism")
    body = empty("E_PBody", (0, 0, 2.6), K)
    cyl((0, 0, 0), 0.95, 1.6, M["EArmor"], body, verts=6, smooth=False)
    cyl((0, 0, 0.95), 0.75, 0.35, M["EArmor2"], body, verts=6, r2=0.45, smooth=False)
    ball((0, 0, 1.55), 0.42, M["PrismGlow"], body, scale=(0.8, 0.8, 1.7), sub=0)
    box((0, 0.62, 0.35), (0.7, 0.08, 0.14), M["EEye"], body)
    mir = empty("PR_Mirror", (0, 1.25, 0.15), body)
    cyl((0, 0, 0), 1.75, 0.14, M["Mirror"], mir, rot=(math.pi / 2, 0, math.pi / 6), verts=6, smooth=False)
    cyl((0, -0.06, 0), 1.9, 0.1, M["PrismGlow"], mir, rot=(math.pi / 2, 0, math.pi / 6), verts=6, smooth=False)
    cyl((0, -0.14, 0), 1.95, 0.14, M["EArmor2"], mir, rot=(math.pi / 2, 0, math.pi / 6), verts=6, smooth=False)
    for sx in (-1, 1):
        box((sx * 0.75, -0.55, 0), (0.2, 1.0, 0.25), M["Frame"], mir)
    muzzle("Muzzle_Prism", (0, 0.2, 2.2), body)
    for i in range(3):
        a = i / 3 * math.pi * 2 + math.pi / 2 + math.pi / 3
        leg = empty(f"E_PLeg{i + 1}", (math.cos(a) * 0.75, math.sin(a) * 0.75, -0.5), body, rot=(0, 0, a))
        ball((0, 0, 0), 0.24, M["Joint"], leg)
        box((0.6, 0, 0.25), (1.2, 0.28, 0.28), M["EArmor"], leg, rot=(0, math.radians(-25), 0), bevel=0.04)
        kn = empty(f"E_PKnee{i + 1}", (1.15, 0, 0.5), leg)
        ball((0, 0, 0), 0.18, M["Joint"], kn)
        box((0.15, 0, -1.25), (0.24, 0.24, 2.5), M["Frame"], kn, rot=(0, math.radians(-8), 0), bevel=0.03)
        cyl((0.32, 0, -2.5), 0.32, 0.16, M["EArmor2"], kn, verts=6, smooth=False)

def build_sonic():
    K = kit("W_Sonic")
    # sonic cannon: boxy emitter body, a flared horn with glowing resonator rings
    box((0, 0.0, 0.0), (0.42, 0.9, 0.42), M["Frame"], K, bevel=0.05)
    box((0, -0.1, 0.24), (0.34, 0.6, 0.08), M["Armor"], K, bevel=0.02)
    cyl((0, 0.85, 0), 0.2, 0.9, M["Armor2"], K, rot=ALONG_Y, verts=14, r2=0.5)
    for k, y in enumerate((0.55, 0.85, 1.15)):
        torus((0, y, 0), 0.24 + k * 0.1, 0.035, M["SonicGlow"], K, rot=(math.pi / 2, 0, 0))
    cyl((0, 1.28, 0), 0.46, 0.04, M["Black"], K, rot=ALONG_Y, verts=14)
    muzzle("Muzzle_Sonic", (0, 1.35, 0), K)

def build_fencer():
    # Fencer: hovering fence pylon. Slim armoured mast, a red emitter ring at chest height (the laser fence starts here),
    # three stabiliser fins and a thruster underneath. Symmetric; front = +Y
    K = kit("E_Fencer")
    cyl((0, 0, 0), 0.5, 2.4, M["EArmor"], K, verts=8, r2=0.36, smooth=False)
    cyl((0, 0, 1.35), 0.38, 0.3, M["EArmor2"], K, verts=8, r2=0.18, smooth=False)
    ball((0, 0, 1.55), 0.14, M["Fence"], K)
    cyl((0, 0, -1.35), 0.42, 0.3, M["Frame"], K, verts=8, r2=0.3, smooth=False)
    cyl((0, 0, -1.55), 0.3, 0.08, M["NozzleGlow"], K, verts=12)
    ring = empty("FN_Ring", (0, 0, 0.1), K)
    torus((0, 0, 0), 0.78, 0.07, M["Fence"], ring)
    for i in range(3):
        a = i * math.pi * 2 / 3
        box((math.cos(a) * 0.78, math.sin(a) * 0.78, 0), (0.22, 0.22, 0.34), M["EArmor2"], ring, rot=(0, 0, a))
    for i in range(3):
        a = i * math.pi * 2 / 3 + math.pi / 3
        wedge((math.cos(a) * 0.6, math.sin(a) * 0.6, -0.7), (0.08, 0.6, 0.9), M["EArmor2"], K, rot=(0, 0, a + math.pi / 2), taper=0.3)
        box((math.cos(a) * 0.5, math.sin(a) * 0.5, 0.75), (0.05, 0.05, 0.5), M["Hazard"], K, rot=(0, 0, a))
    box((0, 0.48, 0.6), (0.3, 0.06, 0.12), M["EEye"], K)
    muzzle("Muzzle_Fencer", (0, 0, 0.1), K)

def build_stasis():
    K = kit("S_Stasis")
    # shoulder stasis projector: a squat cradle holding a pale-blue sphere inside two clock rings with tick marks
    box((0, -0.1, 0.22), (0.66, 0.86, 0.34), M["Armor2"], K, bevel=0.05)
    box((-0.34, -0.1, 0.28), (0.05, 0.76, 0.24), M["Accent"], K)
    ball((0, 0.16, 0.64), 0.24, M["Stasis"], K)
    torus((0, 0.16, 0.64), 0.38, 0.03, M["Stasis"], K, rot=(math.pi / 2, 0, 0))
    torus((0, 0.16, 0.64), 0.31, 0.025, M["Frame"], K, rot=(math.pi / 2, 0, 0.6))
    for k in range(8):
        a = k / 8 * math.pi * 2
        box((math.cos(a) * 0.38, 0.16, 0.64 + math.sin(a) * 0.38), (0.05, 0.08, 0.05), M["Black"], K)
    for s_ in (-1, 1):
        box((s_ * 0.3, 0.16, 0.5), (0.07, 0.26, 0.36), M["Frame"], K)
    muzzle("Muzzle_Stasis", (0, 0.5, 0.64), K)

def build_toxic():
    # chemical works: a big storage tank with a hazard band, ladder, pipe stubs and a rusty base; a cluster of drums
    K = kit("P_Tank")
    cyl((0, 0, 0.4), 3.4, 0.8, M["Concrete"] if "Concrete" in M else M["Frame"], K, verts=20)
    cyl((0, 0, 4.0), 3.0, 6.6, M["TankPaint"], K, verts=24)
    cyl((0, 0, 7.45), 3.0, 0.3, M["TankPaint"], K, verts=24, r2=2.2)
    cyl((0, 0, 3.0), 3.04, 0.5, M["Hazard"], K, verts=24)
    cyl((0, 0, 1.0), 3.06, 0.4, M["Rust"], K, verts=24)
    for k in range(5):
        box((0.25 * (k % 2 * 2 - 1), -3.1, 1.2 + k * 1.3), (0.06, 0.06, 1.3), M["Frame"], K)
    box((0, -3.12, 4.0), (0.7, 0.05, 6.4), M["Frame"], K)
    for a in (0.6, 2.4, 4.0):
        cyl((math.cos(a) * 3.3, math.sin(a) * 3.3, 1.6), 0.28, 1.0, M["Frame"], K, rot=(math.pi / 2, 0, a + math.pi / 2), verts=10)
    ball((0, 0, 7.75), 0.5, M["Frame"], K)
    K = kit("P_Drums")
    for (x, y, toxic) in ((0, 0, True), (0.9, 0.3, False), (0.3, 0.95, True), (-0.7, 0.6, False), (-0.5, -0.8, False)):
        cyl((x, y, 0.55), 0.4, 1.1, M["Toxic"] if toxic else M["Rust"], K, verts=12)
        cyl((x, y, 1.12), 0.41, 0.06, M["Frame"], K, verts=12)

def build_hive():
    # Hive: a slow hovering carrier. Hexagonal hull, six bay hatches round an amber core, four ducted rotor pods. front = +Y
    K = kit("E_Hive")
    cyl((0, 0, 0), 2.4, 1.0, M["EArmor"], K, verts=6, smooth=False)
    cyl((0, 0, 0.65), 1.8, 0.4, M["EArmor2"], K, verts=6, r2=1.2, smooth=False)
    cyl((0, 0, -0.65), 2.0, 0.35, M["Frame"], K, verts=6, r2=1.5, smooth=False)
    core = empty("HV_Core", (0, 0, -0.9), K)
    ball((0, 0, 0), 0.7, M["HiveGlow"], core, scale=(1, 1, 0.6))
    for i in range(6):
        a = i * math.pi / 3 + math.pi / 6
        box((math.cos(a) * 1.55, math.sin(a) * 1.55, -0.85), (0.7, 0.5, 0.1), M["Hazard"], K, rot=(0, 0, a))
        box((math.cos(a) * 1.55, math.sin(a) * 1.55, -0.8), (0.5, 0.32, 0.06), M["HiveGlow"], K, rot=(0, 0, a))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 2.9, math.sin(a) * 2.9
        box((math.cos(a) * 2.2, math.sin(a) * 2.2, 0.2), (1.2, 0.3, 0.25), M["Frame"], K, rot=(0, 0, a))
        cyl((x, y, 0.2), 0.85, 0.45, M["EArmor2"], K, verts=14)
        cyl((x, y, 0.2), 0.7, 0.5, M["Black"], K, verts=14)
        rot_ = empty("HV_Rotor%d" % (i + 1), (x, y, 0.25), K)
        box((0, 0, 0), (1.3, 0.14, 0.04), M["Frame"], rot_)
        box((0, 0, 0), (0.14, 1.3, 0.04), M["Frame"], rot_)
    box((0, 2.3, 0.1), (0.8, 0.12, 0.2), M["EEye"], K)
    cyl((0, 0, 1.2), 0.08, 0.8, M["Frame"], K, verts=6)
    ball((0, 0, 1.62), 0.1, M["EEye"], K)
    K = kit("E_Swarm")
    # swarmling: a fist-sized kamikaze drone, a dart body, two blade wings and an amber eye. front = +Y
    box((0, 0, 0), (0.22, 0.6, 0.18), M["EArmor"], K, bevel=0.03)
    wedge((0, 0.42, 0), (0.2, 0.26, 0.16), M["EArmor2"], K, rot=(0, 0, 0), taper=0.2)
    ball((0, 0.34, 0.08), 0.07, M["HiveGlow"], K)
    for s_ in (-1, 1):
        w = empty("SW_Wing%d" % (1 if s_ < 0 else 2), (s_ * 0.1, -0.05, 0.08), K)
        box((s_ * 0.3, 0, 0), (0.56, 0.16, 0.025), M["Frame"], w)
    cyl((0, -0.34, 0), 0.07, 0.08, M["NozzleGlow"], K, rot=ALONG_Y, verts=8)

def build_flak():
    K = kit("W_Flak")
    # flak cannon: blocky receiver, side ammo drum, twin short barrels with perforated jackets
    box((0, 0.0, 0.0), (0.46, 1.0, 0.44), M["Frame"], K, bevel=0.05)
    box((0, -0.15, 0.27), (0.36, 0.6, 0.1), M["Armor"], K, bevel=0.02)
    cyl((0.33, -0.1, 0), 0.26, 0.3, M["Armor2"], K, rot=(0, math.pi / 2, 0), verts=14)
    cyl((0.49, -0.1, 0), 0.12, 0.04, M["Hazard"], K, rot=(0, math.pi / 2, 0), verts=14)
    for s_ in (-1, 1):
        cyl((s_ * 0.11, 0.85, 0.05), 0.09, 0.8, M["Black"], K, rot=ALONG_Y, verts=10)
        cyl((s_ * 0.11, 0.75, 0.05), 0.12, 0.45, M["Armor2"], K, rot=ALONG_Y, verts=8)
        cyl((s_ * 0.11, 1.26, 0.05), 0.11, 0.06, M["Hazard"], K, rot=ALONG_Y, verts=10)
    muzzle("Muzzle_Flak", (0, 1.32, 0.05), K)

def build_grid():
    # power plant set pieces: a lattice transmission pylon with insulator strings, and a transformer box with cooling fins
    K = kit("P_Pylon")
    for (x, y) in ((-1.2, -1.2), (1.2, -1.2), (1.2, 1.2), (-1.2, 1.2)):
        box((x * 0.6, y * 0.6, 5.0), (0.16, 0.16, 10.0), M["Pylon"], K, rot=(-y * 0.08, x * 0.08, 0))
    for k in range(5):
        s = 1.25 - k * 0.12
        z = 1.0 + k * 2.0
        box((0, -s * 0.72, z), (s * 1.45, 0.08, 0.08), M["Pylon"], K)
        box((0, s * 0.72, z), (s * 1.45, 0.08, 0.08), M["Pylon"], K)
        box((-s * 0.72, 0, z), (0.08, s * 1.45, 0.08), M["Pylon"], K)
        box((s * 0.72, 0, z), (0.08, s * 1.45, 0.08), M["Pylon"], K)
    box((0, 0, 9.6), (4.6, 0.25, 0.25), M["Pylon"], K)
    for x in (-2.0, 0, 2.0):
        for k in range(4):
            cyl((x, 0, 9.2 - k * 0.22), 0.14, 0.12, M["Insul"], K, verts=10)
    K = kit("P_Transformer")
    box((0, 0, 1.3), (3.0, 2.0, 2.6), M["Pylon"], K, bevel=0.06)
    for k in range(7):
        box((-1.25 + k * 0.42, -1.1, 1.2), (0.06, 0.2, 2.0), M["Frame"], K)
        box((-1.25 + k * 0.42, 1.1, 1.2), (0.06, 0.2, 2.0), M["Frame"], K)
    for x in (-0.8, 0, 0.8):
        cyl((x, 0, 2.9), 0.16, 0.6, M["Insul"], K, verts=10)
    box((0, -1.02, 1.9), (0.9, 0.02, 0.5), M["Hazard"], K)

def build_blinker():
    # Blinker: a lean phase-shift assault drone. Arrowhead hull, two swept fins, a violet phase ring at the back, twin shotgun pods. front = +Y
    K = kit("E_Blinker")
    box((0, 0, 0), (0.9, 1.8, 0.5), M["EArmor"], K, bevel=0.08)
    wedge((0, 1.25, 0), (0.8, 0.8, 0.42), M["EArmor2"], K, taper=0.15)
    box((0, 0.5, 0.32), (0.5, 0.7, 0.16), M["Black"], K, bevel=0.03)
    box((0, 1.0, 0.3), (0.34, 0.12, 0.08), M["EEye"], K)
    for s_ in (-1, 1):
        box((s_ * 1.0, -0.3, 0.0), (1.3, 0.7, 0.08), M["EArmor2"], K, rot=(0, 0, s_ * -0.5))
        box((s_ * 1.55, -0.55, 0.0), (0.14, 0.5, 0.12), M["BlinkGlow"], K, rot=(0, 0, s_ * -0.5))
        cyl((s_ * 0.55, 0.7, -0.22), 0.13, 1.1, M["Frame"], K, rot=ALONG_Y, verts=10)
        muzzle("Muzzle_BK%d" % (1 if s_ < 0 else 2), (s_ * 0.55, 1.3, -0.22), K)
    ring = empty("BL_Ring", (0, -1.1, 0), K)
    torus((0, 0, 0), 0.62, 0.09, M["BlinkGlow"], ring, rot=(math.pi / 2, 0, 0))
    ball((0, 0, 0), 0.26, M["BlinkGlow"], ring)

def build_cluster():
    K = kit("S_Cluster")
    # cluster mortar: a stubby wide tube on a trunnion, hazard bands, a loader box behind
    box((0, -0.25, 0), (0.7, 0.8, 0.55), M["Frame"], K, bevel=0.05)
    cyl((0, 0.35, 0.18), 0.3, 1.2, M["Armor"], K, rot=(-math.pi / 2 + 0.45, 0, 0), verts=14)
    cyl((0, 0.62, 0.45), 0.34, 0.12, M["Hazard"], K, rot=(-math.pi / 2 + 0.45, 0, 0), verts=14)
    cyl((0, 0.66, 0.48), 0.22, 0.13, M["Black"], K, rot=(-math.pi / 2 + 0.45, 0, 0), verts=14)
    for s_ in (-1, 1):
        cyl((s_ * 0.36, 0.1, 0.05), 0.1, 0.16, M["Armor2"], K, rot=(0, math.pi / 2, 0), verts=10)
    muzzle("Muzzle_Cluster", (0, 0.72, 0.55), K)

def build_twister():
    # prairie set pieces: a wind turbine with a spinning rotor, and a round hay bale
    K = kit("P_Turbine")
    cyl((0, 0, 7.0), 0.45, 14.0, M["Turbine"], K, verts=14, r2=0.28)
    box((0, 0, 14.2), (0.9, 2.0, 0.9), M["Turbine"], K, bevel=0.15)
    rot_ = empty("WT_Rotor", (0, 1.1, 14.2), K)
    ball((0, 0, 0), 0.4, M["Turbine"], rot_)
    for k in range(3):
        a = k * 2 * math.pi / 3
        box((math.sin(a) * 3.2, 0.05, math.cos(a) * 3.2), (0.45, 0.08, 6.2), M["Turbine"], rot_, rot=(0, a, 0))
    box((0, -0.2, 0.5), (1.6, 1.6, 1.0), M["Pylon"], K)
    K = kit("P_Hay")
    cyl((0, 0, 0.75), 0.8, 1.3, M["Hay"], K, rot=(0, math.pi / 2, 0), verts=16)
    cyl((0, 0, 0.75), 0.82, 0.08, M["Rust"], K, rot=(0, math.pi / 2, 0), verts=16)

def build_watch():
    # Watchtower: a four-legged lattice tower with a guard hut and a swivelling searchlight head. front = +Y
    K = kit("E_Watch")
    for (x, y) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        box((x * 1.25, y * 1.25, 3.4), (0.22, 0.22, 6.9), M["EArmor2"], K, rot=(-y * 0.07, x * 0.07, 0))
    for k in range(3):
        z = 1.2 + k * 2.1; s = 1.45 - k * 0.1
        for (dx, dy, sx, sy) in ((0, -s, 2 * s, 0.1), (0, s, 2 * s, 0.1), (-s, 0, 0.1, 2 * s), (s, 0, 0.1, 2 * s)):
            box((dx, dy, z), (sx, sy, 0.1), M["Frame"], K)
    box((0, 0, 7.05), (3.2, 3.2, 0.3), M["EArmor"], K, bevel=0.04)
    box((0, 0, 7.7), (2.2, 2.2, 1.0), M["EArmor2"], K, bevel=0.05)
    box((0, 1.12, 7.8), (1.6, 0.05, 0.4), M["EEye"], K)
    for (x, y) in ((-1.5, -1.5), (1.5, -1.5), (1.5, 1.5), (-1.5, 1.5)):
        cyl((x, y, 7.55), 0.05, 0.7, M["Frame"], K, verts=6)
    h = empty("WH_Head", (0, 0, 8.6), K)
    cyl((0, 0, -0.2), 0.3, 0.4, M["Frame"], h, verts=10)
    cyl((0, 0.15, 0.35), 0.62, 0.95, M["EArmor"], h, rot=ALONG_Y, verts=16)
    cyl((0, 0.64, 0.35), 0.55, 0.06, M["Lamp"], h, rot=ALONG_Y, verts=16)
    cyl((0, 0.66, 0.35), 0.66, 0.08, M["Hazard"], h, rot=ALONG_Y, verts=16)
    for s_ in (-1, 1):
        box((s_ * 0.7, 0.1, 0.25), (0.08, 0.5, 0.6), M["Frame"], h)
    empty("WH_Lamp", (0, 0.72, 0.35), h)

def build_chaff():
    K = kit("S_Chaff")
    # chaff/flare dispenser: a slab launcher with a 3x2 grid of short tubes, hazard trim
    box((0, 0, 0), (0.8, 0.8, 0.5), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.28), (0.72, 0.68, 0.08), M["Armor"], K, bevel=0.02)
    for i in range(3):
        for j in range(2):
            x, y = -0.24 + i * 0.24, -0.14 + j * 0.3
            cyl((x, y, 0.38), 0.085, 0.22, M["Black"], K, verts=10)
            cyl((x, y, 0.42), 0.055, 0.2, M["Flare"], K, verts=8)
    box((0, 0.42, 0.1), (0.8, 0.04, 0.3), M["Hazard"], K)
    muzzle("Muzzle_Chaff", (0, 0, 0.55), K)

def build_frost():
    # Frostcaster: a hover sled with a frost-cannon turret. Sled hull with two ski runners and rime-crusted armour,
    # a turret (FR_Turret) carrying a fat barrel ringed by glowing coils and a crystal at the muzzle. front = +Y
    K = kit("E_Frost")
    box((0, 0, 0.55), (1.9, 3.0, 0.7), M["EArmor"], K, bevel=0.12)
    wedge((0, 1.75, 0.5), (1.7, 0.6, 0.55), M["EArmor2"], K, taper=0.3)
    box((0, -0.2, 0.95), (1.5, 2.2, 0.16), M["Rime"], K, bevel=0.05)
    for s_ in (-1, 1):
        box((s_ * 1.05, 0.1, 0.12), (0.16, 3.4, 0.12), M["Frame"], K, bevel=0.03)
        box((s_ * 1.05, 1.85, 0.25), (0.16, 0.4, 0.12), M["Frame"], K, rot=(0.6, 0, 0))
        for y in (-0.9, 0.9):
            box((s_ * 1.0, y, 0.33), (0.1, 0.1, 0.4), M["Frame"], K)
        box((s_ * 0.98, -1.0, 0.65), (0.08, 0.7, 0.18), M["FrostGlow"], K)
    box((0, -1.55, 0.7), (1.2, 0.25, 0.4), M["Black"], K)
    for s_ in (-0.35, 0.35):
        cyl((s_, -1.7, 0.7), 0.16, 0.12, M["FrostGlow"], K, rot=ALONG_Y, verts=12)
    t = empty("FR_Turret", (0, -0.1, 1.05), K)
    cyl((0, 0, 0.2), 0.75, 0.4, M["EArmor2"], t, verts=16)
    box((0, -0.15, 0.55), (1.0, 1.1, 0.5), M["EArmor"], t, bevel=0.08)
    box((0, 0.42, 0.62), (0.4, 0.08, 0.12), M["EEye"], t)
    cyl((0, 1.05, 0.55), 0.24, 1.7, M["Frame"], t, rot=ALONG_Y, verts=14)
    for k in range(3):
        torus((0, 0.55 + k * 0.38, 0.55), 0.3, 0.06, M["FrostGlow"], t, rot=(math.pi / 2, 0, 0))
    ball((0, 1.98, 0.55), 0.22, M["Ice"], t, scale=(1, 1.5, 1))
    for s_ in (-1, 1):
        box((s_ * 0.55, -0.5, 0.9), (0.08, 0.08, 0.5), M["Frame"], t, rot=(0.3, 0, 0))
    muzzle("Muzzle_FR", (0, 2.25, 0.55), t)

def build_icewall():
    K = kit("S_IceWall")
    # ice-wall projector: a squat box with three frost emitter nozzles in a row and coolant tanks on the sides
    box((0, 0, 0), (0.95, 0.75, 0.5), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.28), (0.85, 0.6, 0.08), M["Armor"], K, bevel=0.02)
    for i in range(3):
        x = -0.28 + i * 0.28
        cyl((x, 0.18, 0.38), 0.1, 0.2, M["Black"], K, verts=10)
        cyl((x, 0.18, 0.47), 0.07, 0.06, M["FrostGlow"], K, verts=10)
    for s_ in (-1, 1):
        cyl((s_ * 0.55, -0.05, 0.05), 0.15, 0.6, M["Rime"], K, rot=ALONG_Y, verts=12)
    box((0, -0.4, 0.1), (0.95, 0.04, 0.3), M["Hazard"], K)
    muzzle("Muzzle_IceWall", (0, 0.2, 0.55), K)

def build_blimp():
    # Airship: a 16 m armoured gas envelope with ribs, a gondola slung underneath with two gun turrets and a bomb bay,
    # two engine pods on outriggers with propellers (AS_Prop1/2) and cruciform tail fins. front = +Y
    K = kit("E_Blimp")
    ball((0, 0, 0), 1.0, M["Envelope"], K, scale=(3.0, 8.0, 3.0), sub=3)
    for k in range(-3, 4):
        y = k * 1.9; r = 3.0 * math.sqrt(max(0.05, 1 - (y / 8.0) ** 2)) + 0.04
        torus((0, y, 0), r, 0.07, M["Envelope2"], K, rot=(math.pi / 2, 0, 0))
    box((0, 0, 2.9), (0.5, 9.0, 0.3), M["Envelope2"], K, bevel=0.1)
    for (rx, ry) in ((0, 0), (math.pi / 2, 0)):
        pass
    for s_ in (-1, 1):
        box((s_ * 1.5, -6.9, 0), (2.6, 1.8, 0.14), M["EArmor2"], K, bevel=0.04)
        box((0, -6.9, s_ * 1.5), (0.14, 1.8, 2.6), M["EArmor2"], K, bevel=0.04)
    box((0, -7.7, 0), (0.4, 0.3, 0.4), M["Hazard"], K)
    # gondola
    box((0, 0.6, -3.35), (1.7, 5.0, 1.2), M["EArmor"], K, bevel=0.15)
    wedge((0, 3.4, -3.35), (1.5, 0.8, 1.0), M["EArmor2"], K, taper=0.4)
    box((0, 3.2, -3.1), (1.2, 0.4, 0.3), M["Glass"], K, bevel=0.04)
    box((0, 3.6, -3.4), (0.8, 0.06, 0.12), M["EEye"], K)
    box((0, -0.6, -4.0), (1.1, 2.0, 0.12), M["Hazard"], K)
    box((0, -0.6, -3.96), (0.8, 1.7, 0.1), M["Black"], K)
    for s_ in (-1, 1):
        box((s_ * 0.5, 0.6, -2.5), (0.12, 3.8, 0.7), M["Frame"], K)
        side = 1 if s_ < 0 else 2
        cyl((s_ * 0.95, 2.0, -3.7), 0.32, 0.35, M["EArmor2"], K, verts=12)
        cyl((s_ * 0.95, 2.45, -3.75), 0.07, 0.8, M["Black"], K, rot=ALONG_Y, verts=8)
        muzzle("Muzzle_AS%d" % side, (s_ * 0.95, 2.9, -3.75), K)
        # engine pods
        box((s_ * 2.7, -1.5, -1.6), (2.2, 0.3, 0.25), M["Frame"], K)
        cyl((s_ * 3.9, -1.5, -1.6), 0.55, 2.0, M["EArmor"], K, rot=ALONG_Y, verts=14)
        cyl((s_ * 3.9, -2.6, -1.6), 0.3, 0.3, M["Black"], K, rot=ALONG_Y, verts=10)
        p = empty("AS_Prop%d" % side, (s_ * 3.9, -2.85, -1.6), K)
        for a in (0, math.pi / 2):
            box((0, 0, 0), (2.4, 0.06, 0.22), M["Black"], p, rot=(0, a, 0))
        cyl((s_ * 3.9, -0.5, -1.6), 0.45, 0.06, M["EEye"], K, rot=ALONG_Y, verts=14)

def build_rockets():
    K = kit("S_Rockets")
    # rocket pod: a deep box with a 4x3 honeycomb of open tubes, hazard band, side handles
    box((0, 0, 0), (0.95, 1.1, 0.7), M["Armor"], K, bevel=0.06)
    box((0, 0.56, 0), (0.88, 0.06, 0.62), M["Frame"], K)
    for i in range(4):
        for j in range(3):
            x, z = -0.33 + i * 0.22, -0.2 + j * 0.2
            cyl((x, 0.58, z), 0.085, 0.08, M["Black"], K, rot=ALONG_Y, verts=8)
            cyl((x, 0.6, z), 0.05, 0.03, M["Hazard"], K, rot=ALONG_Y, verts=8)
    box((0, -0.1, 0.38), (0.96, 0.5, 0.06), M["Hazard"], K)
    for s_ in (-1, 1):
        box((s_ * 0.52, -0.2, 0), (0.08, 0.5, 0.25), M["Frame"], K)
    muzzle("Muzzle_Rockets", (0, 0.7, 0), K)

def build_mirage():
    # Mirage projector: a flat hover disc with a crystal lens array underneath, a slowly turning emitter ring
    # (MR_Ring) carrying four small prisms, and a pulse gun (Muzzle_MR) under the nose. front = +Y
    K = kit("E_Mirage")
    cyl((0, 0, 0), 2.1, 0.45, M["EArmor"], K, verts=20, r2=1.6)
    cyl((0, 0, 0.32), 1.4, 0.25, M["EArmor2"], K, verts=20, r2=1.0)
    cyl((0, 0, 0.5), 0.55, 0.2, M["Glass"], K, verts=14)
    cyl((0, 0, -0.32), 1.2, 0.2, M["Frame"], K, verts=18)
    ball((0, 0, -0.75), 0.6, M["HoloGlow"], K, scale=(1, 1, 0.8), sub=2)
    for k in range(3):
        a = k / 3 * math.pi * 2
        box((math.cos(a) * 0.9, math.sin(a) * 0.9, -0.55), (0.18, 0.18, 0.5), M["Ice"], K, rot=(math.sin(a) * 0.4, -math.cos(a) * 0.4, 0))
    r = empty("MR_Ring", (0, 0, -0.1), K)
    torus((0, 0, 0), 2.5, 0.08, M["HoloGlow"], r)
    for k in range(4):
        a = k / 4 * math.pi * 2
        box((math.cos(a) * 2.5, math.sin(a) * 2.5, 0), (0.3, 0.3, 0.55), M["Ice"], r, rot=(0, 0, a + math.pi / 4))
    box((0, 1.85, -0.05), (0.7, 0.6, 0.3), M["EArmor2"], K, bevel=0.06)
    box((0, 2.0, 0.12), (0.5, 0.1, 0.08), M["EEye"], K)
    cyl((0, 2.35, -0.2), 0.11, 0.7, M["Black"], K, rot=ALONG_Y, verts=10)
    muzzle("Muzzle_MR", (0, 2.75, -0.2), K)
    for s_ in (-1, 1):
        box((s_ * 1.6, -1.0, 0.05), (0.5, 0.9, 0.12), M["Hazard"], K)

def build_sticky():
    K = kit("W_Sticky")
    # sticky-bomb launcher: squat receiver, a side box magazine with red-lit charges, wide flared barrel
    box((0, 0.1, 0.05), (0.46, 0.9, 0.42), M["Frame"], K, bevel=0.05)
    box((0, 0.0, 0.3), (0.38, 0.6, 0.1), M["Armor"], K, bevel=0.02)
    box((0.33, 0.2, -0.05), (0.22, 0.6, 0.36), M["Armor2"], K, bevel=0.04)
    for k in range(3):
        ball((0.45, 0.0 + k * 0.2, -0.05), 0.07, M["StickyGlow"], K, sub=1)
    cyl((0, 0.95, 0.06), 0.15, 0.8, M["Joint"], K, rot=ALONG_Y, verts=12)
    cyl((0, 1.4, 0.06), 0.16, 0.22, M["Frame"], K, rot=ALONG_Y, verts=12, r2=0.26)
    box((-0.24, 0.3, 0.05), (0.04, 0.5, 0.2), M["Hazard"], K)
    muzzle("Muzzle_Sticky", (0, 1.55, 0.06), K)

def build_crane():
    # scrapyard electromagnet crane: two lattice legs 18 m tall, a cross girder along X, a trolley with cables
    # down to the magnet disc (CR_Mag, hangs at ~11 m) whose underside ring glows when energised
    K = kit("P_Crane")
    for s_ in (-1, 1):
        for d in (-1, 1):
            box((s_ * 8.0, d * 1.4, 9.0), (0.45, 0.45, 18.0), M["Hazard"] if d < 0 else M["Rust"], K)
        for h in range(1, 6):
            box((s_ * 8.0, 0, h * 3.0), (0.3, 2.8, 0.3), M["Rust2"], K)
            box((s_ * 8.0, 0, h * 3.0 + 1.5), (0.18, 3.2, 0.18), M["Rust2"], K, rot=(0.78, 0, 0))
        box((s_ * 8.0, 0, 0.3), (2.2, 4.2, 0.6), M["Concrete"] if "Concrete" in M else M["Frame"], K)
    box((0, 0, 18.4), (17.5, 1.6, 1.2), M["Hazard"], K)
    box((0, 0, 19.2), (17.0, 1.2, 0.4), M["Rust"], K)
    box((0, 0, 17.4), (2.4, 2.2, 1.0), M["Frame"], K, bevel=0.1)
    for s_ in (-0.5, 0.5):
        box((s_, 0, 14.2), (0.08, 0.08, 5.6), M["Black"], K)
    m = empty("CR_Mag", (0, 0, 11.0), K)
    cyl((0, 0, 0), 2.2, 0.8, M["Frame"], m, verts=20)
    cyl((0, 0, 0.55), 1.4, 0.35, M["Rust"], m, verts=16)
    cyl((0, 0, -0.45), 2.0, 0.12, M["MagGlow"], m, verts=20)
    for k in range(6):
        a = k / 6 * math.pi * 2
        box((math.cos(a) * 2.15, math.sin(a) * 2.15, 0), (0.3, 0.3, 0.9), M["Hazard"], m, rot=(0, 0, a))
    box((0, 0, 0.95), (0.6, 0.6, 0.4), M["Black"], m)

def build_deflector():
    # Deflector: a squat hover body inside a vertical coil ring (DF_Ring, spins), two emitter dishes on the flanks
    # and a scrap claw under the nose that flings junk (Muzzle_DF). front = +Y
    K = kit("E_Deflector")
    box((0, 0, 0), (1.8, 2.2, 1.2), M["EArmor"], K, bevel=0.2)
    wedge((0, 1.35, 0), (1.5, 0.6, 1.0), M["EArmor2"], K, taper=0.4)
    box((0, 1.4, 0.3), (0.9, 0.1, 0.12), M["EEye"], K)
    cyl((0, 0, -0.8), 0.9, 0.4, M["Frame"], K, verts=14)
    cyl((0, 0, -1.05), 0.7, 0.1, M["MagGlow"], K, verts=14)
    r = empty("DF_Ring", (0, 0, 0), K)
    torus((0, 0, 0), 2.1, 0.16, M["Rust"], r, rot=(0, math.pi / 2, 0))
    for k in range(8):
        a = k / 8 * math.pi * 2
        box((0, math.cos(a) * 2.1, math.sin(a) * 2.1), (0.45, 0.32, 0.32), M["MagGlow"] if k % 2 else M["Frame"], r, rot=(a, 0, 0))
    for s_ in (-1, 1):
        cyl((s_ * 1.05, 0, 0.1), 0.5, 0.2, M["EArmor2"], K, rot=(0, math.pi / 2, 0), verts=14, r2=0.7)
        cyl((s_ * 1.18, 0, 0.1), 0.3, 0.06, M["MagGlow"], K, rot=(0, math.pi / 2, 0), verts=12)
    for k in range(3):
        a = (k - 1) * 0.5
        box((math.sin(a) * 0.35, 1.5, -0.75), (0.12, 0.6, 0.12), M["Black"], K, rot=(0.5, a, 0))
    muzzle("Muzzle_DF", (0, 1.8, -0.9), K)

def build_minepod():
    K = kit("S_Mines")
    # mine dispenser: flat armoured box with four drum mines visible in a tray and a drop chute
    box((0, 0, 0), (0.95, 1.0, 0.55), M["Armor"], K, bevel=0.06)
    box((0, -0.55, -0.1), (0.7, 0.2, 0.3), M["Frame"], K)
    for i in range(2):
        for j in range(2):
            cyl((-0.22 + i * 0.44, -0.2 + j * 0.42, 0.3), 0.17, 0.1, M["Black"], K, verts=12)
            cyl((-0.22 + i * 0.44, -0.2 + j * 0.42, 0.36), 0.05, 0.04, M["StickyGlow"], K, verts=8)
    box((0.5, 0, 0), (0.06, 0.8, 0.4), M["Hazard"], K)
    muzzle("Muzzle_Mines", (0, -0.7, -0.2), K)

def build_smoke():
    K = kit("S_Smoke")
    # shoulder smoke launcher: three angled grey canister tubes on a cradle
    box((0, -0.1, 0.2), (0.7, 0.8, 0.32), M["Armor2"], K, bevel=0.05)
    for k in range(3):
        x = (k - 1) * 0.22
        cyl((x, 0.25, 0.52), 0.1, 0.62, M["SmokeTube"], K, rot=(-math.pi / 2 + 0.5, 0, 0), verts=10)
        cyl((x, 0.5, 0.68), 0.11, 0.05, M["Hazard"], K, rot=(-math.pi / 2 + 0.5, 0, 0), verts=10)
    box((0.36, -0.1, 0.2), (0.04, 0.6, 0.2), M["Accent"], K)
    muzzle("Muzzle_Smoke", (0, 0.6, 0.75), K)

def build_eel():
    # Eel: armoured serpent drone. Head and one body segment are separate kits; the game strings 9 segments behind the head. front = +Y
    K = kit("E_EelHead")
    box((0, 0.1, 0.05), (1.5, 2.2, 1.1), M["EelSkin"], K, bevel=0.2)
    box((0, 0.9, 0.3), (1.2, 1.2, 0.5), M["EArmor"], K, bevel=0.12)
    box((0, 1.0, -0.3), (1.1, 1.3, 0.35), M["EelSkin"], K, bevel=0.1, rot=(0.18, 0, 0))   # lower jaw
    for s_ in (-1, 1):
        box((s_ * 0.45, 1.45, 0.38), (0.22, 0.3, 0.14), M["EEye"], K)
        box((s_ * 0.85, -0.2, 0.0), (0.12, 1.1, 0.7), M["EArmor2"], K, rot=(0, 0, s_ * 0.5))   # gill fins
        for k in range(3):
            box((s_ * 0.6, 1.62, -0.05 - k * 0.0), (0.05, 0.08, 0.28), M["Joint"], K, rot=(0, 0, s_ * 0.3))
    box((0, -0.3, 0.75), (0.12, 1.6, 0.4), M["EelGlow"], K)      # dorsal glow ridge
    box((0, 0.6, 0.62), (0.5, 0.06, 0.08), M["Hazard"], K)
    box((0, -0.9, 0.0), (1.0, 0.4, 0.8), M["Frame"], K, bevel=0.06)
    muzzle("Muzzle_Eel", (0, 1.7, 0.0), K)

    S = kit("E_EelSeg")
    box((0, 0, 0), (1.2, 1.4, 0.95), M["EelSkin"], S, bevel=0.22)
    box((0, 0, 0.42), (0.9, 1.1, 0.25), M["EArmor"], S, bevel=0.08)
    box((0, 0, 0.66), (0.1, 1.0, 0.32), M["EelGlow"], S)
    for s_ in (-1, 1):
        box((s_ * 0.62, 0, -0.05), (0.08, 1.0, 0.5), M["EelGlow"], S)
        box((s_ * 0.75, -0.2, -0.1), (0.1, 0.6, 0.45), M["EArmor2"], S, rot=(0, 0, s_ * 0.6))

def build_sonar():
    K = kit("S_Sonar")
    # shoulder sonar: squat pod with a forward dish and a glowing emitter
    box((0, -0.15, 0.22), (0.6, 0.85, 0.36), M["Armor2"], K, bevel=0.05)
    box((0.31, -0.15, 0.26), (0.04, 0.75, 0.2), M["Accent"], K)
    cyl((0, 0.32, 0.5), 0.12, 0.3, M["Frame"], K, rot=(-math.pi / 2, 0, 0), verts=12)
    cyl((0, 0.5, 0.5), 0.2, 0.1, M["Frame"], K, rot=(-math.pi / 2, 0, 0), verts=16, r2=0.42)
    torus((0, 0.56, 0.5), 0.38, 0.035, M["Sonar"], K, rot=(math.pi / 2, 0, 0))
    ball((0, 0.52, 0.5), 0.11, M["Sonar"], K)
    for k in range(3):
        box((0, -0.5 + k * 0.16, 0.42), (0.4, 0.05, 0.03), M["Joint"], K)
    muzzle("Muzzle_Sonar", (0, 0.6, 0.5), K)

def build_disc():
    K = kit("W_Disc")
    # disc launcher: flat armoured cradle with a spring arm; the loaded blade disc DS_Disc rides on top (hidden while thrown)
    box((0, 0.15, 0.0), (0.44, 1.0, 0.36), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.22), (0.36, 0.7, 0.08), M["Armor"], K, bevel=0.02)
    box((0, 0.75, -0.05), (0.5, 0.5, 0.12), M["Armor2"], K, bevel=0.03)
    for s_ in (-1, 1):
        box((s_ * 0.3, 0.8, 0.05), (0.06, 0.6, 0.2), M["Joint"], K)
        box((s_ * 0.24, 0.3, -0.2), (0.05, 0.5, 0.12), M["Hazard"], K)
    d = empty("DS_Disc", (0, 0.85, 0.12), K)
    cyl((0, 0, 0), 0.42, 0.06, M["Joint"], d, verts=20, smooth=False)
    torus((0, 0, 0), 0.42, 0.035, M["DiscEdge"], d)
    cyl((0, 0, 0), 0.12, 0.1, M["DiscEdge"], d, verts=10)
    for k in range(6):
        a = k * math.pi / 3
        box((math.cos(a) * 0.44, math.sin(a) * 0.44, 0), (0.12, 0.05, 0.05), M["Frame"], d, rot=(0, 0, a + 0.6))
    muzzle("Muzzle_Disc", (0, 1.15, 0.12), K)

def build_cryo():
    K = kit("W_Cryo")
    # cryo lance: boxy receiver with two frost canisters, long finned emitter ending in a glowing ice-blue crystal
    box((0, 0.1, 0.04), (0.4, 0.95, 0.42), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.28), (0.32, 0.7, 0.1), M["Armor"], K, bevel=0.02)
    for s_ in (-1, 1):
        cyl((s_ * 0.24, 0.1, -0.24), 0.13, 0.7, M["Ice"], K, rot=ALONG_Y, verts=10)
        cyl((s_ * 0.24, 0.1, -0.24), 0.145, 0.08, M["Frame"], K, rot=ALONG_Y, verts=10)
    cyl((0, 0.95, 0.04), 0.11, 0.9, M["Piston"], K, rot=ALONG_Y, verts=10)
    for i in range(4):
        box((0, 0.68 + i * 0.17, 0.04), (0.34, 0.04, 0.34), M["Joint"], K, rot=(0, math.pi / 4, 0))
    ball((0, 1.45, 0.04), 0.1, M["Ice"], K, scale=(1, 1.6, 1))
    box((0.22, 0.3, 0.04), (0.04, 0.5, 0.2), M["Accent"], K)
    muzzle("Muzzle_Cryo", (0, 1.58, 0.04), K)

def build_grav():
    K = kit("S_Grav")
    # shoulder gravity-well launcher: armoured cradle holding a dark singularity sphere inside violet rings
    box((0, -0.1, 0.24), (0.66, 0.9, 0.36), M["Armor2"], K, bevel=0.05)
    box((0.34, -0.1, 0.3), (0.05, 0.8, 0.26), M["Accent"], K)
    ball((0, 0.18, 0.62), 0.27, M["Black"], K)
    torus((0, 0.18, 0.62), 0.36, 0.035, M["Grav"], K, rot=(math.pi / 2, 0, 0))
    torus((0, 0.18, 0.62), 0.33, 0.03, M["Grav"], K, rot=(0, math.pi / 2, 0))
    cyl((0, 0.18, 0.62), 0.12, 0.6, M["Grav"], K, rot=(-math.pi / 2, 0, 0), verts=10)
    for s_ in (-1, 1):
        box((s_ * 0.3, 0.18, 0.5), (0.08, 0.3, 0.4), M["Frame"], K)
    box((0, -0.5, 0.24), (0.5, 0.03, 0.2), M["Hazard"], K)
    muzzle("Muzzle_Grav", (0, 0.55, 0.62), K)

def build_decoy():
    K = kit("S_Decoy")
    # shoulder holo projector: slim housing with a lens array on top and a folded antenna
    box((0, 0.0, 0.28), (0.6, 0.95, 0.42), M["Armor2"], K, bevel=0.05)
    box((0, -0.1, 0.55), (0.48, 0.6, 0.14), M["Frame"], K, bevel=0.03)
    for i in range(3):
        cyl((-0.15 + i * 0.15, 0.24, 0.66), 0.06, 0.08, M["EmpGlow"], K, verts=10)
    cyl((0, 0.32, 0.6), 0.16, 0.06, M["EmpGlow"], K, verts=16)
    box((0.32, 0, 0.3), (0.04, 0.8, 0.24), M["Accent"], K)
    cyl((-0.22, -0.38, 0.85), 0.025, 0.55, M["Frame"], K, rot=(0.35, 0, 0))
    box((0, 0.49, 0.28), (0.44, 0.03, 0.18), M["Hazard"], K)
    muzzle("Muzzle_Decoy", (0, 0.32, 0.7), K)

def build_dropship():
    # Dropship: twin-fan VTOL troop carrier, ~10 m long. Cargo pod E_DPod hangs under the belly. front = +Y
    K = kit("E_Dropship")
    box((0, 0, 0), (2.6, 7.0, 1.8), M["EArmor"], K, bevel=0.15)
    wedge((0, 4.1, 0.15), (2.2, 1.4, 1.4), M["EArmor2"], K, taper=0.45, bevel=0.08)
    box((0, 4.2, 0.62), (1.4, 0.9, 0.12), M["Glass"], K, rot=(0.45, 0, 0))
    box((0, 4.75, 0.05), (1.0, 0.08, 0.14), M["EEye"], K)
    box((0, 0.2, 1.05), (1.6, 4.6, 0.4), M["EArmor2"], K, bevel=0.06)
    box((0, -3.9, 0.55), (1.4, 1.4, 0.9), M["EArmor2"], K, bevel=0.06)
    for s_ in (-1, 1):
        box((s_ * 0.9, -4.4, 1.5), (0.12, 1.2, 1.4), M["EArmor"], K, rot=(0, s_ * 0.3, 0))
        box((s_ * 2.0, 0.6, 0.35), (1.6, 1.0, 0.3), M["Frame"], K)
        torus((s_ * 3.4, 0.6, 0.55), 1.25, 0.2, M["EArmor2"], K)
        torus((s_ * 3.4, 0.6, 0.2), 1.25, 0.2, M["EArmor2"], K)
        cyl((s_ * 3.4, 0.6, 0.05), 1.1, 0.06, M["Black"], K, verts=20)
        cyl((s_ * 3.4, 0.6, 0.3), 0.25, 0.4, M["Frame"], K, verts=10)
        fan = empty(f"E_DFan{'L' if s_ < 0 else 'R'}", (s_ * 3.4, 0.6, 0.45), K)
        for a in range(3):
            box((0, 0, 0), (2.1, 0.22, 0.05), M["Frame"], fan, rot=(0, 0, a * math.pi / 3))
        cyl((s_ * 3.4, 0.6, -0.12), 0.95, 0.06, M["NozzleGlow"], K, verts=16)
        box((s_ * 1.32, -1.0, -0.3), (0.06, 3.6, 0.12), M["Hazard"], K)
        box((s_ * 1.0, 1.8, -1.2), (0.16, 0.16, 1.0), M["Frame"], K)
        box((s_ * 1.0, -1.8, -1.2), (0.16, 0.16, 1.0), M["Frame"], K)
    box((0, 0, -0.98), (2.2, 4.2, 0.16), M["Frame"], K)
    ball((0, 2.6, -1.0), 0.18, M["EEye"], K)
    pod = empty("E_DPod", (0, 0, -2.3), K)
    box((0, 0, 0), (2.3, 3.8, 2.2), M["EArmor2"], pod, bevel=0.08)
    for i in range(4):
        box((0, -1.4 + i * 0.95, 0), (2.34, 0.12, 2.0), M["Frame"], pod)
    for s_ in (-1, 1):
        box((s_ * 1.18, 0, 0.6), (0.04, 3.2, 0.25), M["Hazard"], pod)
    box((0, 1.92, 0.2), (1.4, 0.04, 1.2), M["Black"], pod)
    ball((0, 1.95, 0.95), 0.12, M["Ammo"], pod)

def build_crawler():
    # Crawler: suicide spider bomb, ~1.6 m across. front = +Y
    K = kit("E_Crawler")
    body = empty("E_CBody", (0, 0, 0.72), K)
    ball((0, 0, 0), 0.5, M["EArmor"], body, scale=(1, 1.15, 0.6))
    ball((0, 0, 0.12), 0.36, M["EArmor2"], body, scale=(1, 1, 0.7))
    box((0, 0.52, 0.0), (0.36, 0.1, 0.1), M["EEye"], body)
    box((0, -0.46, 0.05), (0.32, 0.18, 0.18), M["Hazard"], body)
    for s_ in (-1, 1):
        box((s_ * 0.42, 0, 0.12), (0.06, 0.6, 0.06), M["Hazard"], body)
    bl = empty("E_CBlink", (0, 0, 0.34), body)
    ball((0, 0, 0), 0.15, M["EEye"], bl)
    for i, (x, y) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):
        leg = empty(f"E_KLeg{i + 1}", (x * 0.34, y * 0.34, -0.05), body, rot=(0, 0, math.atan2(y, x)))
        ball((0, 0, 0), 0.11, M["Joint"], leg)
        box((0.34, 0, 0.12), (0.68, 0.12, 0.12), M["Frame"], leg, rot=(0, math.radians(-22), 0))
        box((0.815, 0, -0.2), (0.1, 0.1, 0.93), M["Frame"], leg, rot=(0, math.radians(-17), 0))
        ball((0.68, 0, 0.24), 0.08, M["Joint"], leg)

def build_cache():
    # data cache terminal for the extraction mission, ~3.7 m tall. front = +Y
    K = kit("F_Cache")
    box((0, 0, 0.15), (2.6, 1.8, 0.3), M["Concrete"], K, bevel=0.03)
    box((0, 0, 1.3), (1.6, 1.0, 2.0), M["Frame"], K, bevel=0.06)
    box((0, 0.51, 1.55), (1.2, 0.04, 0.85), M["Visor"], K)
    box((0, 0.52, 0.75), (1.2, 0.04, 0.25), M["Black"], K)
    for i in range(4):
        box((0, -0.51, 0.6 + i * 0.4), (1.3, 0.04, 0.1), M["Ammo"], K)
    for s_ in (-1, 1):
        box((s_ * 0.83, 0, 1.3), (0.06, 0.8, 1.8), M["Hazard"], K)
        cyl((s_ * 1.05, 0.55, 0.45), 0.09, 0.5, M["Black"], K, rot=ALONG_Y, verts=8)
    cyl((0.5, 0.2, 2.95), 0.05, 1.5, M["Joint"], K)
    ball((0.5, 0.2, 3.72), 0.12, M["EEye"], K)
    cyl((-0.4, -0.1, 2.45), 0.36, 0.3, M["Armor2"], K)
    cyl((-0.4, -0.1, 2.62), 0.2, 0.06, M["Visor"], K)

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

def build_stalker():
    # Stalker: slim cloaking sniper biped, ~4.6 m. front = +Y. Body hangs off E_SBody, legs swing about X at E_SLeg1/2
    K = kit("E_Stalker")
    body = empty("E_SBody", (0, 0, 2.55), K)
    box((0, 0, 0), (0.9, 0.6, 0.45), M["SArmor2"], body, bevel=0.05)               # pelvis
    wedge((0, 0.05, 0.75), (1.0, 0.75, 1.0), M["SArmor"], body, taper=0.7, bevel=0.05)  # torso
    box((0, -0.42, 0.85), (0.7, 0.25, 0.8), M["SArmor2"], body, bevel=0.04)        # cloak generator pack
    for i in range(3):
        box((0, -0.56, 0.6 + i * 0.25), (0.5, 0.04, 0.06), M["ShieldEmit"], body)
    head = empty("E_SHead", (0, 0.12, 1.42), body)
    box((0, 0, 0), (0.42, 0.5, 0.3), M["SArmor"], head, bevel=0.04)
    box((0, 0.26, 0.02), (0.3, 0.04, 0.07), M["EEye"], head)
    cyl((0.18, -0.1, 0.32), 0.025, 0.5, M["Frame"], head, verts=6)
    gun = empty("E_SGun", (0.6, 0.15, 0.95), body)
    box((0, 0.1, 0), (0.22, 0.9, 0.28), M["SArmor2"], gun, bevel=0.03)
    cyl((0, 1.6, 0.02), 0.06, 2.4, M["Frame"], gun, rot=ALONG_Y, verts=8)
    cyl((0, 2.85, 0.02), 0.1, 0.18, M["SArmor"], gun, rot=ALONG_Y, verts=8)
    cyl((0, 0.35, 0.22), 0.07, 0.55, M["Black"], gun, rot=ALONG_Y, verts=8)
    cyl((0, 0.64, 0.22), 0.05, 0.03, M["EEye"], gun, rot=ALONG_Y, verts=8)
    for sx in (-1, 1):
        box((sx * 0.1, 1.2, -0.12), (0.04, 0.4, 0.06), M["Rail"], gun)
    muzzle("Muzzle_Stalker", (0, 2.98, 0.02), gun)
    for i, sx in enumerate((-1, 1)):
        leg = empty(f"E_SLeg{i + 1}", (sx * 0.3, 0, -0.1), body)
        ball((0, 0, 0), 0.17, M["Joint"], leg)
        box((0, 0.22, -0.6), (0.22, 0.24, 1.25), M["SArmor"], leg, rot=(math.radians(-18), 0, 0), bevel=0.03)
        ball((0, 0.42, -1.2), 0.14, M["Joint"], leg)
        box((0, 0.2, -1.8), (0.16, 0.16, 1.25), M["Frame"], leg, rot=(math.radians(18), 0, 0), bevel=0.02)
        box((0, 0.12, -2.38), (0.3, 0.6, 0.12), M["SArmor2"], leg, bevel=0.02)

def build_colossus():
    # Colossus: ~20 m quadruped siege walker. front = +Y. Breakable parts: E_CPodL (missile pod), E_CPodR (cannon pod),
    # E_CCore (belly core). Legs hang from hip empties E_CLeg0..3 (swing about X).
    K = kit("E_Colossus")
    box((0, 0, 13.5), (13, 15, 3.2), M["EArmor"], K, bevel=0.2)                  # main deck
    wedge((0, 8.6, 13.4), (11, 2.4, 2.8), M["EArmor"], K, taper=0.5, bevel=0.1)    # prow
    box((0, -1, 15.9), (9, 10, 1.8), M["EArmor2"], K, bevel=0.15)                 # upper deck
    box((0, -8.2, 14.2), (10, 1.8, 3.6), M["Frame"], K, bevel=0.1)                # rear engine block
    for i in range(4):
        cyl((-3.6 + i * 2.4, -9.3, 15.6), 0.5, 1.6, M["Nozzle"], K, rot=ALONG_Y, verts=10)
        cyl((-3.6 + i * 2.4, -10.1, 15.6), 0.32, 0.1, M["NozzleGlow"], K, rot=ALONG_Y, verts=10)
    for sx in (-1, 1):
        box((sx * 6.6, 0, 13.5), (0.3, 13, 2.2), M["Hazard"], K)
        for j in range(5):
            box((sx * 6.75, -5 + j * 2.5, 14.2), (0.2, 1.4, 0.5), M["Frame"], K)
    # sensor head
    box((0, 8.4, 16.2), (4.2, 3.4, 2.2), M["EArmor2"], K, bevel=0.15)
    box((0, 10.12, 16.4), (3.2, 0.08, 0.5), M["EEye"], K)
    for sx in (-1, 1):
        ball((sx * 1.2, 10.05, 15.6), 0.32, M["EEye"], K)
    cyl((1.6, 6.8, 18.4), 0.08, 2.6, M["Frame"], K, verts=6)
    ball((1.6, 6.8, 19.75), 0.18, M["EEye"], K)
    # belly core (weak point) under the deck, caged
    core = empty("E_CCore", (0, 0, 10.4), K)
    ball((0, 0, 0), 2.1, M["Plasma"], core, sub=2)
    torus((0, 0, 0), 2.5, 0.28, M["Frame"], core)
    torus((0, 0, 0), 2.5, 0.28, M["Frame"], core, rot=(math.pi / 2, 0, 0))
    cyl((0, 0, 1.9), 1.4, 1.2, M["Frame"], core, verts=10)
    # pods on the upper deck
    pl = empty("E_CPodL", (-4.2, 1.5, 17.9), K)
    box((0, 0, 0), (3.4, 4.6, 2.6), M["EArmor"], pl, bevel=0.12)
    for ix in range(3):
        for iz in range(2):
            cyl((-1.0 + ix * 1.0, 2.32, -0.5 + iz * 1.0), 0.36, 0.2, M["Black"], pl, rot=ALONG_Y, verts=8)
            cyl((-1.0 + ix * 1.0, 2.38, -0.5 + iz * 1.0), 0.18, 0.08, M["EEye"], pl, rot=ALONG_Y, verts=8)
    box((-1.75, 0, 0), (0.12, 3.8, 1.4), M["Hazard"], pl)
    empty("Muzzle_CPodL", (0, 2.6, 0.4), pl)
    pr = empty("E_CPodR", (4.2, 1.5, 17.9), K)
    box((0, -0.6, 0), (3.2, 3.6, 2.4), M["EArmor"], pr, bevel=0.12)
    for sx in (-0.65, 0.65):
        cyl((sx, 2.8, 0.1), 0.42, 4.6, M["Frame"], pr, rot=ALONG_Y, verts=12)
        cyl((sx, 5.1, 0.1), 0.55, 0.5, M["Joint"], pr, rot=ALONG_Y, verts=12)
    box((1.65, -0.6, 0), (0.12, 2.8, 1.2), M["Hazard"], pr)
    empty("Muzzle_CPodR", (0, 5.5, 0.1), pr)
    # legs: hip at deck corner, thigh out/down to a knee, shin to a broad foot
    for i, (sx, sy) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
        hip = empty(f"E_CLeg{i}", (sx * 5.6, sy * 5.4, 12.6), K)
        ball((0, 0, 0), 1.5, M["Joint"], hip)
        # thigh: from hip (0,0,0) to knee (sx*4.4, sy*3.0, 1.4)
        kx, ky, kz = sx * 4.4, sy * 3.0, 1.6
        L = math.sqrt(kx * kx + ky * ky + kz * kz)
        ax = math.atan2(math.hypot(kx, ky), kz)
        az = math.atan2(ky, kx) - math.pi / 2
        box((kx / 2, ky / 2, kz / 2), (1.6, 1.6, L), M["EArmor2"], hip, rot=(ax, 0, az + math.pi), bevel=0.1)
        ball((kx, ky, kz), 1.1, M["Joint"], hip)
        # shin straight down to the foot
        box((kx, ky, (kz - 12.0) / 2 + kz / 2 - kz / 2), (1.3, 1.3, 12.0 + kz), M["Frame"], hip, bevel=0.08)
        box((kx, ky, -6.2), (1.7, 1.7, 3.0), M["EArmor"], hip, bevel=0.1)
        cyl((kx, ky, -12.1), 1.9, 1.0, M["EArmor2"], hip, verts=8, smooth=False)
        box((kx, ky, -6.2 + 1.2), (1.75, 1.75, 0.3), M["Hazard"], hip)

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

def build_truck():
    # friendly 8x8 armored transport for the escort mission: ~10 m long, front = +Y, wheels F_TW0..7 spin about X
    K = kit("F_Truck")
    box((0, -0.6, 1.9), (3.4, 7.4, 1.6), M["Armor2"], K, bevel=0.08)            # lower hull
    wedge((0, 3.85, 1.85), (3.4, 1.4, 1.5), M["Armor2"], K, taper=0.55, bevel=0.05)
    box((0, 2.25, 3.25), (3.2, 2.2, 1.3), M["Armor"], K, bevel=0.1)              # cab
    box((0, 3.33, 3.35), (2.7, 0.08, 0.55), M["Visor"], K)                       # windshield strip
    for sx in (-1, 1):
        box((sx * 1.62, 2.4, 3.4), (0.06, 1.2, 0.4), M["Visor"], K)
        box((sx * 1.2, 4.42, 2.1), (0.5, 0.08, 0.26), M["NozzleGlow"], K)        # headlights
        box((sx * 1.74, -0.6, 2.35), (0.1, 7.0, 0.22), M["Hazard"], K)          # side stripe
    box((0, -1.7, 3.6), (3.3, 5.0, 2.0), M["Armor"], K, bevel=0.06)              # cargo module
    for i in range(6):
        box((0, -3.9 + i * 0.88, 4.62), (3.0, 0.14, 0.06), M["Armor2"], K)
    box((0, -1.7, 4.68), (1.2, 1.2, 0.08), M["Accent"], K)
    cyl((0.9, -3.4, 5.1), 0.06, 1.6, M["Frame"], K, verts=6)                    # antenna
    ball((0.9, -3.4, 5.95), 0.12, M["EEye"], K)
    box((0, -4.35, 2.4), (2.6, 0.12, 1.0), M["Frame"], K)
    for sx in (-1, 1):
        box((sx * 1.05, -4.42, 2.2), (0.4, 0.06, 0.18), M["EEye"], K)          # tail lights
    for i, y in enumerate((2.6, 1.0, -1.6, -3.2)):
        for j, sx in enumerate((-1, 1)):
            w = empty(f"F_TW{i * 2 + j}", (sx * 1.75, y, 0.78), K)
            cyl((0, 0, 0), 0.78, 0.55, M["Black"], w, rot=(0, math.pi / 2, 0), verts=14)
            cyl((sx * 0.29, 0, 0), 0.42, 0.04, M["Joint"], w, rot=(0, math.pi / 2, 0), verts=10)
            box((sx * 0.3, 0, 0), (0.05, 0.9, 0.16), M["Frame"], w)

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

def build_rammer():
    # Rammer: a low six-wheeled assault tank with a huge wedge ram plow (RM_Plow) in front, a thick front glacis,
    # wheels RM_Wheel1..6 (spin around X), two glowing exhaust vents at the back (its weak side), and a small
    # roof gun (RM_Gun, Muzzle_RM). front = +Y
    K = kit("E_Rammer")
    box((0, 0, 1.5), (3.4, 5.2, 1.5), M["EArmor"], K, bevel=0.2)
    box((0, -0.4, 2.55), (2.6, 3.2, 0.7), M["EArmor2"], K, bevel=0.15)
    wedge((0, 2.3, 1.7), (3.2, 1.2, 1.7), M["EArmor2"], K, taper=0.5)
    box((0, 0.9, 2.95), (1.4, 0.12, 0.12), M["EEye"], K)
    for s_ in (-1, 1):
        box((s_ * 1.85, 0, 1.1), (0.4, 5.4, 0.9), M["Frame"], K)
        for k in range(3):
            w = empty("RM_Wheel%d" % (k * 2 + (1 if s_ < 0 else 2)), (s_ * 1.85, -1.8 + k * 1.8, 0.75), K)
            cyl((0, 0, 0), 0.75, 0.5, M["Black"], w, rot=(0, math.pi / 2, 0), verts=14)
            cyl((s_ * 0.27, 0, 0), 0.35, 0.06, M["Joint"], w, rot=(0, math.pi / 2, 0), verts=10)
            box((s_ * 0.28, 0, 0), (0.06, 1.1, 0.16), M["Hazard"], w)
    pl = empty("RM_Plow", (0, 3.1, 1.3), K)
    wedge((0, 0.2, 0), (4.2, 1.0, 2.2), M["Rust"], pl, taper=0.25)
    for k in range(5):
        box(((k - 2) * 0.8, 0.75, -0.6), (0.25, 0.5, 0.5), M["Frame"], pl, rot=(0.6, 0, 0))
    box((0, 0.15, 1.15), (4.0, 0.3, 0.14), M["Hazard"], pl)
    for s_ in (-1, 1):
        box((s_ * 0.85, -2.65, 1.9), (0.9, 0.2, 0.8), M["RamGlow"], K)
        box((s_ * 0.85, -2.72, 1.9), (1.05, 0.12, 0.12), M["Frame"], K)
        cyl((s_ * 0.85, -2.4, 3.0), 0.22, 0.9, M["Frame"], K, verts=10)
    g = empty("RM_Gun", (0, -0.6, 3.1), K)
    box((0, 0, 0.2), (0.8, 0.9, 0.45), M["EArmor"], g, bevel=0.06)
    cyl((0, 0.85, 0.25), 0.09, 1.1, M["Joint"], g, rot=ALONG_Y, verts=8)
    muzzle("Muzzle_RM", (0, 1.45, 3.35), K)

def build_ricochet():
    K = kit("W_Ricochet")
    # ricochet gun: slab receiver with a green-lit angled deflector vane over the muzzle and a drum magazine
    box((0, 0.1, 0.05), (0.42, 0.95, 0.4), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.28), (0.34, 0.7, 0.08), M["Armor"], K, bevel=0.02)
    cyl((0.3, 0.05, -0.05), 0.2, 0.18, M["Armor2"], K, rot=(0, math.pi / 2, 0), verts=14)
    cyl((0.4, 0.05, -0.05), 0.12, 0.04, M["RicoGlow"], K, rot=(0, math.pi / 2, 0), verts=10)
    cyl((0, 1.0, 0.06), 0.09, 0.9, M["Joint"], K, rot=ALONG_Y, verts=10)
    box((0, 1.38, 0.2), (0.34, 0.12, 0.05), M["RicoGlow"], K, rot=(0.5, 0, 0))
    box((0, 1.3, -0.08), (0.3, 0.3, 0.04), M["Armor2"], K, rot=(-0.4, 0, 0))
    box((-0.22, 0.3, 0.05), (0.04, 0.5, 0.2), M["Hazard"], K)
    muzzle("Muzzle_Ricochet", (0, 1.5, 0.06), K)


def build_leaper():
    # Leaper: a hunched biped on two long digitigrade legs (LP_LegL / LP_LegR, pivot at the hip, rotate around X
    # to crouch), a wedge head with a slit eye, two jump-jet vents on the back and a twin scattergun under the chin
    # (Muzzle_LP). Origin at the feet. front = +Y
    K = kit("E_Leaper")
    box((0, 0, 4.0), (2.0, 2.4, 1.5), M["EArmor"], K, bevel=0.2)
    wedge((0, 1.4, 4.2), (1.5, 1.0, 1.0), M["EArmor2"], K, taper=0.45)
    box((0, 1.95, 4.3), (0.9, 0.1, 0.14), M["EEye"], K)
    box((0, -0.6, 4.9), (1.6, 1.4, 0.4), M["EArmor2"], K, bevel=0.08)
    for s_ in (-1, 1):
        box((s_ * 0.55, -1.25, 4.2), (0.5, 0.25, 0.8), M["RamGlow"], K)
        cyl((s_ * 0.55, -1.15, 3.6), 0.28, 0.5, M["Frame"], K, verts=10)
        leg = empty("LP_Leg" + ("L" if s_ < 0 else "R"), (s_ * 0.95, 0, 3.4), K)
        box((0, -0.55, -0.75), (0.5, 0.55, 1.8), M["EArmor"], leg, rot=(-0.55, 0, 0), bevel=0.08)
        box((0, -0.85, -2.25), (0.36, 0.36, 1.6), M["Frame"], leg, rot=(0.45, 0, 0))
        box((0, -0.25, -3.25), (0.55, 1.3, 0.3), M["Black"], leg, bevel=0.05)
        ball((0, -0.95, -1.55), 0.3, M["Joint"], leg, sub=1)
        box((s_ * 0.3, -0.55, -0.7), (0.06, 0.4, 1.2), M["Hazard"], leg, rot=(-0.55, 0, 0))
    g = empty("LP_Gun", (0, 1.3, 3.35), K)
    box((0, 0, 0), (0.9, 0.7, 0.45), M["Frame"], g, bevel=0.05)
    for s_ in (-1, 1):
        cyl((s_ * 0.22, 0.6, 0), 0.12, 0.8, M["Joint"], g, rot=ALONG_Y, verts=10)
    muzzle("Muzzle_LP", (0, 2.3, 3.35), K)

def build_needler():
    K = kit("W_Needler")
    # needler: slim receiver, a clear-topped magazine full of glowing pink needles, a narrow fluted barrel
    box((0, 0.1, 0.05), (0.38, 0.9, 0.38), M["Frame"], K, bevel=0.05)
    box((0, 0.05, 0.26), (0.3, 0.7, 0.07), M["Armor"], K, bevel=0.02)
    for k in range(5):
        cyl((-0.08 + k * 0.04, 0.15, 0.36), 0.018, 0.34, M["NeedleGlow"], K, rot=ALONG_Y, verts=6)
    box((0, 0.15, 0.36), (0.26, 0.42, 0.03), M["Black"], K)
    cyl((0, 0.95, 0.06), 0.07, 0.8, M["Joint"], K, rot=ALONG_Y, verts=10)
    cyl((0, 1.35, 0.06), 0.1, 0.12, M["NeedleGlow"], K, rot=ALONG_Y, verts=10)
    box((-0.21, 0.3, 0.05), (0.04, 0.5, 0.2), M["Hazard"], K)
    muzzle("Muzzle_Needler", (0, 1.45, 0.06), K)


def build_herald():
    # Herald: a squat four-legged command walker carrying a tall signal mast with a glowing red banner (HR_Banner,
    # pivots at the mast so it can sway), two loudspeaker horns near the top and a light gun under the chin
    # (Muzzle_HR). Origin at the feet. front = +Y
    K = kit("E_Herald")
    box((0, 0, 2.3), (2.6, 3.0, 1.3), M["EArmor"], K, bevel=0.2)
    box((0, 0.2, 3.1), (1.9, 2.0, 0.5), M["EArmor2"], K, bevel=0.1)
    box((0, 1.55, 2.4), (1.2, 0.2, 0.3), M["EEye"], K)
    for sx in (-1, 1):
        for sy in (-1, 1):
            box((sx * 1.35, sy * 1.15, 1.2), (0.4, 0.4, 2.0), M["Frame"], K, rot=(sy * 0.25, -sx * 0.25, 0), bevel=0.05)
            box((sx * 1.6, sy * 1.4, 0.15), (0.7, 0.7, 0.3), M["Black"], K, bevel=0.05)
            ball((sx * 1.3, sy * 1.1, 2.0), 0.3, M["Joint"], K, sub=1)
    cyl((0, -0.6, 6.2), 0.16, 6.2, M["Frame"], K, verts=10)
    for z in (4.0, 6.0, 8.0):
        torus((0, -0.6, z), 0.3, 0.06, M["Joint"], K)
    b = empty("HR_Banner", (0, -0.6, 8.6), K)
    box((0, -0.95, -1.1), (0.08, 1.8, 2.4), M["HeraldGlow"], b)
    box((0, -0.95, 0.15), (0.12, 1.9, 0.12), M["Frame"], b)
    for sx in (-1, 1):
        cyl((sx * 0.55, -0.35, 8.9), 0.12, 0.8, M["EArmor2"], K, rot=(0, sx * math.pi / 2 * 0.9, 0), r2=0.38, verts=12)
    ball((0, -0.6, 9.45), 0.28, M["HeraldGlow"], K, sub=1)
    g = empty("HR_Gun", (0, 1.4, 1.75), K)
    box((0, 0, 0), (0.7, 0.6, 0.4), M["Frame"], g, bevel=0.05)
    cyl((0, 0.55, 0), 0.1, 0.8, M["Joint"], g, rot=ALONG_Y, verts=10)
    muzzle("Muzzle_HR", (0, 2.4, 1.75), K)

def build_rod():
    # Lightning rod: a tripod foot, a tall segmented mast with coil rings and a glowing tip (RD_Tip).
    # Used both as the LR-1 deployable (scale ~1) and as the storm towers in the arena (scale ~2.4). front = +Y
    K = kit("D_Rod")
    cyl((0, 0, 0.25), 0.7, 0.3, M["Frame"], K, verts=16)
    for i in range(3):
        a = i / 3 * math.pi * 2
        box((math.cos(a) * 0.9, math.sin(a) * 0.9, 0.2), (0.18, 0.18, 1.0), M["Joint"], K, rot=(math.sin(a) * 0.9, -math.cos(a) * 0.9, 0))
        box((math.cos(a) * 1.3, math.sin(a) * 1.3, 0.05), (0.36, 0.36, 0.1), M["Hazard"], K)
    cyl((0, 0, 3.4), 0.13, 6.2, M["Frame"], K, verts=10)
    cyl((0, 0, 0.9), 0.32, 1.0, M["Armor2"], K, verts=12)
    for z in (2.0, 3.2, 4.4, 5.6):
        torus((0, 0, z), 0.34, 0.07, M["RodGlow"] if z > 5 else M["Joint"], K)
    t = empty("RD_Tip", (0, 0, 6.7), K)
    cyl((0, 0, 0.0), 0.08, 0.7, M["Joint"], t, verts=8, r2=0.01)
    ball((0, 0, -0.25), 0.18, M["RodGlow"], t, sub=1)

def build_rod_pack():
    K = kit("S_Rod")
    # shoulder rack carrying a folded rod: a long cradle with the mast lying along it, glowing tip forward
    box((0, -0.1, 0.25), (0.62, 1.1, 0.4), M["Armor2"], K, bevel=0.05)
    cyl((0, 0.05, 0.55), 0.07, 1.2, M["Frame"], K, rot=ALONG_Y, verts=8)
    ball((0, 0.7, 0.55), 0.1, M["RodGlow"], K, sub=1)
    for y in (-0.3, 0.15):
        torus((0, y, 0.55), 0.14, 0.035, M["Joint"], K, rot=ALONG_Y)
    for sx in (-1, 1):
        box((sx * 0.34, -0.1, 0.25), (0.05, 0.9, 0.12), M["Hazard"], K)
    muzzle("Muzzle_RodPack", (0, 0.8, 0.55), K)


def build_truck():
    # armoured highway truck: cab at the front (+Y), long box trailer, six axles of black wheels, headlights and
    # red tail lights. About 13 m long, 3.2 m wide, 4.2 m tall. Origin at the ground centre. front = +Y
    K = kit("P_Truck")
    box((0, 4.6, 1.75), (3.0, 3.0, 2.6), M["TruckRed"], K, bevel=0.2)
    box((0, 5.95, 2.4), (2.6, 0.2, 1.0), M["Glass"], K)
    box((0, 6.15, 1.0), (3.1, 0.3, 0.6), M["Black"], K, bevel=0.05)
    for sx in (-1, 1):
        box((sx * 1.15, 6.12, 1.3), (0.45, 0.12, 0.3), M["Headlight"], K)
        box((sx * 1.3, -6.42, 1.4), (0.35, 0.1, 0.25), M["EEye"], K)
        for y in (5.0, 1.8, 0.6, -3.0, -4.2, -5.4):
            cyl((sx * 1.4, y, 0.55), 0.55, 0.45, M["Black"], K, rot=(0, math.pi / 2, 0), verts=14)
    box((0, -1.3, 2.35), (3.2, 10.0, 3.6), M["Trailer"], K, bevel=0.08)
    for y in (-5.5, -3.0, -0.5, 2.0):
        box((0, y, 2.35), (3.26, 0.12, 3.4), M["Frame"], K)
    box((0, -1.3, 0.45), (2.6, 10.0, 0.35), M["Frame"], K)
    for sx in (-1, 1):
        box((sx * 1.62, -1.3, 1.0), (0.06, 9.6, 0.16), M["Hazard"], K)

def build_leech():
    # Leech: a fist-sized parasite drone (about 1.4 m): a bulbous glowing green sac, a dark carapace, four hooked
    # claws reaching forward (LC_Claw*) and a little rotor ring underneath. front = +Y
    K = kit("E_Leech")
    ball((0, -0.1, 0.0), 0.55, M["AcidGlow"], K, scale=(1, 1.25, 0.9), sub=2)
    ball((0, 0.1, 0.2), 0.55, M["EArmor"], K, scale=(1.1, 1.0, 0.7), sub=1)
    box((0, 0.6, 0.15), (0.5, 0.1, 0.12), M["EEye"], K)
    for i, (sx, sz) in enumerate(((-1, 1), (1, 1), (-1, -1), (1, -1))):
        c = empty("LC_Claw%d" % (i + 1), (sx * 0.35, 0.45, sz * 0.2), K)
        box((sx * 0.1, 0.3, 0), (0.12, 0.6, 0.12), M["Frame"], c, rot=(0, 0, -sx * 0.4))
        box((sx * 0.25, 0.65, -sz * 0.1), (0.1, 0.3, 0.1), M["Joint"], c, rot=(sz * 0.6, 0, 0))
    torus((0, -0.1, -0.5), 0.45, 0.05, M["Joint"], K)

def build_acid():
    K = kit("W_Acid")
    # acid sprayer: a squat receiver, a glass tank of glowing green fluid on top, a flared nozzle
    box((0, 0.05, 0.05), (0.42, 0.9, 0.4), M["Frame"], K, bevel=0.05)
    cyl((0, 0.05, 0.42), 0.17, 0.55, M["AcidGlow"], K, rot=ALONG_Y, verts=12)
    for y in (-0.22, 0.32):
        torus((0, y, 0.42), 0.19, 0.035, M["Joint"], K, rot=ALONG_Y)
    cyl((0, 0.8, 0.05), 0.09, 0.6, M["Joint"], K, rot=ALONG_Y, verts=10)
    cyl((0, 1.15, 0.05), 0.1, 0.22, M["Armor2"], K, rot=ALONG_Y, verts=12, r2=0.17)
    box((0.23, 0.2, 0.05), (0.04, 0.5, 0.22), M["Hazard"], K)
    muzzle("Muzzle_Acid", (0, 1.28, 0.05), K)


def build_rift():
    # rift gate: a tall dark ring (inner radius ~3.2 m, centre 4 m up) held by two angled pylons on a base slab,
    # glowing violet rune strips on the ring and pylons. The swirling disc is added in JS. Ring faces +Y. origin = ground
    K = kit("P_Rift")
    torus((0, 0, 4.0), 3.55, 0.38, M["RiftStone"], K, rot=ALONG_Y)
    torus((0, 0, 4.0), 3.2, 0.09, M["RiftGlow"], K, rot=ALONG_Y)
    for i in range(8):
        a = i * math.pi / 4
        box((math.cos(a) * 3.55, 0, 4.0 + math.sin(a) * 3.55), (0.5, 0.9, 0.5), M["Frame"], K, rot=(0, -a, 0), bevel=0.05)
    for sx in (-1, 1):
        box((sx * 3.7, 0, 1.0), (0.9, 1.3, 2.4), M["RiftStone"], K, bevel=0.1)
        box((sx * 3.7, 0.66, 1.2), (0.12, 0.04, 1.6), M["RiftGlow"], K)
        box((sx * 3.7, -0.66, 1.2), (0.12, 0.04, 1.6), M["RiftGlow"], K)
    box((0, 0, 0.12), (9.0, 2.2, 0.24), M["RiftStone"], K, bevel=0.06)
    box((0, 0, 0.26), (6.0, 0.18, 0.04), M["RiftGlow"], K)

def build_disarmer():
    # Disarmer: a hovering violet-eyed drone (about 3 m wide): a squat armoured hull, a big glowing orb emitter in
    # front (Muzzle_DA), two folded claw arms (DA_ArmL/R) and a ring of thrusters underneath. front = +Y
    K = kit("E_Disarmer")
    ball((0, 0, 0), 1.1, M["EArmor"], K, scale=(1.2, 1.1, 0.75), sub=2)
    box((0, 0.2, 0.55), (1.4, 1.2, 0.35), M["EArmor2"], K, bevel=0.12)
    ball((0, 1.05, 0.05), 0.42, M["DisarmGlow"], K, sub=2)
    torus((0, 1.05, 0.05), 0.5, 0.08, M["Joint"], K, rot=ALONG_Y)
    muzzle("Muzzle_DA", (0, 1.5, 0.05), K)
    box((0, 0.75, 0.42), (0.7, 0.1, 0.12), M["EEye"], K)
    for sx, nm in ((-1, "DA_ArmL"), (1, "DA_ArmR")):
        e = empty(nm, (sx * 1.25, 0.2, -0.1), K)
        box((sx * 0.25, 0.4, 0), (0.22, 1.0, 0.22), M["Frame"], e, rot=(0, 0, sx * 0.3))
        box((sx * 0.45, 0.95, -0.05), (0.14, 0.5, 0.14), M["Joint"], e, rot=(0.5, 0, 0))
        box((sx * 0.3, 0.95, -0.05), (0.14, 0.5, 0.14), M["Joint"], e, rot=(-0.5, 0, 0))
    torus((0, 0, -0.75), 0.8, 0.12, M["Joint"], K)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        cyl((math.cos(a) * 0.8, math.sin(a) * 0.8, -0.85), 0.18, 0.25, M["DisarmGlow"], K)

def build_siphon():
    K = kit("W_Siphon")
    # siphon gun: a slim receiver, a barrel wrapped in three glowing red coils and a forked emitter at the tip
    box((0, 0, 0.05), (0.38, 0.9, 0.36), M["Frame"], K, bevel=0.05)
    cyl((0, 0.75, 0.05), 0.1, 0.9, M["Joint"], K, rot=ALONG_Y, verts=10)
    for y in (0.45, 0.72, 0.99):
        torus((0, y, 0.05), 0.15, 0.04, M["SiphonGlow"], K, rot=ALONG_Y)
    for sx in (-1, 1):
        box((sx * 0.12, 1.28, 0.05), (0.06, 0.28, 0.1), M["Armor2"], K)
    box((0, -0.1, -0.24), (0.16, 0.4, 0.22), M["SiphonGlow"], K)
    muzzle("Muzzle_Siphon", (0, 1.36, 0.05), K)


def build_crate():
    # supply crate: an olive armoured box (1.8 m) with metal straps and a glowing amber beacon on top, and a
    # striped parachute (CR_Chute) 6 m above held by four lines. origin = bottom centre, front = +Y
    K = kit("P_Supply")
    box((0, 0, 0.8), (1.8, 1.8, 1.6), M["CrateWood"], K, bevel=0.08)
    for y in (-0.6, 0.6):
        box((0, y, 0.8), (1.86, 0.14, 1.66), M["Frame"], K)
    box((0, 0, 1.62), (0.5, 0.5, 0.06), M["Frame"], K)
    cyl((0, 0, 1.75), 0.16, 0.25, M["CrateGlow"], K)
    for sx in (-1, 1):
        box((sx * 0.92, 0, 0.8), (0.04, 0.9, 0.5), M["Hazard"], K)
    ch = empty("SP_Chute", (0, 0, 1.6), K)
    for i in range(8):
        a = i * math.pi / 4
        box((math.cos(a) * 1.7, math.sin(a) * 1.7, 5.6), (1.5, 0.3, 0.12), M["ChuteRed" if i % 2 else "Chute"], ch, rot=(0, 0.42, a))
    ball((0, 0, 6.1), 2.1, M["Chute"], ch, scale=(1, 1, 0.35), sub=2)
    for sx, sy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        box((sx * 1.0, sy * 1.0, 2.9), (0.04, 0.04, 5.2), M["Joint"], ch, rot=(-sy * 0.3, sx * 0.3, 0))

def build_snatcher():
    # Snatcher: a fast two-thruster hover bike (about 4 m long): a narrow armoured hull, a low windshield, a grabbing
    # claw slung underneath (SN_Claw, it holds the stolen crate), two short guns on the nose (Muzzle_SN) and
    # glowing orange thrusters at the back. front = +Y
    K = kit("E_Snatcher")
    box((0, 0.2, 0.0), (1.1, 3.4, 0.55), M["EArmor"], K, bevel=0.15)
    box((0, 1.4, 0.3), (0.8, 1.1, 0.35), M["EArmor2"], K, bevel=0.1, rot=(0.25, 0, 0))
    box((0, 0.7, 0.55), (0.6, 0.12, 0.35), M["Glass"], K, rot=(-0.6, 0, 0))
    box((0, 1.95, 0.05), (0.5, 0.1, 0.12), M["EEye"], K)
    for sx in (-1, 1):
        box((sx * 0.85, -0.6, -0.05), (0.55, 1.8, 0.45), M["EArmor2"], K, bevel=0.1)
        cyl((sx * 0.85, -1.55, -0.05), 0.24, 0.3, M["SnatchGlow"], K, rot=ALONG_Y, verts=12)
        cyl((sx * 0.35, 1.8, -0.12), 0.07, 0.6, M["Joint"], K, rot=ALONG_Y, verts=8)
    muzzle("Muzzle_SN", (0, 2.2, -0.12), K)
    c = empty("SN_Claw", (0, 0.1, -0.35), K)
    for sx in (-1, 1):
        box((sx * 0.45, 0, -0.35), (0.1, 0.6, 0.7), M["Frame"], c, rot=(0, sx * 0.3, 0))
    box((0, 0, -0.1), (0.9, 0.3, 0.12), M["Joint"], c)

def build_pound_pack():
    K = kit("S_Pound")
    # ground-pound pack: a heavy downward piston block with a blue glowing impact ring and two vents
    box((0, 0, 0.05), (0.75, 0.75, 0.6), M["Frame"], K, bevel=0.06)
    cyl((0, 0, -0.4), 0.28, 0.45, M["Joint"], K, verts=12)
    torus((0, 0, -0.62), 0.32, 0.06, M["PoundGlow"], K)
    for sx in (-1, 1):
        box((sx * 0.42, 0, 0.15), (0.08, 0.5, 0.3), M["PoundGlow"], K)
    box((0, 0.3, 0.38), (0.4, 0.12, 0.12), M["Hazard"], K)
    muzzle("Muzzle_Pound", (0, 0, -0.7), K)


def build_fog_lamp():
    # harbour fog lamp: a 9 m steel post on a concrete pad with a hazard ring, a lamp housing on top (dark glass
    # FL_Off; JS swaps to the glowing FL_On when you light it) and a small control box at the foot. origin = bottom centre
    K = kit("P_FogLamp")
    cyl((0, 0, 0.2), 2.2, 0.4, M["Concrete"], K, verts=16)
    torus((0, 0, 0.42), 2.0, 0.08, M["Hazard"], K)
    cyl((0, 0, 4.6), 0.22, 8.4, M["Frame"], K, verts=10)
    box((0, 0, 8.9), (1.5, 1.5, 0.25), M["Frame"], K)
    box((0, 0, 9.9), (1.3, 1.3, 0.2), M["Frame"], K)
    box((0, 0, 9.4), (1.1, 1.1, 0.8), M["Glass"], empty("FL_Off", (0, 0, 0), K))
    box((0, 0, 9.4), (1.12, 1.12, 0.82), M["FogLampGlow"], empty("FL_On", (0, 0, 0), K))
    box((0.6, 0, 1.2), (0.5, 0.4, 0.9), M["Frame"], K)
    box((0.86, 0, 1.4), (0.04, 0.24, 0.24), M["Hazard"], K)

def build_lurker():
    # Lurker: an ambush walker hidden inside a standard 5 x 2.5 x 2.5 m cargo crate (same size and materials as
    # P_Crate). The crate is two halves (LK_ShellL / LK_ShellR, hinged on the bottom of the short ends) that fall open;
    # the core (LK_Body) rises on four legs (LK_Leg1-4, scaled out by JS) with a red eye and twin cannons (Muzzle_LK).
    # front = +Y (a long face of the crate)
    K = kit("E_Lurker")
    for nm, sx in (("LK_ShellL", -1), ("LK_ShellR", 1)):
        h = empty(nm, (sx * 2.5, 0, 0), K)
        box((-sx * 1.25, 0, 1.25), (2.48, 2.5, 2.5), M["Crate"], h, bevel=0.04)
        for i in range(4):
            x = -sx * (0.3 + i * 0.55)
            box((x, 1.27, 1.25), (0.12, 0.06, 2.3), M["CrateDark"], h)
            box((x, -1.27, 1.25), (0.12, 0.06, 2.3), M["CrateDark"], h)
        box((0, 0, 1.25), (0.08, 2.5, 2.5), M["CrateDark"], h)
    b = empty("LK_Body", (0, 0, 0), K)
    box((0, 0, 1.2), (2.2, 2.0, 1.3), M["LurkCore"], b, bevel=0.12)
    box((0, 0.3, 1.95), (1.4, 1.2, 0.3), M["EArmor2"], b, bevel=0.06)
    box((0, 1.02, 1.35), (0.7, 0.08, 0.22), M["LurkEye"], empty("LK_Eye", (0, 0, 0), b))
    for sx in (-1, 1):
        cyl((sx * 0.55, 1.4, 1.0), 0.16, 1.0, M["Joint"], b, rot=ALONG_Y, verts=10)
        box((sx * 0.55, 0.9, 1.0), (0.42, 0.5, 0.42), M["EArmor"], b)
    muzzle("Muzzle_LK", (0, 1.95, 1.0), b)
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        L = empty("LK_Leg%d" % (i + 1), (sx * 1.0, sy * 0.85, 0.6), b)
        box((sx * 0.15, sy * 0.1, -0.9), (0.26, 0.26, 1.8), M["Joint"], L)
        box((sx * 0.2, sy * 0.15, -1.75), (0.45, 0.45, 0.2), M["EArmor2"], L)

def build_rewind_pack():
    K = kit("S_Rewind")
    # rewind pack: a squat housing with a glowing clock ring standing on it and a single hand
    box((0, 0, 0.0), (0.7, 0.6, 0.5), M["Frame"], K, bevel=0.06)
    torus((0, 0.05, 0.55), 0.36, 0.06, M["RewindGlow"], K, rot=(1.5708, 0, 0))
    box((0, 0.05, 0.66), (0.05, 0.05, 0.26), M["RewindGlow"], K)
    for sx in (-1, 1):
        box((sx * 0.38, 0, 0.1), (0.06, 0.45, 0.3), M["Hazard"], K)
    muzzle("Muzzle_RW", (0, 0.4, 0.55), K)


def build_fuel_tank():
    # refinery fuel tank: an 8.4 m wide, 8 m tall cream storage tank with a shallow domed roof, a red hazard band,
    # ring stiffeners, a spiral-ish ladder strip and a pipe stub at the foot. origin = bottom centre
    K = kit("P_FuelTank")
    cyl((0, 0, 0.2), 4.6, 0.4, M["Concrete"], K, verts=24)
    cyl((0, 0, 4.4), 4.2, 8.0, M["FuelPaint"], K, verts=24)
    ball((0, 0, 8.4), 4.2, M["FuelPaint"], K, scale=(1, 1, 0.22), sub=2)
    for z in (2.2, 6.2):
        cyl((0, 0, z), 4.26, 0.18, M["Frame"], K, verts=24)
    cyl((0, 0, 4.2), 4.24, 0.7, M["Accent"], K, verts=24)
    for i in range(9):
        a = 0.3 + i * 0.17
        box((math.cos(a) * 4.3, math.sin(a) * 4.3, 0.6 + i * 0.85), (0.9, 0.5, 0.08), M["Frame"], K, rot=(0, 0, a + 1.5708))
    cyl((0, -4.6, 0.9), 0.35, 1.6, M["Frame"], K, rot=ALONG_Y, verts=10)
    box((0, -5.5, 0.9), (1.0, 0.4, 1.0), M["Hazard"], K)

def build_planter():
    # Planter: a low, fast tracked demolition bot (about 2.6 m long): two tracks, a flat chassis, a small sensor head
    # with a red eye, and a demolition charge strapped on its back (PL_Charge, hidden by JS after it plants).
    # front = +Y
    K = kit("E_Planter")
    for sx in (-1, 1):
        box((sx * 0.75, 0, 0.35), (0.45, 2.6, 0.6), M["Frame"], K, bevel=0.12)
        for y in (-0.9, 0, 0.9):
            cyl((sx * 0.75, y, 0.35), 0.28, 0.5, M["Joint"], K, rot=(0, 1.5708, 0), verts=10)
    box((0, 0, 0.75), (1.2, 2.2, 0.45), M["EArmor"], K, bevel=0.08)
    box((0, 0.95, 1.05), (0.5, 0.4, 0.3), M["EArmor2"], K, bevel=0.05)
    box((0, 1.16, 1.07), (0.3, 0.04, 0.1), M["EEye"], K)
    c = empty("PL_Charge", (0, -0.35, 1.0), K)
    box((0, 0, 0.25), (0.9, 0.9, 0.5), M["Barrel"], c, bevel=0.05)
    for sx in (-1, 1):
        box((sx * 0.46, 0, 0.25), (0.04, 0.95, 0.12), M["Hazard"], c)
    box((0, 0, 0.55), (0.18, 0.18, 0.1), M["PlantGlow"], c)

def build_melter():
    K = kit("W_Melter")
    # melter: a squat heat-beam projector, a thick body with cooling fins, a wide lens barrel ringed in orange glow
    box((0, 0, 0.05), (0.46, 0.9, 0.44), M["Frame"], K, bevel=0.06)
    for y in (-0.25, 0.0, 0.25):
        box((0, y, 0.32), (0.5, 0.06, 0.12), M["Armor2"], K)
    cyl((0, 0.7, 0.05), 0.2, 0.6, M["Joint"], K, rot=ALONG_Y, verts=14)
    torus((0, 1.0, 0.05), 0.2, 0.05, M["MeltGlow"], K, rot=ALONG_Y)
    cyl((0, 1.05, 0.05), 0.13, 0.08, M["MeltGlow"], K, rot=ALONG_Y, verts=14)
    muzzle("Muzzle_Melter", (0, 1.12, 0.05), K)


def build_salvage():
    # salvage core: a 1.1 m glowing cell held in a hexagonal frame with two cross rings. origin = centre
    K = kit("P_Salvage")
    ball((0, 0, 0), 0.38, M["SalvGlow"], K, sub=2)
    cyl((0, 0, 0.42), 0.46, 0.1, M["Frame"], K, verts=6, smooth=False)
    cyl((0, 0, -0.42), 0.46, 0.1, M["Frame"], K, verts=6, smooth=False)
    for i in range(6):
        a = i * math.pi / 3
        box((math.cos(a) * 0.44, math.sin(a) * 0.44, 0), (0.08, 0.08, 0.8), M["Joint"], K)
    torus((0, 0, 0), 0.5, 0.04, M["Hazard"], K, rot=(1.5708, 0, 0))

def build_salv_pad():
    # salvage extraction pad: a 14 m octagonal landing pad, hazard edge, four glowing corner posts and a beacon mast
    # (SVP_Beacon). origin = ground centre
    K = kit("P_SalvPad")
    cyl((0, 0, 0.12), 7.4, 0.24, M["Concrete"], K, verts=8, smooth=False)
    cyl((0, 0, 0.26), 6.4, 0.06, M["Frame"], K, verts=8, smooth=False)
    for i in range(16):
        a = i * math.pi / 8
        box((math.cos(a) * 6.9, math.sin(a) * 6.9, 0.27), (1.4, 0.4, 0.04), M["Hazard" if i % 2 else "Black"], K, rot=(0, 0, a + 1.5708))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 6.6, math.sin(a) * 6.6
        cyl((x, y, 0.9), 0.14, 1.4, M["Joint"], K, verts=8)
        ball((x, y, 1.7), 0.22, M["SalvGlow"], K)
    cyl((0, 0, 0.6), 0.9, 0.8, M["Frame"], K, verts=12)
    cyl((0, 0, 3.4), 0.16, 5.0, M["Joint"], K, verts=8)
    b = empty("SVP_Beacon", (0, 0, 6.1), K)
    ball((0, 0, 0), 0.42, M["SalvGlow"], b)
    torus((0, 0, 0), 0.7, 0.06, M["Frame"], b)

def build_scav():
    # Scavenger: a 3 m hover salvage drone: a flat rust-yellow disc, three thruster pods, a red eye at the front, and a
    # magnet claw underneath (SC_Claw) holding up to three cores (SC_Load1-3, shown by JS). front = +Y
    K = kit("E_Scav")
    cyl((0, 0, 0), 1.35, 0.45, M["ScavPaint"], K, verts=10, smooth=False)
    cyl((0, 0, 0.32), 0.85, 0.3, M["EArmor2"], K, verts=10, smooth=False)
    box((0, 1.25, 0.05), (0.6, 0.4, 0.3), M["EArmor2"], K, bevel=0.05)
    box((0, 1.46, 0.07), (0.36, 0.04, 0.12), M["EEye"], K)
    for i in range(3):
        a = i * 2 * math.pi / 3 + math.pi / 2 + math.pi / 3
        x, y = math.cos(a) * 1.55, math.sin(a) * 1.55
        cyl((x, y, 0), 0.32, 0.55, M["Frame"], K, verts=10)
        cyl((x, y, -0.32), 0.22, 0.1, M["PlantGlow"], K, verts=10)
        box((math.cos(a) * 1.1, math.sin(a) * 1.1, 0), (0.5, 0.18, 0.16), M["Joint"], K, rot=(0, 0, a))
    cl = empty("SC_Claw", (0, 0, -0.35), K)
    cyl((0, 0, -0.35), 0.1, 0.7, M["Joint"], cl, verts=8)
    cyl((0, 0, -0.75), 0.42, 0.14, M["Frame"], cl, verts=12)
    for i in range(3):
        a = i * 2 * math.pi / 3
        box((math.cos(a) * 0.4, math.sin(a) * 0.4, -1.0), (0.1, 0.1, 0.5), M["Joint"], cl, rot=(math.sin(a) * 0.35, -math.cos(a) * 0.35, 0))
    for i, (x, y) in enumerate(((0, 0), (0.34, -0.22), (-0.34, -0.22))):
        ld = empty("SC_Load%d" % (i + 1), (x, y, -1.2), cl)
        ball((0, 0, 0), 0.24, M["SalvGlow"], ld)

def build_frag():
    K = kit("W_Frag")
    # frag cannon: a boxy breech, a side drum of shards, a short wide barrel with a slotted muzzle brake
    box((0, 0, 0.05), (0.42, 0.85, 0.42), M["Frame"], K, bevel=0.06)
    cyl((0.3, -0.1, 0.05), 0.24, 0.36, M["Armor2"], K, rot=ALONG_Y, verts=12)
    torus((0.3, -0.1, 0.05), 0.24, 0.035, M["SalvGlow"], K, rot=ALONG_Y)
    cyl((0, 0.7, 0.05), 0.15, 0.6, M["Joint"], K, rot=ALONG_Y, verts=12)
    box((0, 1.02, 0.05), (0.36, 0.16, 0.24), M["Frame"], K, bevel=0.03)
    for sx in (-1, 1):
        box((sx * 0.19, 1.02, 0.05), (0.02, 0.1, 0.16), M["SalvGlow"], K)
    muzzle("Muzzle_Frag", (0, 1.12, 0.05), K)


def build_hulk():
    # derelict mech hulk: a toppled, rusted 7 m mech lying on its side: torso, a cracked head, one arm flung out,
    # a bent leg and a dark scorch plate under it. origin = ground centre
    K = kit("P_Hulk")
    box((0, 0, 0.04), (6.5, 4.2, 0.06), M["Black"], K)
    box((0, 0, 1.3), (2.8, 2.2, 2.3), M["Rust2"], K, rot=(0.15, 1.35, 0.2), bevel=0.15)
    box((0.3, 0.2, 1.2), (2.0, 2.4, 1.8), M["Frame"], K, rot=(0.1, 1.3, 0.25), bevel=0.1)
    box((-2.1, 0.4, 0.8), (1.2, 1.1, 1.0), M["Rust"], K, rot=(0.3, 0.9, 0.5), bevel=0.12)
    box((-2.55, 0.55, 0.8), (0.08, 0.6, 0.18), M["Black"], K, rot=(0.3, 0.9, 0.5))
    box((0.6, 2.4, 0.5), (0.8, 2.6, 0.8), M["Rust2"], K, rot=(0, 0, 0.5), bevel=0.08)
    cyl((0.95, 3.6, 0.5), 0.5, 1.0, M["Joint"], K, rot=(0, 1.5708, 0.5), verts=10)
    box((2.3, -0.6, 0.7), (2.4, 0.9, 0.9), M["Rust"], K, rot=(0, 0.2, -0.3), bevel=0.08)
    box((3.4, -1.5, 0.55), (0.9, 1.8, 0.8), M["Rust2"], K, rot=(0, 0, 0.6), bevel=0.08)
    box((3.6, -2.4, 0.3), (1.4, 0.6, 0.5), M["Frame"], K, rot=(0, 0, 0.6))
    for x, y in ((-0.4, -1.4), (1.2, 1.6), (-1.6, -1.2)):
        box((x, y, 0.15), (0.6, 0.4, 0.3), M["Rust"], K, rot=(0.4, 0.3, x))


def build_build_pad():
    # turret build pad: a low octagonal concrete plinth with a hazard rim, four corner bollards and a glowing ring
    # (BP_Ring) that JS tints by state. origin = ground centre, radius ~3.4 m
    K = kit("P_BuildPad")
    cyl((0, 0, 0.18), 3.4, 0.36, M["Concrete"], K, verts=8, smooth=False)
    cyl((0, 0, 0.4), 2.7, 0.1, M["Frame"], K, verts=8, smooth=False)
    for i in range(8):
        a = (i + 0.5) / 8 * math.pi * 2
        box((math.cos(a) * 3.15, math.sin(a) * 3.15, 0.38), (0.9, 0.35, 0.06), M["Hazard"], K, rot=(0, 0, a + math.pi / 2))
    for i in range(4):
        a = i / 4 * math.pi * 2 + math.pi / 4
        cyl((math.cos(a) * 3.0, math.sin(a) * 3.0, 0.75), 0.18, 0.8, M["Joint"], K, verts=8)
        ball((math.cos(a) * 3.0, math.sin(a) * 3.0, 1.2), 0.14, M["PadGlow"], K, sub=1)
    r = empty("BP_Ring", (0, 0, 0.47), K)
    torus((0, 0, 0), 2.2, 0.08, M["PadGlow"], r)
    for i in range(4):
        a = i / 4 * math.pi * 2
        box((math.cos(a) * 1.4, math.sin(a) * 1.4, 0), (0.5, 0.12, 0.03), M["PadGlow"], r, rot=(0, 0, a))

def build_bastion():
    # fortify turret: a heavy pedestal on a square base, a yawing head (BS_Head) with twin long barrels and a sensor
    # mast; BS_Up (armour skirts + a missile box) only shows at level 2. front = +Y
    K = kit("D_Bastion")
    box((0, 0, 0.3), (2.6, 2.6, 0.6), M["Frame"], K, bevel=0.1)
    cyl((0, 0, 1.1), 0.75, 1.0, M["Armor2"], K, verts=12)
    torus((0, 0, 1.55), 0.78, 0.07, M["Joint"], K)
    h = empty("BS_Head", (0, 0, 1.8), K)
    box((0, 0, 0.35), (1.7, 1.9, 0.9), M["Armor"], h, bevel=0.12)
    box((0, -0.3, 0.86), (1.2, 1.0, 0.16), M["Accent"], h, bevel=0.04)
    box((0, 0.98, 0.42), (1.1, 0.12, 0.42), M["Frame"], h)
    for sx in (-1, 1):
        cyl((sx * 0.3, 1.9, 0.42), 0.11, 1.9, M["Black"], h, rot=ALONG_Y, verts=10)
        cyl((sx * 0.3, 2.75, 0.42), 0.16, 0.22, M["Joint"], h, rot=ALONG_Y, verts=10)
        box((sx * 0.9, 0, 0.35), (0.08, 1.4, 0.4), M["Hazard"], h)
    cyl((-0.55, -0.6, 1.2), 0.05, 0.8, M["Joint"], h, verts=6)
    ball((-0.55, -0.6, 1.62), 0.12, M["Sonar"], h, sub=1)
    e = empty("BS_Eye", (0.45, 0.97, 0.62), h)
    ball((0, 0, 0), 0.13, M["PadGlow"], e, sub=1)
    muzzle("Muzzle_Bastion", (0, 2.9, 0.42), h)
    u = empty("BS_Up", (0, 0, 0), h)
    for sx in (-1, 1):
        box((sx * 1.0, 0.1, 0.3), (0.12, 1.7, 0.75), M["Armor2"], u, bevel=0.04)
    box((0.72, -0.55, 1.05), (0.6, 0.7, 0.5), M["Frame"], u, bevel=0.05)
    for i in range(2):
        for j in range(2):
            cyl((0.58 + i * 0.28, -0.2, 0.93 + j * 0.25), 0.08, 0.06, M["Hazard"], u, rot=ALONG_Y, verts=8)
    box((0, 0, -1.2), (2.9, 2.9, 0.14), M["Hazard"], u)

def build_hijack():
    # Hijacker: a 2.6 m hover hacking drone: a dark diamond hull, two side fans, a forked antenna with a magenta
    # emitter at the front (HJ_Emit) that projects the hack beam, and a pulsing core under the belly. front = +Y
    K = kit("E_Hijack")
    box((0, 0, 0), (1.3, 2.0, 0.55), M["HijackPaint"], K, rot=(0, 0, 0), bevel=0.14)
    box((0, 0.2, 0.35), (0.8, 1.1, 0.25), M["EArmor2"], K, bevel=0.06)
    box((0, 1.05, 0.08), (0.5, 0.18, 0.12), M["EEye"], K)
    for sx in (-1, 1):
        cyl((sx * 1.15, -0.1, 0), 0.5, 0.18, M["Frame"], K, verts=12)
        torus((sx * 1.15, -0.1, 0), 0.5, 0.06, M["Joint"], K)
        box((sx * 0.7, -0.1, 0), (0.5, 0.2, 0.14), M["Joint"], K)
        box((sx * 0.22, 1.35, 0.15), (0.08, 0.8, 0.08), M["Joint"], K)
    e = empty("HJ_Emit", (0, 1.8, 0.15), K)
    ball((0, 0, 0), 0.16, M["HackGlow"], e, sub=1)
    torus((0, 0, 0), 0.24, 0.035, M["HackGlow"], e, rot=ALONG_Y)
    ball((0, -0.2, -0.38), 0.24, M["HackGlow"], K, sub=1)
    for i in range(3):
        box((0, -0.85 + i * 0.12, 0.3), (0.6 - i * 0.12, 0.05, 0.05), M["HackGlow"], K)

def build_reflect():
    K = kit("S_Reflect")
    # reflector pack: a squat emitter with a hexagonal lens on top ringed by three prongs and a glowing coil
    box((0, -0.05, 0.22), (0.7, 0.85, 0.4), M["Armor2"], K, bevel=0.05)
    cyl((0, 0.1, 0.5), 0.3, 0.14, M["Frame"], K, verts=6, smooth=False)
    cyl((0, 0.1, 0.6), 0.22, 0.06, M["ReflGlow"], K, verts=6, smooth=False)
    torus((0, 0.1, 0.5), 0.33, 0.04, M["ReflGlow"], K)
    for i in range(3):
        a = i / 3 * math.pi * 2
        box((math.cos(a) * 0.36, 0.1 + math.sin(a) * 0.36, 0.62), (0.06, 0.06, 0.3), M["Joint"], K)
    for sx in (-1, 1):
        box((sx * 0.36, -0.05, 0.22), (0.05, 0.7, 0.12), M["Hazard"], K)
    muzzle("Muzzle_Reflect", (0, 0.1, 0.7), K)


def build_trooper():
    # allied squad tank: a 3.4 m six-wheeled hull in blue with a small yawing turret (TR_Turret) and a stubby cannon,
    # a cyan IFF light on the back. front = +Y
    K = kit("A_Trooper")
    box((0, 0, 0.75), (2.0, 3.2, 0.8), M["AllyPaint"], K, bevel=0.12)
    wedge((0, 1.75, 0.7), (1.9, 0.5, 0.6), M["AllyPaint"], K, taper=0.35)
    box((0, -0.2, 1.2), (1.6, 2.2, 0.12), M["Frame"], K)
    for sx in (-1, 1):
        for y in (-1.1, 0, 1.1):
            cyl((sx * 1.05, y, 0.42), 0.42, 0.3, M["Black"], K, rot=(0, 1.5708, 0), verts=12)
            cyl((sx * 1.22, y, 0.42), 0.18, 0.05, M["Joint"], K, rot=(0, 1.5708, 0), verts=8)
        box((sx * 0.98, 0, 0.95), (0.12, 3.0, 0.14), M["Hazard"], K)
    ball((0, -1.55, 1.25), 0.12, M["Sonar"], K, sub=1)
    t = empty("TR_Turret", (0, 0.1, 1.3), K)
    box((0, 0, 0.3), (1.1, 1.2, 0.55), M["Armor2"], t, bevel=0.08)
    box((0, -0.3, 0.62), (0.6, 0.4, 0.14), M["Frame"], t)
    cyl((0, 1.15, 0.3), 0.11, 1.2, M["Black"], t, rot=ALONG_Y, verts=10)
    cyl((0, 1.7, 0.3), 0.15, 0.18, M["Joint"], t, rot=ALONG_Y, verts=10)
    muzzle("Muzzle_Trooper", (0, 1.82, 0.3), t)

def build_tower():
    # enemy lane tower: a 9 m armoured pylon on a wide plinth, a yawing gun head on top (TW_Yaw) with a twin cannon,
    # red glow slits up the shaft. front = +Y
    K = kit("E_Tower")
    box((0, 0, 0.5), (5.0, 5.0, 1.0), M["CitadelPaint"], K, bevel=0.2)
    box((0, 0, 4.2), (2.6, 2.6, 6.6), M["EArmor2"], K, bevel=0.15)
    for i in range(4):
        a = i * math.pi / 2
        box((math.cos(a) * 1.32, math.sin(a) * 1.32, 4.2), (0.12 if i % 2 == 0 else 1.0, 1.0 if i % 2 == 0 else 0.12, 5.0), M["TowerGlow"], K)
        box((math.cos(a) * 2.2, math.sin(a) * 2.2, 1.6), (1.2, 1.2, 1.4), M["EArmor"], K, bevel=0.1)
    box((0, 0, 7.7), (3.2, 3.2, 0.5), M["Frame"], K, bevel=0.08)
    y = empty("TW_Yaw", (0, 0, 8.0), K)
    box((0, 0, 0.7), (2.4, 2.6, 1.3), M["EArmor"], y, bevel=0.15)
    box((0, 1.35, 0.85), (1.6, 0.2, 0.5), M["EEye"], y)
    for sx in (-1, 1):
        cyl((sx * 0.45, 2.3, 0.7), 0.18, 2.2, M["Black"], y, rot=ALONG_Y, verts=10)
        cyl((sx * 0.45, 3.35, 0.7), 0.26, 0.3, M["Joint"], y, rot=ALONG_Y, verts=10)
    muzzle("Muzzle_Tower", (0, 3.6, 0.7), y)

def build_citadel():
    # enemy citadel: a squat 16 m command bunker: stepped armoured base, a tall core block with a red reactor eye,
    # four shield emitter masts (CT_Mast1-4) and a radar dish. CT_Shield marks the dome centre. front = +Y
    K = kit("E_Citadel")
    box((0, 0, 0.8), (16, 16, 1.6), M["CitadelPaint"], K, bevel=0.3)
    box((0, 0, 2.6), (11, 11, 2.2), M["EArmor2"], K, bevel=0.25)
    box((0, 0, 6.0), (6.5, 6.5, 4.8), M["EArmor"], K, bevel=0.25)
    box((0, 3.3, 6.4), (2.8, 0.2, 1.2), M["EEye"], K)
    ball((0, 0, 9.2), 1.6, M["TowerGlow"], K, sub=2)
    torus((0, 0, 9.0), 2.2, 0.18, M["Frame"], K)
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, y = math.cos(a) * 6.6, math.sin(a) * 6.6
        m = empty("CT_Mast%d" % (i + 1), (x, y, 1.6), K)
        cyl((0, 0, 2.6), 0.28, 5.2, M["Frame"], m, verts=10)
        ball((0, 0, 5.4), 0.5, M["TowerGlow"], m, sub=1)
        torus((0, 0, 4.4), 0.55, 0.08, M["Joint"], m)
    cyl((-2.2, -2.2, 9.2), 0.12, 1.4, M["Joint"], K, verts=8)
    cyl((-2.2, -2.2, 10.0), 1.0, 0.12, M["Armor2"], K, rot=(0.6, 0, 0), verts=14)
    empty("CT_Shield", (0, 0, 6), K)
    for sx in (-1, 1):
        box((sx * 5.5, 0, 1.9), (0.3, 8, 0.4), M["Hazard"], K)

def build_shade():
    # Shade: a cloak projector, a 4 m hovering obelisk with a violet core and two counter-rotating rings (SH_Ring1/2)
    K = kit("E_Shade")
    wedge((0, 0, 0.6), (1.1, 1.1, 1.2), M["HijackPaint"], K, taper=0.2)
    box((0, 0, 2.0), (0.9, 0.9, 1.8), M["HijackPaint"], K, bevel=0.1)
    wedge((0, 0, 3.4), (0.9, 0.9, 1.0), M["EArmor2"], K, taper=0.05)
    ball((0, 0, 2.2), 0.42, M["ShadeGlow"], K, sub=2)
    for i in range(4):
        a = i * math.pi / 2
        box((math.cos(a) * 0.47, math.sin(a) * 0.47, 2.0), (0.06, 0.06, 1.5), M["ShadeGlow"], K)
    box((0, 0.48, 2.9), (0.4, 0.06, 0.12), M["EEye"], K)
    r1 = empty("SH_Ring1", (0, 0, 2.2), K)
    torus((0, 0, 0), 1.25, 0.07, M["ShadeGlow"], r1)
    for i in range(3):
        a = i * 2 * math.pi / 3
        box((math.cos(a) * 1.25, math.sin(a) * 1.25, 0), (0.25, 0.25, 0.25), M["Frame"], r1)
    r2 = empty("SH_Ring2", (0, 0, 2.2), K)
    torus((0, 0, 0), 1.6, 0.05, M["Joint"], r2, rot=(0.5, 0, 0))

def build_repair():
    K = kit("S_Repair")
    # repair beam pack: a boxy generator with a short emitter barrel ending in a green ring, a cross decal
    box((0, -0.1, 0.25), (0.7, 0.9, 0.42), M["Armor2"], K, bevel=0.05)
    cyl((0, 0.45, 0.42), 0.12, 0.6, M["Frame"], K, rot=ALONG_Y, verts=10)
    torus((0, 0.76, 0.42), 0.15, 0.04, M["RepairGlow"], K, rot=ALONG_Y)
    box((0, -0.15, 0.47), (0.3, 0.08, 0.02), M["RepairGlow"], K)
    box((0, -0.15, 0.47), (0.08, 0.3, 0.02), M["RepairGlow"], K)
    for sx in (-1, 1):
        box((sx * 0.36, -0.1, 0.25), (0.05, 0.75, 0.12), M["Hazard"], K)
    muzzle("Muzzle_Repair", (0, 0.8, 0.42), K)


def build_gate():
    # beacon gate: a floating 10 m ring standing upright (you fly through it along local Y), a glowing inner tube,
    # an armoured outer frame with four emitter pods, and a slowly spinning outer ring of fins (GT_Spin). origin = ring centre
    K = kit("P_Gate")
    torus((0, 0, 0), 5.0, 0.22, M["GateGlow"], K, rot=(1.5708, 0, 0))
    torus((0, 0, 0), 5.45, 0.16, M["Frame"], K, rot=(1.5708, 0, 0))
    for i in range(4):
        a = i * math.pi / 2 + math.pi / 4
        x, z = math.cos(a) * 5.4, math.sin(a) * 5.4
        box((x, 0, z), (0.9, 0.7, 0.9), M["Armor2"], K, bevel=0.1)
        ball((x * 1.06, 0, z * 1.06), 0.24, M["GateGlow"], K, sub=1)
    g = empty("GT_Spin", (0, 0, 0), K)
    for i in range(12):
        a = i * math.pi / 6
        box((math.cos(a) * 6.1, 0, math.sin(a) * 6.1), (0.5, 0.12, 0.5), M["Hazard"] if i % 3 == 0 else M["Joint"], g, rot=(0, -a, 0))

def build_engineer():
    # Engineer: a 3.2 m tracked construction rig in yellow paint: two tracks, a boxy cab with a red eye, a folded
    # turret kit on its back (EN_Pod) and a two-joint crane arm (EN_Arm pitches, EN_Fore bends) ending in a welding
    # torch (EN_Torch). front = +Y
    K = kit("E_Engineer")
    for sx in (-1, 1):
        box((sx * 1.0, 0, 0.42), (0.55, 3.2, 0.75), M["Frame"], K, bevel=0.14)
        for y in (-1.15, -0.4, 0.4, 1.15):
            cyl((sx * 1.0, y, 0.42), 0.32, 0.6, M["Joint"], K, rot=(0, 1.5708, 0), verts=10)
    box((0, 0, 1.0), (1.6, 2.8, 0.55), M["EngPaint"], K, bevel=0.08)
    box((0, 0.9, 1.6), (1.2, 0.9, 0.75), M["EngPaint"], K, bevel=0.08)
    box((0, 1.36, 1.7), (0.8, 0.04, 0.2), M["EEye"], K)
    for sx in (-1, 1):
        box((sx * 0.82, 0, 1.0), (0.04, 2.6, 0.16), M["Hazard"], K)
    ball((0.5, 0.7, 2.05), 0.1, M["BurnerGlow"], K, sub=1)
    pod = empty("EN_Pod", (0, -0.8, 1.3), K)
    box((0, 0, 0.35), (1.1, 1.1, 0.7), M["EArmor2"], pod, bevel=0.08)
    cyl((0, 0.3, 0.75), 0.1, 0.8, M["Black"], pod, rot=ALONG_Y, verts=8)
    box((0, 0, 0.72), (0.5, 0.5, 0.06), M["EEye"], pod)
    arm = empty("EN_Arm", (-0.55, 0.3, 1.5), K)
    box((0, 0, 0.0), (0.4, 0.4, 0.4), M["Joint"], arm, bevel=0.05)
    box((0, 0.75, 0.25), (0.22, 1.5, 0.22), M["EngPaint"], arm, rot=(0.35, 0, 0))
    fore = empty("EN_Fore", (0, 1.45, 0.52), arm)
    cyl((0, 0, 0), 0.16, 0.3, M["Joint"], fore, rot=(0, 1.5708, 0), verts=10)
    box((0, 0.6, 0), (0.16, 1.2, 0.16), M["Frame"], fore)
    cyl((0, 1.25, 0), 0.09, 0.3, M["Black"], fore, rot=ALONG_Y, verts=8)
    t = empty("EN_Torch", (0, 1.42, 0), fore)
    ball((0, 0, 0), 0.08, M["BurnerGlow"], t, sub=1)

def build_burner():
    K = kit("S_Burner")
    # afterburner pack: a fuel cylinder over two short thrust nozzles pointing back (-Y), glowing throats, a hazard band
    cyl((0, 0.05, 0.35), 0.24, 0.9, M["Armor2"], K, rot=ALONG_Y, verts=14)
    box((0, 0.05, 0.12), (0.62, 0.8, 0.22), M["Frame"], K, bevel=0.04)
    for sx in (-1, 1):
        cyl((sx * 0.18, -0.5, 0.15), 0.13, 0.35, M["Joint"], K, rot=ALONG_Y, verts=12, r2=0.17)
        cyl((sx * 0.18, -0.69, 0.15), 0.11, 0.05, M["BurnerGlow"], K, rot=ALONG_Y, verts=12)
    torus((0, 0.05, 0.35), 0.25, 0.03, M["Hazard"], K, rot=ALONG_Y)
    muzzle("Muzzle_Burner", (0, -0.72, 0.15), K)

build_rifle(); build_gatling(); build_coil(); build_rail(); build_blade(); build_shotgun(); build_grenade(); build_pile(); build_flamer(); build_cryo(); build_disc(); build_grappler(); build_blink(); build_eel(); build_sonar(); build_jet(); build_split(); build_sentry(); build_sentry_pod(); build_skimmer(); build_hook(); build_lev(); build_smoke(); build_jungle(); build_prism(); build_sonic(); build_fencer(); build_stasis(); build_toxic(); build_hive(); build_flak(); build_grid(); build_blinker(); build_cluster(); build_twister(); build_watch(); build_chaff(); build_frost(); build_icewall(); build_blimp(); build_rockets(); build_mirage(); build_sticky(); build_crane(); build_deflector(); build_minepod(); build_rammer(); build_ricochet(); build_leaper(); build_needler(); build_herald(); build_rod(); build_rod_pack(); build_truck(); build_leech(); build_acid(); build_rift(); build_disarmer(); build_siphon(); build_crate(); build_snatcher(); build_pound_pack(); build_fog_lamp(); build_lurker(); build_rewind_pack(); build_fuel_tank(); build_planter(); build_melter(); build_salvage(); build_salv_pad(); build_scav(); build_frag(); build_hulk(); build_build_pad(); build_bastion(); build_hijack(); build_reflect(); build_trooper(); build_tower(); build_citadel(); build_shade(); build_repair(); build_gate(); build_engineer(); build_burner()
build_missile(); build_cannon(); build_laser(); build_shield(); build_drones(); build_emp(); build_mini()
build_turret(); build_drone(); build_walker(); build_gunship(); build_bulwark(); build_relay(); build_reactor(); build_truck(); build_colossus(); build_stalker(); build_mender(); build_crawler(); build_cache(); build_sapper(); build_mine(); build_jammer(); build_dropship(); build_howitzer(); build_decoy(); build_warden(); build_grav(); build_burrower(); build_train(); build_orbital()
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
