"""Headless Blender script: build the swappable mech PARTS into site/assets/parts.glb (separate from kit.glb so it
builds in seconds and does not need the ~40 min full kit build).

Run:  D:/AI/tools/Blender/blender.exe -b -P build_parts.py -- --out D:/AI/mech_arena [--preview]

Reuses the materials and helpers from build_kit.py (everything above `def build_mech():` is exec'd here), so the
recolourable materials keep their names (Armor / Armor2 / Accent ...).

Contract with site/mech.js (applyParts):
  * each part is an Empty Kit_P_<slot>_<id>  (slot: head core arms legs pack)
  * children "PT_<slot><id>__<Node>" are groups at the origin whose meshes are authored in the local frame of the
    standard mech node <Node> (M_Head, M_Torso, M_ShoulderL, M_ArmL, M_ForeL, M_ThighL, M_ShinL, M_FootL, M_Pack,
    M_WingL, M_Hips ...). The page removes the standard meshes that sit directly under <Node> and moves the group in.
  * "PV_<slot><id>__<Node>" Empties: <Node> gets this local position (pivot override; reverse-joint knees, moved
    thruster anchors T_*). Located relative to the kit root = the node's new position in its parent's frame.
  * "PH_<slot><id>__<Node>" Empties: <Node> is hidden entirely (tread legs hide the thighs).
  * meshes named TRW* are tread road wheels (spun about their own axis by forward speed).
  * --preview also builds the standard mech and renders Workbench lineups of the presets to <out>/parts_preview_*.png
"""
import bpy, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, "build_kit.py"), encoding="utf-8").read().split("\n")
_i0 = _src.index("def build_mech():")
exec(compile("\n".join(_src[:_i0]), "build_kit_head", "exec"))
PREVIEW = "--preview" in argv
PVDIR = argv[argv.index("--pv") + 1] if "--pv" in argv else OUT
R = math.radians

def pt(K, pid, node):
    return empty(f"PT_{pid}__{node}", (0, 0, 0), K)

def pv(K, pid, node, loc):
    return empty(f"PV_{pid}__{node}", loc, K)

def ph(K, pid, node):
    return empty(f"PH_{pid}__{node}", (0, 0, 0), K)

def wheel(loc, r, h, material, parent):
    o = cyl(loc, r, h, material, parent, rot=(0, math.pi / 2, 0), verts=14)
    o.name = nm("TRW")
    return o

SIDES = (("L", -1), ("R", 1))

# ================================================================= HEADS (M_Head local; neck at origin, front +Y)
def head_hawk():
    # long forward-swept sensor head: narrow nose, twin side sensor pods, a long rear antenna
    K = kit("P_head_hawk"); g = pt(K, "headhawk", "M_Head")
    cyl((0, 0, 0.06), 0.18, 0.17, M["Joint"], g)
    wedge((0, 0.1, 0.24), (0.46, 0.92, 0.32), M["Armor"], g, bevel=0.04, taper=0.55)
    wedge((0, 0.2, 0.42), (0.3, 0.6, 0.08), M["Armor2"], g, bevel=0.02, taper=0.5)
    box((0, -0.36, 0.26), (0.4, 0.3, 0.3), M["Armor2"], g, bevel=0.03)
    box((0, 0.56, 0.22), (0.3, 0.06, 0.08), M["Black"], g)
    box((0, 0.58, 0.22), (0.22, 0.03, 0.04), M["Visor"], g)
    wedge((0, 0.42, 0.06), (0.28, 0.3, 0.12), M["Frame"], g, rot=(math.pi, 0, 0), bevel=0.02, taper=0.5)
    for s in (-1, 1):
        cyl((s * 0.32, 0.12, 0.26), 0.1, 0.62, M["Armor2"], g, rot=ALONG_Y)
        cyl((s * 0.32, 0.44, 0.26), 0.075, 0.04, M["Black"], g, rot=ALONG_Y)
        cyl((s * 0.32, 0.465, 0.26), 0.05, 0.02, M["Visor"], g, rot=ALONG_Y)
        box((s * 0.32, -0.16, 0.26), (0.06, 0.24, 0.08), M["Frame"], g)
        box((s * 0.25, 0.3, 0.3), (0.025, 0.3, 0.025), M["Visor"], g)
    cyl((0.12, -0.42, 0.62), 0.015, 0.8, M["Piston"], g, rot=(R(-35), 0, 0), smooth=False)
    cyl((-0.12, -0.42, 0.56), 0.015, 0.6, M["Piston"], g, rot=(R(-35), 0, 0), smooth=False)
    box((0, 0.0, 0.47), (0.05, 0.7, 0.05), M["Accent"], g)

def head_mono():
    # mono-eye dome: rounded helm, a dark rail slot across the face with one glowing eye, ear drums, heavy brow
    K = kit("P_head_mono"); g = pt(K, "headmono", "M_Head")
    cyl((0, 0, 0.06), 0.2, 0.17, M["Joint"], g)
    ball((0, 0.0, 0.3), 0.36, M["Armor"], g, scale=(1.0, 1.05, 0.86))
    box((0, 0.24, 0.29), (0.6, 0.3, 0.09), M["Black"], g)
    ball((0.08, 0.36, 0.29), 0.06, M["Visor"], g, sub=1)
    wedge((0, 0.18, 0.43), (0.62, 0.5, 0.1), M["Armor2"], g, bevel=0.02, taper=0.6)
    wedge((0, 0.3, 0.12), (0.4, 0.26, 0.16), M["Armor2"], g, rot=(math.pi, 0, 0), bevel=0.02, taper=0.6)
    grille((0, 0.4, 0.13), (0.22, 0.03, 0.08), g, n=3, axis="x")
    for s in (-1, 1):
        cyl((s * 0.36, -0.02, 0.28), 0.13, 0.12, M["Armor2"], g, rot=(0, math.pi / 2, 0), verts=14)
        cyl((s * 0.43, -0.02, 0.28), 0.07, 0.04, M["Frame"], g, rot=(0, math.pi / 2, 0), verts=10)
        cyl((s * 0.16, -0.32, 0.18), 0.05, 0.3, M["Black"], g, rot=(R(70), 0, 0))
    box((0, -0.06, 0.6), (0.06, 0.56, 0.06), M["Accent"], g)
    box((0, -0.3, 0.26), (0.4, 0.14, 0.3), M["Frame"], g, bevel=0.02)

def head_crest():
    # knight crest: angular helm, V-fin, twin eyes behind a face grille, cheek blocks
    K = kit("P_head_crest"); g = pt(K, "headcrest", "M_Head")
    cyl((0, 0, 0.06), 0.19, 0.17, M["Joint"], g)
    wedge((0, 0.02, 0.27), (0.6, 0.7, 0.42), M["Armor"], g, bevel=0.05, taper=0.75)
    box((0, -0.28, 0.3), (0.46, 0.18, 0.34), M["Armor2"], g, bevel=0.03)
    box((0, 0.38, 0.32), (0.44, 0.06, 0.08), M["Black"], g)
    for s in (-1, 1):
        box((s * 0.11, 0.41, 0.32), (0.13, 0.03, 0.04), M["Visor"], g, rot=(0, s * R(-12), 0))
        wedge((s * 0.32, 0.12, 0.2), (0.1, 0.5, 0.34), M["Armor2"], g, bevel=0.015, taper=0.6)
        fin = box((s * 0.2, 0.3, 0.58), (0.06, 0.08, 0.5), M["Accent"], g, rot=(R(-20), 0, s * R(-40)), bevel=0.01)
        box((s * 0.36, 0.25, 0.75), (0.04, 0.05, 0.18), M["Armor2"], g, rot=(R(-20), 0, s * R(-40)))
    box((0, 0.36, 0.52), (0.14, 0.08, 0.12), M["Armor2"], g, bevel=0.02)
    box((0, 0.39, 0.53), (0.06, 0.03, 0.05), M["Visor"], g)
    grille((0, 0.38, 0.14), (0.3, 0.04, 0.14), g, n=4, axis="x")
    wedge((0, -0.12, 0.54), (0.1, 0.4, 0.14), M["Armor2"], g, taper=0.4)

# ================================================================= CORES (M_Torso local; hips joint at origin)
# children that stay: M_Head (0,0.15,1.62)  M_Pack (0,-0.72,1.0)  M_Shoulder (+-1.12,0,1.12)  W_Back (+-0.64,-0.5,1.64)
def core_bulwark():
    # heavy chest: wider block, thick layered front armour, tall collar guards beside the head, intakes
    K = kit("P_core_bulwark"); g = pt(K, "corebulwark", "M_Torso")
    box((0, 0, 0.22), (1.14, 0.84, 0.6), M["Frame"], g, bevel=0.05)
    cyl((0, 0, 0.0), 0.38, 0.2, M["Joint"], g, verts=16)
    for i in range(3):
        box((0, 0.42, 0.06 + i * 0.17), (0.86 + i * 0.08, 0.1, 0.13), M["Armor2"] if i % 2 == 0 else M["Armor"], g, bevel=0.02)
    box((0, 0.02, 0.54), (1.36, 0.94, 0.18), M["Armor2"], g, bevel=0.03)
    box((0, 0.0, 1.02), (1.98, 1.18, 0.96), M["Armor"], g, bevel=0.09)
    wedge((0, 0.62, 1.04), (1.5, 0.26, 0.82), M["Armor"], g, rot=(R(-6), 0, 0), bevel=0.05, taper=0.8)
    box((0, 0.76, 1.04), (1.1, 0.04, 0.06), M["Accent"], g)
    for s in (-1, 1):
        grille((s * 0.45, 0.76, 0.8), (0.42, 0.05, 0.22), g, n=4, axis="x")
        box((s * 0.6, 0.72, 1.3), (0.4, 0.06, 0.05), M["Visor"], g)
        box((s * 1.0, -0.05, 1.0), (0.08, 0.9, 0.7), M["Armor2"], g, bevel=0.02)
        box((s * 0.56, 0.05, 1.72), (0.3, 0.72, 0.5), M["Armor2"], g, rot=(0, s * R(-8), 0), bevel=0.04)
        box((s * 0.6, 0.42, 1.74), (0.24, 0.04, 0.3), M["Hazard"], g, rot=(0, s * R(-8), 0))
        box((s * 0.48, -0.15, 0.26), (0.12, 0.72, 0.5), M["Armor"], g, bevel=0.02)
    box((0, -0.58, 1.0), (1.5, 0.08, 0.76), M["Armor2"], g, bevel=0.02)
    box((0, -0.05, 1.55), (1.0, 1.0, 0.2), M["Frame"], g, bevel=0.04)
    cyl((0, 0.12, 1.62), 0.27, 0.12, M["Joint"], g, verts=16)

def core_sleek():
    # sleek chest: narrow sloped chest with a V prow, a canopy dome, slim abdomen and back intakes
    K = kit("P_core_sleek"); g = pt(K, "coresleek", "M_Torso")
    box((0, 0, 0.22), (0.82, 0.62, 0.52), M["Frame"], g, bevel=0.05)
    cyl((0, 0, 0.0), 0.32, 0.2, M["Joint"], g, verts=16)
    for i in range(3):
        wedge((0, 0.3, 0.06 + i * 0.16), (0.56 + i * 0.06, 0.12, 0.13), M["Armor2"] if i % 2 == 0 else M["Armor"], g, rot=(R(-10), 0, 0), bevel=0.02, taper=0.8)
    box((0, -0.05, 1.0), (1.5, 0.9, 0.82), M["Armor"], g, bevel=0.1)
    for s in (-1, 1):
        wedge((s * 0.36, 0.42, 1.0), (0.78, 0.3, 0.86), M["Armor"], g, rot=(0, 0, s * R(28)), bevel=0.04, taper=0.5)
        box((s * 0.42, 0.56, 0.86), (0.5, 0.03, 0.04), M["Accent"], g, rot=(0, 0, s * R(28)))
        wedge((s * 0.82, -0.05, 1.08), (0.12, 0.8, 0.56), M["Armor2"], g, bevel=0.02, taper=0.7)
        cyl((s * 0.4, -0.52, 1.18), 0.13, 0.12, M["Black"], g, rot=ALONG_Y)
        torus((s * 0.4, -0.55, 1.18), 0.13, 0.025, M["Frame"], g, rot=ALONG_Y)
    ball((0, 0.5, 1.3), 0.17, M["Armor2"], g, scale=(1.3, 1.0, 0.6))
    box((0, 0.66, 1.3), (0.26, 0.03, 0.04), M["Visor"], g)
    box((0, 0.0, 0.56), (1.0, 0.74, 0.14), M["Armor2"], g, bevel=0.03)
    box((0, -0.04, 1.5), (1.0, 0.86, 0.16), M["Frame"], g, bevel=0.04)
    cyl((0, 0.12, 1.6), 0.24, 0.12, M["Joint"], g, verts=16)
    box((0, -0.5, 0.94), (1.1, 0.06, 0.6), M["Armor2"], g, bevel=0.02)

# ================================================================= ARMS
# M_Shoulder (torso +-1.12,0,1.12) > M_Arm (s*0.3,0,-0.18) > M_Fore (0,0,-0.85) > W_Hand (0,0.82,-0.08); forearm points +Y
def arms_brace():
    # artillery arms: box pauldron with stabiliser fins, thick upper arm, long forearm with recoil dampers
    K = kit("P_arms_brace")
    for side, s in SIDES:
        sh = pt(K, "armsbrace", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.32, M["Joint"], sh)
        box((s * 0.3, 0, 0.16), (0.84, 1.18, 0.74), M["Armor"], sh, bevel=0.07)
        box((s * 0.3, 0, 0.56), (0.66, 0.9, 0.1), M["Armor2"], sh, bevel=0.02)
        box((s * 0.73, 0, 0.12), (0.06, 0.9, 0.5), M["Armor2"], sh)
        for k in (-1, 1):
            box((s * 0.3, k * 0.6, 0.2), (0.6, 0.05, 0.4), M["Frame"], sh)
        box((s * 0.74, 0.2, 0.32), (0.03, 0.4, 0.12), M["Hazard"], sh)
        box((s * 0.3, 0.6, 0.3), (0.4, 0.03, 0.05), M["Visor"], sh)
        wedge((s * 0.66, -0.3, 0.5), (0.06, 0.5, 0.4), M["Accent"], sh, taper=0.4)
        ar = pt(K, "armsbrace", f"M_Arm{side}")
        cyl((0, 0, -0.42), 0.18, 0.84, M["Frame"], ar)
        box((0, 0, -0.42), (0.6, 0.62, 0.66), M["Armor2"], ar, bevel=0.05)
        box((s * 0.31, 0, -0.42), (0.04, 0.4, 0.44), M["Frame"], ar)
        for k in (-1, 1):
            cyl((k * 0.16, 0.32, -0.44), 0.04, 0.56, M["Piston"], ar)
        cyl((0, 0, -0.82), 0.24, 0.5, M["Joint"], ar, rot=(0, math.pi / 2, 0))
        fo = pt(K, "armsbrace", f"M_Fore{side}")
        ball((0, 0, 0), 0.23, M["Joint"], fo)
        box((0, 0.4, -0.04), (0.62, 1.08, 0.6), M["Armor"], fo, bevel=0.06)
        box((s * 0.33, 0.4, -0.04), (0.06, 0.8, 0.42), M["Armor2"], fo, bevel=0.02)
        for k in (1, -1):
            cyl((0, 0.46, k * 0.36 - 0.04), 0.06, 0.84, M["Piston"], fo, rot=ALONG_Y)
            cyl((0, 0.12, k * 0.36 - 0.04), 0.09, 0.2, M["Frame"], fo, rot=ALONG_Y)
        torus((0, 0.92, -0.06), 0.24, 0.05, M["Frame"], fo, rot=ALONG_Y)
        box((0, 0.4, 0.27), (0.12, 0.6, 0.03), M["Visor"], fo)
        box((s * 0.34, 0.66, -0.04), (0.02, 0.3, 0.12), M["Accent"], fo)
        grille((0, -0.04, 0.26), (0.32, 0.2, 0.03), fo, n=3, axis="x")

def arms_guard():
    # shield arms: rounded pauldrons with a rim, standard-ish upper arm, a big shield plate on the outer forearm
    K = kit("P_arms_guard")
    for side, s in SIDES:
        sh = pt(K, "armsguard", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.31, M["Joint"], sh)
        ball((s * 0.28, 0, 0.12), 0.5, M["Armor"], sh, scale=(0.9, 1.1, 0.8))
        torus((s * 0.3, 0, -0.06), 0.42, 0.06, M["Armor2"], sh, rot=(0, s * R(-15), 0))
        box((s * 0.66, 0, 0.1), (0.04, 0.6, 0.12), M["Accent"], sh, rot=(0, s * R(-20), 0))
        box((s * 0.4, 0.52, 0.2), (0.26, 0.03, 0.05), M["Visor"], sh)
        ar = pt(K, "armsguard", f"M_Arm{side}")
        cyl((0, 0, -0.4), 0.16, 0.8, M["Frame"], ar)
        box((0, 0, -0.4), (0.5, 0.54, 0.62), M["Armor2"], ar, bevel=0.06)
        wedge((s * 0.27, 0.02, -0.38), (0.08, 0.46, 0.5), M["Armor"], ar, bevel=0.015, taper=0.75)
        fo = pt(K, "armsguard", f"M_Fore{side}")
        ball((0, 0, 0), 0.21, M["Joint"], fo)
        box((0, 0.36, -0.04), (0.5, 0.92, 0.5), M["Armor2"], fo, bevel=0.06)
        box((s * 0.4, 0.34, -0.06), (0.08, 1.4, 1.02), M["Armor"], fo, rot=(0, s * R(-6), 0), bevel=0.06)
        box((s * 0.45, 0.34, -0.06), (0.03, 1.26, 0.06), M["Accent"], fo, rot=(0, s * R(-6), 0))
        box((s * 0.45, 0.34, 0.36), (0.03, 0.9, 0.03), M["Visor"], fo, rot=(0, s * R(-6), 0))
        box((s * 0.45, 0.34, -0.44), (0.03, 1.1, 0.12), M["Armor2"], fo, rot=(0, s * R(-6), 0))
        box((s * 0.45, 0.95, -0.06), (0.04, 0.12, 0.8), M["Frame"], fo, rot=(0, s * R(-6), 0))

def arms_stab():
    # stabiliser arms: slim rounded pauldrons, an elbow counterweight, long forearms wrapped in two gyro rings and a
    # wrist sensor pod
    K = kit("P_arms_stab")
    for side, s in SIDES:
        sh = pt(K, "armsstab", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.3, M["Joint"], sh)
        box((s * 0.28, 0.02, 0.1), (0.62, 0.86, 0.6), M["Armor"], sh, bevel=0.1)
        box((s * 0.6, 0.02, 0.1), (0.05, 0.62, 0.34), M["Armor2"], sh)
        box((s * 0.36, 0.45, 0.2), (0.22, 0.03, 0.05), M["Visor"], sh)
        cyl((s * 0.22, -0.28, 0.6), 0.035, 0.42, M["Frame"], sh)
        ball((s * 0.22, -0.28, 0.82), 0.05, M["Visor"], sh)
        ar = pt(K, "armsstab", f"M_Arm{side}")
        cyl((0, 0, -0.42), 0.15, 0.84, M["Frame"], ar)
        box((0, 0, -0.36), (0.44, 0.48, 0.54), M["Armor2"], ar, bevel=0.05)
        box((0, -0.34, -0.72), (0.34, 0.28, 0.32), M["Frame"], ar, bevel=0.03)
        box((0, -0.49, -0.72), (0.26, 0.03, 0.2), M["Hazard"], ar)
        cyl((0, 0, -0.82), 0.2, 0.44, M["Joint"], ar, rot=(0, math.pi / 2, 0))
        fo = pt(K, "armsstab", f"M_Fore{side}")
        ball((0, 0, 0), 0.2, M["Joint"], fo)
        box((0, 0.42, -0.04), (0.42, 1.12, 0.42), M["Armor"], fo, bevel=0.06)
        box((s * 0.22, 0.42, -0.04), (0.04, 0.8, 0.26), M["Armor2"], fo)
        for y in (0.26, 0.64):
            torus((0, y, -0.04), 0.33, 0.05, M["Armor2"], fo, rot=ALONG_Y)
            torus((0, y + 0.06, -0.04), 0.335, 0.014, M["Visor"], fo, rot=ALONG_Y)
        cyl((s * 0.27, 0.86, 0.12), 0.07, 0.16, M["Black"], fo, rot=ALONG_Y)
        cyl((s * 0.27, 0.945, 0.12), 0.045, 0.02, M["Visor"], fo, rot=ALONG_Y)

def arms_pod():
    # missile-pod arms: a six-tube mini-missile box riding on top of each pauldron, an armoured upper arm and a
    # forearm with an ammo feed rail
    K = kit("P_arms_pod")
    for side, s in SIDES:
        sh = pt(K, "armspod", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.31, M["Joint"], sh)
        box((s * 0.3, 0, 0.1), (0.74, 1.02, 0.64), M["Armor"], sh, bevel=0.07)
        box((s * 0.36, -0.02, 0.62), (0.64, 0.9, 0.42), M["Armor2"], sh, bevel=0.04)
        box((s * 0.36, 0.44, 0.62), (0.6, 0.04, 0.38), M["Frame"], sh)
        for x in (-0.19, 0.0, 0.19):
            for z in (0.52, 0.72):
                cyl((s * 0.36 + x, 0.46, z), 0.066, 0.04, M["Black"], sh, rot=ALONG_Y, verts=12)
                cyl((s * 0.36 + x, 0.43, z), 0.05, 0.04, M["Hazard"], sh, rot=ALONG_Y, verts=12)
        box((s * 0.69, -0.02, 0.62), (0.03, 0.7, 0.12), M["Accent"], sh)
        box((s * 0.36, -0.48, 0.62), (0.4, 0.06, 0.24), M["Frame"], sh)
        ar = pt(K, "armspod", f"M_Arm{side}")
        cyl((0, 0, -0.42), 0.17, 0.84, M["Frame"], ar)
        box((0, 0, -0.4), (0.56, 0.58, 0.64), M["Armor2"], ar, bevel=0.05)
        box((s * 0.29, 0, -0.4), (0.04, 0.38, 0.4), M["Accent"], ar)
        cyl((0, 0, -0.82), 0.22, 0.46, M["Joint"], ar, rot=(0, math.pi / 2, 0))
        fo = pt(K, "armspod", f"M_Fore{side}")
        ball((0, 0, 0), 0.22, M["Joint"], fo)
        box((0, 0.38, -0.04), (0.54, 1.0, 0.54), M["Armor"], fo, bevel=0.06)
        box((s * 0.29, 0.38, -0.04), (0.06, 0.84, 0.14), M["Frame"], fo)
        for y in (0.12, 0.3, 0.48, 0.66):
            box((s * 0.33, y, -0.04), (0.04, 0.1, 0.18), M["Hazard"] if y > 0.6 else M["Armor2"], fo)
        box((0, 0.4, 0.25), (0.1, 0.56, 0.03), M["Visor"], fo)

def arms_fist():
    # brawler arms: spiked heavy pauldrons, a thick upper arm with twin pistons and huge gauntlets with a flared cuff
    # and a row of studs down the outside (kept behind the hand so weapons still fit)
    K = kit("P_arms_fist")
    for side, s in SIDES:
        sh = pt(K, "armsfist", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.33, M["Joint"], sh)
        box((s * 0.32, 0, 0.14), (0.9, 1.12, 0.78), M["Armor"], sh, bevel=0.09)
        box((s * 0.32, 0, 0.55), (0.7, 0.86, 0.08), M["Armor2"], sh, bevel=0.02)
        for k in (-0.3, 0.0, 0.3):
            cyl((s * 0.5, k, 0.62), 0.09, 0.34, M["Frame"], sh, r2=0.012, verts=10)
        box((s * 0.78, 0, 0.12), (0.06, 0.86, 0.46), M["Accent"], sh)
        ar = pt(K, "armsfist", f"M_Arm{side}")
        cyl((0, 0, -0.42), 0.2, 0.84, M["Frame"], ar)
        box((0, 0.02, -0.4), (0.66, 0.66, 0.68), M["Armor2"], ar, bevel=0.06)
        for k in (-1, 1):
            cyl((k * 0.2, 0.36, -0.44), 0.05, 0.6, M["Piston"], ar)
        cyl((0, 0, -0.82), 0.26, 0.52, M["Joint"], ar, rot=(0, math.pi / 2, 0))
        fo = pt(K, "armsfist", f"M_Fore{side}")
        ball((0, 0, 0), 0.25, M["Joint"], fo)
        box((0, 0.36, -0.04), (0.74, 0.86, 0.7), M["Armor"], fo, bevel=0.08)
        box((0, 0.76, -0.04), (0.84, 0.14, 0.8), M["Armor2"], fo, bevel=0.03)
        box((0, 0.76, 0.37), (0.6, 0.06, 0.03), M["Accent"], fo)
        box((s * 0.38, 0.36, -0.04), (0.06, 0.7, 0.52), M["Armor2"], fo, bevel=0.02)
        for y in (0.14, 0.36, 0.58):
            cyl((s * 0.44, y, -0.04), 0.075, 0.2, M["Frame"], fo, r2=0.012, rot=(0, s * math.pi / 2, 0), verts=10)
        cyl((0, -0.12, -0.36), 0.08, 0.28, M["Frame"], fo, r2=0.012, rot=(math.pi * 0.62, 0, 0), verts=10)

# ================================================================= LEGS
# M_Thigh (hips +-0.62,0,-0.12) > M_Shin (0,0,-1.15) > M_Foot (0,0,-1.2); sole ~0.36 under the ankle -> hips 2.75
def legs_heavy():
    # heavy legs: thick thighs and shins, a big knee shield, wide elephant feet with ankle guards
    K = kit("P_legs_heavy")
    for side, s in SIDES:
        th = pt(K, "legsheavy", f"M_Thigh{side}")
        ball((0, 0, 0), 0.3, M["Joint"], th)
        cyl((0, 0, -0.55), 0.2, 1.0, M["Frame"], th)
        box((0, 0.06, -0.52), (0.76, 0.72, 0.92), M["Armor"], th, bevel=0.07)
        box((s * 0.4, 0, -0.52), (0.08, 0.6, 0.74), M["Armor2"], th, bevel=0.02)
        box((0, 0.43, -0.5), (0.12, 0.03, 0.6), M["Accent"], th)
        for k in (-1, 1):
            cyl((k * 0.2, -0.3, -0.55), 0.055, 0.8, M["Piston"], th)
        sh = pt(K, "legsheavy", f"M_Shin{side}")
        ball((0, 0, 0), 0.28, M["Joint"], sh)
        box((0, 0.36, 0.06), (0.68, 0.24, 0.72), M["Armor2"], sh, bevel=0.05)
        box((0, 0.49, 0.1), (0.3, 0.04, 0.4), M["Hazard"], sh)
        wedge((0, 0.06, -0.6), (0.92, 0.92, 1.12), M["Armor"], sh, rot=(math.pi, 0, 0), bevel=0.06, taper=0.88)
        box((0, 0.53, -0.6), (0.1, 0.03, 0.6), M["Visor"], sh)
        for k in (-1, 1):
            grille((k * 0.47, 0.06, -0.6), (0.03, 0.5, 0.46), sh, n=4)
        box((0, -0.38, -0.5), (0.6, 0.36, 0.86), M["Frame"], sh, bevel=0.04)
        bell((0, -0.5, -0.86), 0.22, 0.15, 0.22, sh)
        ft = pt(K, "legsheavy", f"M_Foot{side}")
        ball((0, 0, 0), 0.24, M["Joint"], ft)
        box((0, 0.0, -0.05), (0.86, 0.8, 0.34), M["Armor2"], ft, bevel=0.04)
        box((0, 0.12, -0.24), (1.14, 1.5, 0.24), M["Frame"], ft, bevel=0.05)
        wedge((0, 0.92, -0.24), (1.0, 0.5, 0.24), M["Armor"], ft, bevel=0.03, taper=0.4)
        wedge((0, -0.7, -0.22), (0.7, 0.4, 0.3), M["Armor"], ft, rot=(0, 0, math.pi), bevel=0.03, taper=0.5)
        for k in (-1, 1):
            box((k * 0.52, 0.0, -0.06), (0.06, 0.7, 0.4), M["Armor"], ft, bevel=0.02)
            box((k * 0.58, 0.12, -0.24), (0.03, 1.1, 0.12), M["Hazard"], ft)

def legs_rev():
    # reverse-joint (digitigrade) legs: thigh slants forward to the knee, shin back to a high ankle, long metatarsal
    # foot with a claw toe plate and a rear spur. Pivots move (PV_), the page flips the knee bend.
    K = kit("P_legs_rev")
    knee, ankle = (0, 0.42, -0.92), (0, -0.5, -0.78)
    for side, s in SIDES:
        pv(K, "legsrev", f"M_Shin{side}", knee)
        pv(K, "legsrev", f"M_Foot{side}", ankle)
        pv(K, "legsrev", f"T_Leg{side}", (0, -0.36, -0.2))
        th = pt(K, "legsrev", f"M_Thigh{side}")
        ball((0, 0, 0), 0.27, M["Joint"], th)
        a = R(24.5)
        rod((0, 0, 0), knee, 0.15, M["Frame"], th)
        box((0, 0.21 + 0.06, -0.46), (0.58, 0.5, 0.86), M["Armor"], th, rot=(a, 0, 0), bevel=0.05)
        box((s * 0.31, 0.21, -0.46), (0.06, 0.42, 0.64), M["Armor2"], th, rot=(a, 0, 0), bevel=0.02)
        box((0, 0.5, -0.44), (0.1, 0.03, 0.5), M["Accent"], th, rot=(a, 0, 0))
        cyl((0, -0.06, -0.5), 0.05, 0.8, M["Piston"], th, rot=(a, 0, 0))
        sh = pt(K, "legsrev", f"M_Shin{side}")
        ball((0, 0, 0), 0.25, M["Joint"], sh)
        wedge((0, 0.2, 0.06), (0.46, 0.3, 0.42), M["Armor2"], sh, bevel=0.03, taper=0.6)
        b = R(-32.7)
        rod((0, 0, 0), ankle, 0.13, M["Frame"], sh)
        box((0, -0.22, -0.4), (0.5, 0.5, 0.9), M["Armor"], sh, rot=(b, 0, 0), bevel=0.05)
        box((0, -0.05, -0.38), (0.08, 0.03, 0.6), M["Visor"], sh, rot=(b, 0, 0))
        for k in (-1, 1):
            grille((k * 0.27, -0.24, -0.4), (0.03, 0.3, 0.4), sh, n=3)
        box((0, -0.42, -0.16), (0.38, 0.3, 0.42), M["Frame"], sh, bevel=0.03)
        bell((0, -0.36, -0.08), 0.15, 0.1, 0.16, sh)
        ft = pt(K, "legsrev", f"M_Foot{side}")
        ball((0, 0, 0), 0.2, M["Joint"], ft)
        rod((0, 0, 0), (0, 0.18, -0.78), 0.11, M["Frame"], ft)
        box((0, 0.1, -0.4), (0.36, 0.34, 0.7), M["Armor2"], ft, rot=(R(12.4), 0, 0), bevel=0.03)
        box((0, 0.3, -0.86), (0.62, 0.86, 0.14), M["Frame"], ft, bevel=0.03)
        for k in (-1, 0, 1):
            wedge((k * 0.22, 0.84, -0.86), (0.18, 0.4, 0.14), M["Armor"], ft, bevel=0.02, taper=0.3)
        wedge((0, -0.26, -0.84), (0.26, 0.4, 0.16), M["Armor"], ft, rot=(0, 0, math.pi), bevel=0.02, taper=0.3)
        for k in (-1, 1):
            box((k * 0.32, 0.3, -0.84), (0.03, 0.66, 0.08), M["Hazard"], ft)

def legs_tread():
    # tank treads under the hips (thighs hidden): chassis block with a turret ring, two belt pods with rounded
    # ends, armoured side skirts, spinning hub caps (TRW*), front glacis and rear exhausts
    K = kit("P_legs_tread")
    for side, _ in SIDES:
        ph(K, "legstread", f"M_Thigh{side}")
    g = pt(K, "legstread", "M_Hips")
    # the hips' own pelvis meshes are replaced, so the chassis reaches up to the torso joint
    cyl((0, 0, 0.1), 0.5, 0.2, M["Joint"], g, verts=20)
    box((0, 0, -0.14), (1.16, 1.0, 0.34), M["Armor2"], g, bevel=0.04)
    box((0, 0, -0.85), (1.3, 1.9, 1.2), M["Frame"], g, bevel=0.06)
    wedge((0, 0.95, -1.0), (1.2, 0.4, 0.8), M["Armor"], g, rot=(R(-30), 0, 0), bevel=0.04, taper=0.7)
    box((0, 1.06, -0.82), (0.7, 0.04, 0.06), M["Accent"], g, rot=(R(-30), 0, 0))
    box((0, -0.98, -1.0), (1.1, 0.12, 0.8), M["Armor2"], g, bevel=0.03)
    for k in (-1, 1):
        cyl((k * 0.32, -1.08, -1.1), 0.12, 0.2, M["Nozzle"], g, rot=ALONG_Y)
    for side, s in SIDES:
        x = s * 0.95
        box((x, 0, -2.15), (0.62, 2.9, 1.2), M["Black"], g, bevel=0.03)
        for y in (-1.45, 1.45):
            cyl((x, y, -2.15), 0.6, 0.62, M["Black"], g, rot=(0, math.pi / 2, 0), verts=16)
            cyl((x + s * 0.32, y, -2.15), 0.34, 0.04, M["Frame"], g, rot=(0, math.pi / 2, 0), verts=12)
        for i in range(9):
            box((x, -1.2 + i * 0.3, -1.53), (0.66, 0.1, 0.05), M["Frame"], g)
        box((x + s * 0.34, 0, -1.7), (0.08, 2.7, 0.62), M["Armor"], g, bevel=0.03)
        box((x + s * 0.39, 0, -1.6), (0.03, 2.2, 0.08), M["Accent"], g)
        box((x + s * 0.39, 0.7, -1.82), (0.03, 0.6, 0.1), M["Hazard"], g)
        box((x, 0, -1.38), (0.7, 2.8, 0.06), M["Armor2"], g, bevel=0.02)
        for y in (-0.75, 0.0, 0.75):
            wh = wheel((x + s * 0.33, y, -2.3), 0.3, 0.05, M["Frame"], g)
            # spokes live in the wheel's own frame (its local Z = world X) so they spin with it
            box((0, 0, s * 0.035), (0.5, 0.07, 0.03), M["Armor2"], wh)
            box((0, 0, s * 0.035), (0.07, 0.5, 0.03), M["Armor2"], wh)
            cyl((0, 0, s * 0.05), 0.1, 0.04, M["Joint"], wh, verts=10)

# ================================================================= PACKS (M_Pack local; T_Back1 -x, T_Back2 +x)
def pack_sprint():
    # high-mobility pack: slim core, two long angled nacelles with big bells, long swept blade wings
    K = kit("P_pack_sprint"); g = pt(K, "packsprint", "M_Pack")
    box((0, 0, 0.05), (0.86, 0.46, 0.92), M["Frame"], g, bevel=0.05)
    grille((0, -0.25, 0.1), (0.4, 0.05, 0.5), g, n=5)
    box((0, -0.25, 0.5), (0.4, 0.03, 0.05), M["Hazard"], g)
    for idx, s in ((1, -1), (2, 1)):
        x, y = s * 0.52, -0.28
        pv(K, "packsprint", f"T_Back{idx}", (x, y, -1.18))
        cyl((x, y, -0.2), 0.25, 1.4, M["Armor"], g, verts=16, rot=(R(8), 0, 0))
        for z in (0.2, -0.6):
            cyl((x, y + z * 0.14, z), 0.265, 0.07, M["Frame"], g, verts=16, rot=(R(8), 0, 0))
        cyl((x, y + 0.04, 0.56), 0.15, 0.16, M["Accent"], g, verts=16)
        box((x + s * 0.2, y - 0.05, -0.2), (0.16, 0.04, 0.9), M["Armor2"], g, rot=(R(8), 0, 0))
        bell((x, y - 0.13, -1.0), 0.3, 0.21, 0.34, g)
        cable([(x, y + 0.1, 0.5), (s * 0.3, -0.1, 0.62), (s * 0.12, 0.0, 0.5)], 0.035, M["Black"], g)
        wg = pt(K, "packsprint", f"M_Wing{side_name(s)}")
        box((s * 0.8, -0.1, 0.1), (1.6, 0.06, 0.26), M["Armor"], wg, rot=(0, R(s * 6), 0), bevel=0.02)
        box((s * 1.1, -0.1, 0.24), (1.0, 0.07, 0.05), M["Accent"], wg, rot=(0, R(s * 6), 0))
        box((s * 0.9, -0.14, 0.02), (1.1, 0.03, 0.04), M["NozzleGlow"], wg, rot=(0, R(s * 6), 0))
        cyl((s * 1.55, -0.1, 0.12), 0.07, 0.16, M["Nozzle"], wg, r2=0.1, rot=(math.pi, 0, 0))

def pack_tank():
    # tank pack: wide box with two horizontal propellant tanks, hazard bands, smaller bells, radiator stub wings
    K = kit("P_pack_tank"); g = pt(K, "packtank", "M_Pack")
    box((0, 0.02, 0.05), (1.46, 0.56, 1.12), M["Frame"], g, bevel=0.06)
    for z in (0.32, -0.22):
        cyl((0, -0.42, z), 0.27, 1.42, M["Armor"], g, rot=(0, math.pi / 2, 0), verts=18)
        for x in (-0.72, 0.72):
            ball((x, -0.42, z), 0.27, M["Armor"], g, scale=(0.4, 1, 1))
        for x in (-0.36, 0.36):
            cyl((x, -0.42, z), 0.285, 0.08, M["Hazard"], g, rot=(0, math.pi / 2, 0), verts=18)
    box((0, -0.42, 0.05), (0.12, 0.6, 0.3), M["Frame"], g)
    for idx, s in ((1, -1), (2, 1)):
        bell((s * 0.45, -0.2, -0.62), 0.22, 0.15, 0.26, g)
        cable([(s * 0.6, -0.5, 0.55), (s * 0.74, -0.3, 0.68), (s * 0.7, 0.05, 0.6)], 0.04, M["Black"], g)
        wg = pt(K, "packtank", f"M_Wing{side_name(s)}")
        box((s * 0.42, -0.1, 0.0), (0.7, 0.08, 0.5), M["Armor2"], wg, bevel=0.02)
        grille((s * 0.42, -0.15, 0.0), (0.56, 0.03, 0.38), wg, n=4, axis="x")
        box((s * 0.78, -0.1, 0.0), (0.06, 0.1, 0.54), M["Accent"], wg)

def pack_glide():
    # glide pack: slim spine with one central bell pair, big fanned feather wings with glowing trailing edges
    K = kit("P_pack_glide"); g = pt(K, "packglide", "M_Pack")
    box((0, 0, 0.1), (0.7, 0.44, 1.0), M["Frame"], g, bevel=0.05)
    wedge((0, -0.12, 0.62), (0.6, 0.36, 0.2), M["Armor"], g, bevel=0.03, taper=0.6)
    box((0, -0.24, 0.1), (0.06, 0.04, 0.8), M["Accent"], g)
    for idx, s in ((1, -1), (2, 1)):
        cyl((s * 0.28, -0.18, -0.3), 0.18, 0.6, M["Armor"], g, verts=14)
        bell((s * 0.28, -0.18, -0.68), 0.2, 0.14, 0.22, g)
        wg = pt(K, "packglide", f"M_Wing{side_name(s)}")
        box((s * 0.3, -0.1, 0.1), (0.6, 0.12, 0.3), M["Frame"], wg, bevel=0.03)
        for j, (L, ang, w) in enumerate(((2.0, 18, 0.34), (1.7, 2, 0.3), (1.4, -14, 0.26))):
            rot = (0, R(s * -ang), 0)
            ca, sa = math.cos(R(ang)), math.sin(R(ang))
            cx, cz = s * (0.45 + L / 2 * ca), 0.1 + L / 2 * sa
            box((cx, -0.1 - j * 0.04, cz), (L, 0.05, w), M["Armor"] if j != 1 else M["Armor2"], wg, rot=rot, bevel=0.015)
            box((cx, -0.13 - j * 0.04, cz - w * 0.42 * ca), (L * 0.9, 0.03, 0.04), M["NozzleGlow"], wg, rot=rot)
        cyl((s * 2.3, -0.1, 0.7), 0.05, 0.14, M["Accent"], wg, rot=(0, R(s * -18), 0))

# ================================================================= v61.1 additions
def head_radar():
    # radar head: low armoured helm with a wide visor band, a mast on top carrying a rotating dish (SPN_ empty: the
    # page spins it about its own vertical axis)
    K = kit("P_head_radar"); g = pt(K, "headradar", "M_Head")
    cyl((0, 0, 0.06), 0.19, 0.17, M["Joint"], g)
    box((0, 0.02, 0.24), (0.62, 0.66, 0.34), M["Armor"], g, bevel=0.06)
    box((0, 0.34, 0.26), (0.56, 0.06, 0.1), M["Black"], g)
    box((0, 0.36, 0.26), (0.46, 0.03, 0.05), M["Visor"], g)
    wedge((0, 0.24, 0.1), (0.48, 0.24, 0.14), M["Armor2"], g, rot=(math.pi, 0, 0), bevel=0.02, taper=0.6)
    for s in (-1, 1):
        box((s * 0.34, -0.02, 0.24), (0.08, 0.5, 0.26), M["Armor2"], g, bevel=0.02)
        cyl((s * 0.39, 0.1, 0.24), 0.06, 0.05, M["Visor"], g, rot=(0, math.pi / 2, 0), verts=10)
    box((0, -0.3, 0.26), (0.44, 0.12, 0.3), M["Frame"], g, bevel=0.02)
    cyl((0, -0.08, 0.52), 0.12, 0.2, M["Frame"], g, verts=12)
    sp = empty("SPN_radar", (0, -0.08, 0.66), g)
    cyl((0, 0, 0.0), 0.05, 0.22, M["Piston"], sp, verts=8)
    box((0, 0, 0.14), (0.9, 0.1, 0.32), M["Armor2"], sp, bevel=0.02)
    box((0, 0.06, 0.14), (0.8, 0.02, 0.22), M["Frame"], sp)
    box((0, 0.075, 0.14), (0.6, 0.01, 0.04), M["Visor"], sp)
    for s in (-1, 1):
        box((s * 0.46, 0, 0.14), (0.04, 0.12, 0.36), M["Accent"], sp)

def core_reactor():
    # reactor chest: rounded chest block around a glowing reactor eye, coolant pipes running up to the shoulders,
    # heat-sink fins on the flanks
    K = kit("P_core_reactor"); g = pt(K, "corereactor", "M_Torso")
    box((0, 0, 0.22), (0.96, 0.7, 0.56), M["Frame"], g, bevel=0.05)
    cyl((0, 0, 0.0), 0.34, 0.2, M["Joint"], g, verts=16)
    for i in range(3):
        box((0, 0.36, 0.06 + i * 0.16), (0.7 + i * 0.06, 0.1, 0.12), M["Armor2"] if i % 2 == 0 else M["Armor"], g, bevel=0.02)
    box((0, 0.0, 0.56), (1.2, 0.84, 0.14), M["Armor2"], g, bevel=0.03)
    box((0, -0.02, 1.02), (1.76, 1.04, 0.88), M["Armor"], g, bevel=0.1)
    cyl((0, 0.52, 1.04), 0.36, 0.14, M["Armor2"], g, rot=ALONG_Y, verts=20)
    cyl((0, 0.58, 1.04), 0.27, 0.06, M["Black"], g, rot=ALONG_Y, verts=20)
    ball((0, 0.56, 1.04), 0.2, M["NozzleGlow"], g, scale=(1, 0.5, 1))
    torus((0, 0.6, 1.04), 0.3, 0.035, M["Accent"], g, rot=ALONG_Y)
    for k in range(6):
        a = k / 6 * math.pi * 2
        box((math.cos(a) * 0.32, 0.61, 1.04 + math.sin(a) * 0.32), (0.06, 0.04, 0.06), M["Frame"], g)
    for s in (-1, 1):
        cable([(s * 0.3, 0.56, 1.25), (s * 0.55, 0.5, 1.42), (s * 0.9, 0.2, 1.4)], 0.05, M["Piston"], g)
        cable([(s * 0.3, 0.56, 0.83), (s * 0.62, 0.48, 0.74), (s * 0.86, 0.2, 0.82)], 0.045, M["Black"], g)
        for j in range(4):
            box((s * 0.92, -0.2 + j * 0.13, 1.0), (0.12, 0.04, 0.62), M["Frame"], g)
        box((s * 0.5, 0.45, 1.44), (0.34, 0.12, 0.06), M["Visor"], g)
    box((0, -0.56, 1.0), (1.3, 0.08, 0.7), M["Armor2"], g, bevel=0.02)
    box((0, -0.04, 1.5), (1.04, 0.9, 0.16), M["Frame"], g, bevel=0.04)
    cyl((0, 0.12, 1.6), 0.25, 0.12, M["Joint"], g, verts=16)

def legs_hover():
    # hover skirt (thighs hidden): an armoured column under the hips into a wide octagonal skirt that floats 0.6 m off
    # the ground on four fan pods and a central lift disc (glow strips underneath)
    K = kit("P_legs_hover")
    for side, _ in SIDES:
        ph(K, "legshover", f"M_Thigh{side}")
    g = pt(K, "legshover", "M_Hips")
    cyl((0, 0, 0.1), 0.5, 0.2, M["Joint"], g, verts=20)
    box((0, 0, -0.14), (1.1, 0.96, 0.34), M["Armor2"], g, bevel=0.04)
    box((0, 0, -0.75), (0.9, 0.9, 1.0), M["Frame"], g, bevel=0.05)
    for s in (-1, 1):
        box((s * 0.48, 0, -0.75), (0.06, 0.7, 0.8), M["Armor"], g, bevel=0.02)
        box((0, s * 0.48, -0.7), (0.6, 0.06, 0.6), M["Armor"], g, bevel=0.02)
    cyl((0, 0, -1.55), 1.55, 0.5, M["Armor"], g, verts=8, rot=(0, 0, math.pi / 8))
    cyl((0, 0, -1.93), 1.55, 0.26, M["Frame"], g, verts=8, r2=1.2, rot=(math.pi, 0, math.pi / 8))
    cyl((0, 0, -1.28), 1.42, 0.06, M["Armor2"], g, verts=8, rot=(0, 0, math.pi / 8))
    for k in range(8):
        a = k / 8 * math.pi * 2
        box((math.cos(a) * 1.5, math.sin(a) * 1.5, -1.58), (0.05, 0.5, 0.12) if k % 2 else (0.05, 0.5, 0.06),
            M["Hazard"] if k in (1, 5) else M["Accent"], g, rot=(0, 0, a))
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * 0.95, sy * 0.95
            cyl((x, y, -1.95), 0.42, 0.34, M["Armor2"], g, verts=14)
            torus((x, y, -2.1), 0.4, 0.04, M["Frame"], g)
            cyl((x, y, -2.13), 0.33, 0.02, M["NozzleGlow"], g, verts=14)
    cyl((0, 0, -2.08), 0.6, 0.02, M["NozzleGlow"], g, verts=16)
    box((0, 1.38, -1.5), (0.6, 0.18, 0.2), M["Black"], g)
    box((0, 1.47, -1.5), (0.46, 0.02, 0.05), M["Visor"], g)

QUAD_LEGS = (("FL", -1, 1), ("FR", 1, 1), ("BL", -1, -1), ("BR", 1, -1))
def legs_quad():
    # four spider legs (thighs hidden): chassis under the hips; each leg hangs off a QH_<leg> empty at its hip joint
    # (the page swings it about the vertical and lifts it for a diagonal trot); knee high and out, foot pad on the
    # ground at z -2.75
    K = kit("P_legs_quad")
    for side, _ in SIDES:
        ph(K, "legsquad", f"M_Thigh{side}")
    g = pt(K, "legsquad", "M_Hips")
    cyl((0, 0, 0.1), 0.52, 0.2, M["Joint"], g, verts=20)
    box((0, 0, -0.16), (1.2, 1.1, 0.36), M["Armor2"], g, bevel=0.04)
    box((0, 0, -0.55), (1.5, 1.5, 0.6), M["Frame"], g, bevel=0.06)
    wedge((0, 0.8, -0.5), (1.1, 0.3, 0.5), M["Armor"], g, rot=(R(-20), 0, 0), bevel=0.03, taper=0.7)
    box((0, 0.98, -0.42), (0.5, 0.03, 0.05), M["Visor"], g)
    box((0, -0.82, -0.5), (1.0, 0.14, 0.4), M["Armor"], g, bevel=0.02)
    grille((0, -0.9, -0.5), (0.6, 0.03, 0.24), g, n=4, axis="x")
    for name, sx, sy in QUAD_LEGS:
        H = (sx * 0.72, sy * 0.62, -0.42)
        Kn = (sx * 0.9, sy * 0.78, 0.55)      # knee relative to the hip pivot
        Ft = (sx * 1.25, sy * 1.15, -2.28)    # ankle relative to the hip pivot (pad under it reaches -2.75)
        q = empty(f"QH_{name}", H, g)
        ball((0, 0, 0), 0.26, M["Joint"], q)
        rod((0, 0, 0), Kn, 0.15, M["Frame"], q)
        rod((Kn[0] * 0.15, Kn[1] * 0.15, Kn[2] * 0.15), (Kn[0] * 0.85, Kn[1] * 0.85, Kn[2] * 0.85), 0.24, M["Armor"], q)
        ball(Kn, 0.22, M["Joint"], q)
        wedge((Kn[0], Kn[1], Kn[2] + 0.18), (0.34, 0.34, 0.2), M["Accent"], q, bevel=0.02, taper=0.5)
        rod(Kn, Ft, 0.12, M["Frame"], q)
        m = tuple(Kn[i] + (Ft[i] - Kn[i]) * 0.3 for i in range(3)); m2 = tuple(Kn[i] + (Ft[i] - Kn[i]) * 0.72 for i in range(3))
        rod(m, m2, 0.2, M["Armor2"], q)
        rod(Kn, (Kn[0] + (Ft[0] - Kn[0]) * 0.4, Kn[1] + (Ft[1] - Kn[1]) * 0.4, Kn[2] + (Ft[2] - Kn[2]) * 0.4), 0.05, M["Piston"], q)
        ball(Ft, 0.17, M["Joint"], q)
        cyl((Ft[0], Ft[1], Ft[2] - 0.2), 0.34, 0.14, M["Frame"], q, verts=10)
        cyl((Ft[0], Ft[1], Ft[2] - 0.08), 0.24, 0.14, M["Armor2"], q, verts=10)
        box((Ft[0], Ft[1], Ft[2] - 0.2), (0.7, 0.08, 0.1), M["Hazard"], q, rot=(0, 0, math.atan2(sy, sx)))

def pack_jumpjet():
    # jump-jet pack: compact core between two tall vertical rocket pods with big bells and intake cowls; short
    # stub wings with vents. The thruster anchors move under the pods.
    K = kit("P_pack_jumpjet"); g = pt(K, "packjumpjet", "M_Pack")
    box((0, 0, 0.1), (0.8, 0.5, 0.9), M["Frame"], g, bevel=0.05)
    grille((0, -0.27, 0.15), (0.4, 0.04, 0.5), g, n=4)
    for idx, s in ((1, -1), (2, 1)):
        x, y = s * 0.6, -0.3
        pv(K, "packjumpjet", f"T_Back{idx}", (x, y, -1.3))
        cyl((x, y, -0.15), 0.3, 1.5, M["Armor"], g, verts=16)
        ball((x, y, 0.6), 0.3, M["Armor"], g, scale=(1, 1, 0.7))
        cyl((x, y + 0.2, 0.42), 0.14, 0.2, M["Black"], g, rot=ALONG_Y, verts=12)
        for z in (0.3, -0.35):
            cyl((x, y, z), 0.315, 0.07, M["Hazard"] if z > 0 else M["Frame"], g, verts=16)
        box((x + s * 0.3, y, -0.1), (0.06, 0.12, 1.0), M["Accent"], g)
        bell((x, y, -1.08), 0.36, 0.24, 0.42, g)
        rod((x, y + 0.3, 0.2), (s * 0.2, 0.0, 0.3), 0.06, M["Frame"], g)
        wg = pt(K, "packjumpjet", f"M_Wing{side_name(s)}")
        box((s * 0.36, -0.1, 0.0), (0.6, 0.1, 0.34), M["Armor2"], wg, bevel=0.02)
        grille((s * 0.36, -0.16, 0.0), (0.44, 0.03, 0.22), wg, n=3, axis="x")
        cyl((s * 0.66, -0.1, -0.04), 0.07, 0.16, M["Nozzle"], wg, r2=0.1, rot=(math.pi, 0, 0))

def head_ew():
    # electronic-warfare head: narrow wedge helm with a blade visor, a rear sensor dome with a spinning emitter ring
    # (SPN_ew), and swept whip-antenna arrays on both temples
    K = kit("P_head_ew"); g = pt(K, "headew", "M_Head")
    cyl((0, 0, 0.06), 0.18, 0.17, M["Joint"], g)
    wedge((0, 0.12, 0.24), (0.56, 0.7, 0.3), M["Armor"], g, bevel=0.04, taper=0.7)
    box((0, 0.46, 0.24), (0.44, 0.05, 0.07), M["Black"], g)
    box((0, 0.48, 0.24), (0.38, 0.02, 0.035), M["Visor"], g)
    wedge((0, 0.36, 0.08), (0.36, 0.22, 0.1), M["Frame"], g, rot=(math.pi, 0, 0), bevel=0.02, taper=0.6)
    box((0, -0.18, 0.3), (0.5, 0.36, 0.36), M["Armor2"], g, bevel=0.04)
    ball((0, -0.22, 0.5), 0.2, M["Frame"], g, scale=(1, 1, 0.7))
    torus((0, -0.22, 0.5), 0.2, 0.025, M["Accent"], g)
    sp = empty("SPN_ew", (0, -0.22, 0.6), g)
    torus((0, 0, 0), 0.13, 0.02, M["Armor2"], sp)
    for k in range(3):
        a = k / 3 * math.pi * 2
        box((math.cos(a) * 0.13, math.sin(a) * 0.13, 0.03), (0.06, 0.06, 0.06), M["Visor"], sp)
    for s in (-1, 1):
        box((s * 0.3, 0.0, 0.26), (0.08, 0.44, 0.22), M["Armor2"], g, bevel=0.02)
        for j, (ln, lean) in enumerate(((0.62, 14), (0.48, 26), (0.36, 38))):
            a = R(-lean)
            base = (s * 0.33, -0.12 - j * 0.1, 0.34)
            tip = (base[0] + s * math.sin(R(10)) * ln, base[1] + math.sin(a) * ln, base[2] + math.cos(a) * ln)
            rod(base, tip, 0.016, M["Piston"], g)
            ball(tip, 0.028, M["Visor"], g, sub=1)
        cyl((s * 0.35, 0.18, 0.26), 0.05, 0.04, M["Visor"], g, rot=(0, math.pi / 2, 0), verts=10)

def core_nanite():
    # nanite core: faceted chest of hexagonal armour cells over a glowing repair lattice, a nanite reservoir drum in
    # the sternum and feed lines to the shoulders
    K = kit("P_core_nanite"); g = pt(K, "corenanite", "M_Torso")
    box((0, 0, 0.22), (0.9, 0.66, 0.56), M["Frame"], g, bevel=0.05)
    cyl((0, 0, 0.0), 0.34, 0.2, M["Joint"], g, verts=16)
    for i in range(3):
        box((0, 0.34, 0.06 + i * 0.16), (0.64 + i * 0.06, 0.1, 0.12), M["Armor"] if i % 2 == 0 else M["Armor2"], g, bevel=0.02)
    box((0, 0.0, 0.56), (1.16, 0.82, 0.14), M["Armor2"], g, bevel=0.03)
    box((0, -0.02, 1.02), (1.66, 0.98, 0.86), M["Frame"], g, bevel=0.08)
    box((0, 0.46, 1.02), (1.3, 0.04, 0.62), M["Visor"], g)
    for row in range(3):
        for col in range(4 - row % 2):
            x = (col - (3 - row % 2) / 2) * 0.36
            z = 0.8 + row * 0.22
            cyl((x, 0.5, z), 0.17, 0.08, M["Armor"] if (row + col) % 3 else M["Armor2"], g, rot=ALONG_Y, verts=6, smooth=False)
    cyl((0, 0.58, 1.02), 0.16, 0.2, M["Armor2"], g, rot=ALONG_Y, verts=14)
    cyl((0, 0.66, 1.02), 0.1, 0.04, M["Visor"], g, rot=ALONG_Y, verts=14)
    for s in (-1, 1):
        box((s * 0.84, 0.02, 1.04), (0.14, 0.84, 0.72), M["Armor"], g, bevel=0.04)
        for j in range(3):
            box((s * 0.92, -0.22 + j * 0.22, 1.04), (0.03, 0.12, 0.5), M["Visor"], g)
        cable([(s * 0.16, 0.6, 1.14), (s * 0.5, 0.56, 1.42), (s * 0.88, 0.2, 1.4)], 0.04, M["Piston"], g)
    box((0, -0.54, 1.0), (1.24, 0.08, 0.68), M["Armor2"], g, bevel=0.02)
    box((0, -0.04, 1.5), (1.0, 0.88, 0.16), M["Armor2"], g, bevel=0.04)
    cyl((0, 0.12, 1.6), 0.25, 0.12, M["Joint"], g, verts=16)

def legs_wheel():
    # wheel legs: slim armoured legs ending in inline twin-wheel skates (TRW* wheels, r 0.3, roll with speed). The
    # page holds a skating crouch instead of a walk cycle.
    K = kit("P_legs_wheel")
    for side, s in SIDES:
        th = pt(K, "legswheel", f"M_Thigh{side}")
        ball((0, 0, 0), 0.26, M["Joint"], th)
        cyl((0, 0, -0.55), 0.15, 1.0, M["Frame"], th)
        wedge((0, 0.08, -0.5), (0.52, 0.5, 0.86), M["Armor"], th, rot=(math.pi, 0, 0), bevel=0.05, taper=0.75)
        box((s * 0.27, 0.0, -0.5), (0.05, 0.4, 0.6), M["Armor2"], th, bevel=0.02)
        box((0, 0.34, -0.42), (0.08, 0.03, 0.46), M["Accent"], th)
        sh = pt(K, "legswheel", f"M_Shin{side}")
        ball((0, 0, 0), 0.24, M["Joint"], sh)
        box((0, 0.26, 0.04), (0.46, 0.2, 0.46), M["Armor2"], sh, bevel=0.04)
        box((0, 0.05, -0.58), (0.5, 0.52, 1.0), M["Armor"], sh, bevel=0.05)
        box((0, 0.32, -0.6), (0.08, 0.03, 0.6), M["Visor"], sh)
        for k in (-1, 1):
            cyl((k * 0.18, -0.3, -0.62), 0.05, 0.9, M["Piston"], sh)
            box((k * 0.27, 0.05, -0.75), (0.04, 0.4, 0.5), M["Hazard"] if k > 0 else M["Armor2"], sh)
        box((0, -0.32, -0.3), (0.36, 0.2, 0.5), M["Frame"], sh, bevel=0.03)
        ft = pt(K, "legswheel", f"M_Foot{side}")
        ball((0, 0, 0), 0.2, M["Joint"], ft)
        box((0, 0.04, -0.06), (0.4, 0.5, 0.2), M["Armor2"], ft, bevel=0.03)
        box((0, 0.02, 0.34 - 0.36 - 0.06), (0.16, 1.2, 0.1), M["Frame"], ft, bevel=0.02)
        for y in (0.36, -0.32):
            for k in (-1, 1):
                box((k * 0.17, y, -0.08), (0.04, 0.2, 0.18), M["Frame"], ft)
            wh = wheel((0, y, -0.06), 0.3, 0.26, M["Black"], ft)
            cyl((0, 0, 0), 0.2, 0.28, M["Frame"], wh, verts=12)
            box((0, 0, 0), (0.3, 0.05, 0.3), M["Armor2"], wh)
            box((0, 0, 0), (0.05, 0.3, 0.3), M["Armor2"], wh)
            cyl((0, 0, 0), 0.07, 0.31, M["Accent"], wh, verts=8)
        wedge((0, 0.62, -0.06), (0.32, 0.26, 0.2), M["Armor"], ft, rot=(R(-60), 0, 0), bevel=0.02, taper=0.5)
        box((0, -0.56, 0.0), (0.24, 0.14, 0.24), M["Armor"], ft, bevel=0.02)
        box((0, 0.04, 0.06), (0.04, 0.6, 0.04), M["NozzleGlow"], ft)

def pack_aegis():
    # aegis pack: compact core under a shield-generator dome, two tall emitter pylons with glowing capacitor tips
    # and short bells; the thruster anchors move under the bells
    K = kit("P_pack_aegis"); g = pt(K, "packaegis", "M_Pack")
    box((0, 0, 0.05), (1.0, 0.52, 1.0), M["Frame"], g, bevel=0.06)
    grille((0, -0.27, -0.05), (0.5, 0.04, 0.44), g, n=4)
    cyl((0, -0.12, 0.62), 0.4, 0.14, M["Armor2"], g, verts=18)
    ball((0, -0.12, 0.7), 0.34, M["Armor"], g, scale=(1, 1, 0.6))
    torus((0, -0.12, 0.72), 0.3, 0.03, M["Visor"], g)
    ball((0, -0.12, 0.88), 0.09, M["Visor"], g, sub=1)
    for idx, s in ((1, -1), (2, 1)):
        x = s * 0.66
        pv(K, "packaegis", f"T_Back{idx}", (s * 0.4, -0.24, -0.9))
        box((x, -0.06, 0.1), (0.22, 0.3, 1.1), M["Armor"], g, bevel=0.03)
        box((x + s * 0.12, -0.06, 0.1), (0.03, 0.2, 0.8), M["Accent"], g)
        rod((x, -0.06, 0.62), (s * 0.82, -0.14, 1.5), 0.07, M["Frame"], g)
        for t in (0.35, 0.65):
            cyl((x + (s * 0.82 - x) * t, -0.06 - 0.08 * t, 0.62 + 0.88 * t), 0.1, 0.06, M["Armor2"], g, verts=10)
        ball((s * 0.82, -0.14, 1.56), 0.12, M["NozzleGlow"], g, sub=2)
        torus((s * 0.82, -0.14, 1.56), 0.15, 0.025, M["Frame"], g)
        bell((s * 0.4, -0.24, -0.62), 0.2, 0.14, 0.24, g)
        cable([(s * 0.2, -0.2, 0.62), (s * 0.5, -0.32, 0.5), (x, -0.22, 0.3)], 0.035, M["Black"], g)
        wg = pt(K, "packaegis", f"M_Wing{side_name(s)}")
        box((s * 0.32, -0.1, 0.0), (0.5, 0.08, 0.3), M["Armor2"], wg, bevel=0.02)
        box((s * 0.5, -0.15, 0.0), (0.12, 0.03, 0.2), M["Visor"], wg)

head_radar(); core_reactor(); legs_hover(); legs_quad(); pack_jumpjet()
def head_hunter():
    # hunter head: low wide helm with a slit visor and a long monocular scope on the right temple, swept cheek fins
    K = kit("P_head_hunter"); g = pt(K, "headhunter", "M_Head")
    cyl((0, 0, 0.06), 0.18, 0.17, M["Joint"], g)
    box((0, 0.06, 0.22), (0.64, 0.7, 0.26), M["Armor"], g, bevel=0.05)
    wedge((0, 0.16, 0.39), (0.5, 0.56, 0.1), M["Armor2"], g, bevel=0.02, taper=0.6)
    box((0, 0.42, 0.22), (0.56, 0.05, 0.08), M["Black"], g)
    box((0, 0.44, 0.22), (0.5, 0.02, 0.03), M["Visor"], g)
    wedge((0, 0.34, 0.06), (0.44, 0.26, 0.1), M["Frame"], g, rot=(math.pi, 0, 0), bevel=0.02, taper=0.6)
    box((0, -0.3, 0.24), (0.46, 0.2, 0.3), M["Armor2"], g, bevel=0.03)
    cyl((0.4, 0.2, 0.3), 0.08, 0.86, M["Frame"], g, rot=ALONG_Y)
    for y in (-0.12, 0.3):
        cyl((0.4, y, 0.3), 0.1, 0.1, M["Armor2"], g, rot=ALONG_Y)
    cyl((0.4, 0.64, 0.3), 0.065, 0.03, M["Visor"], g, rot=ALONG_Y)
    box((0.33, 0.1, 0.3), (0.08, 0.16, 0.06), M["Frame"], g)
    for sd in (-1, 1):
        wedge((sd * 0.36, -0.08, 0.12), (0.08, 0.5, 0.26), M["Armor"], g, rot=(R(-15), 0, 0), bevel=0.01, taper=0.4)
    box((-0.3, 0.3, 0.3), (0.04, 0.2, 0.04), M["Accent"], g)

def core_reclaim():
    # reclaim core: blocky chest with a big salvage intake in the sternum (dark mouth, crusher slats), two collection
    # drums on the flanks and hazard trim
    K = kit("P_core_reclaim"); g = pt(K, "corereclaim", "M_Torso")
    box((0, 0, 0.22), (0.92, 0.66, 0.56), M["Frame"], g, bevel=0.05)
    cyl((0, 0, 0.0), 0.34, 0.2, M["Joint"], g, verts=16)
    for i in range(3):
        box((0, 0.34, 0.06 + i * 0.16), (0.66 + i * 0.05, 0.1, 0.12), M["Armor2"] if i % 2 else M["Armor"], g, bevel=0.02)
    box((0, 0.0, 0.56), (1.18, 0.82, 0.14), M["Armor2"], g, bevel=0.03)
    box((0, -0.02, 1.02), (1.7, 1.0, 0.86), M["Armor"], g, bevel=0.08)
    box((0, 0.5, 1.0), (0.8, 0.08, 0.5), M["Black"], g)
    for i in range(5):
        box((-0.3 + i * 0.15, 0.53, 1.0), (0.06, 0.06, 0.46), M["Piston"], g)
    box((0, 0.52, 1.28), (0.9, 0.06, 0.06), M["Hazard"], g)
    box((0, 0.52, 0.72), (0.9, 0.06, 0.06), M["Hazard"], g)
    box((0, 0.54, 1.38), (0.5, 0.03, 0.04), M["Visor"], g)
    for sd in (-1, 1):
        cyl((sd * 0.86, 0.04, 1.02), 0.26, 0.7, M["Armor2"], g, verts=16)
        for z in (0.78, 1.26):
            cyl((sd * 0.86, 0.04, z), 0.28, 0.06, M["Frame"], g, verts=16)
        cyl((sd * 0.86, 0.04, 1.4), 0.12, 0.08, M["Visor"], g, verts=12)
        cable([(sd * 0.7, 0.3, 1.3), (sd * 0.5, 0.52, 1.36), (sd * 0.3, 0.54, 1.2)], 0.04, M["Black"], g)
    box((0, -0.54, 1.0), (1.24, 0.08, 0.68), M["Armor2"], g, bevel=0.02)
    box((0, -0.04, 1.5), (1.02, 0.88, 0.16), M["Armor2"], g, bevel=0.04)
    cyl((0, 0.12, 1.6), 0.25, 0.12, M["Joint"], g, verts=16)

def arms_rapid():
    # rapid-fire arms: compact pauldrons with an ammo box, a feed belt down to the forearm, finned barrel-cooling
    # forearms with a glowing heat strip
    K = kit("P_arms_rapid")
    for side, s in SIDES:
        sh = pt(K, "armsrapid", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.3, M["Joint"], sh)
        box((s * 0.26, 0.0, 0.08), (0.62, 0.8, 0.56), M["Armor"], sh, bevel=0.07)
        box((s * 0.34, -0.36, 0.1), (0.4, 0.3, 0.4), M["Armor2"], sh, bevel=0.03)
        box((s * 0.34, -0.52, 0.1), (0.3, 0.03, 0.26), M["Hazard"], sh)
        box((s * 0.36, 0.42, 0.18), (0.24, 0.03, 0.05), M["Visor"], sh)
        ar = pt(K, "armsrapid", f"M_Arm{side}")
        cyl((0, 0, -0.42), 0.15, 0.84, M["Frame"], ar)
        box((0, 0, -0.36), (0.44, 0.46, 0.54), M["Armor2"], ar, bevel=0.05)
        cable([(s * 0.18, -0.26, 0.1), (s * 0.26, -0.3, -0.4), (s * 0.2, -0.22, -0.8)], 0.05, M["Piston"], ar)
        cyl((0, 0, -0.82), 0.2, 0.44, M["Joint"], ar, rot=(0, math.pi / 2, 0))
        fo = pt(K, "armsrapid", f"M_Fore{side}")
        ball((0, 0, 0), 0.2, M["Joint"], fo)
        box((0, 0.4, -0.04), (0.4, 1.1, 0.4), M["Armor"], fo, bevel=0.05)
        for i in range(6):
            box((0, 0.12 + i * 0.13, -0.04), (0.5, 0.04, 0.5), M["Frame"], fo)
        box((s * 0.22, 0.42, -0.04), (0.03, 0.86, 0.1), M["NozzleGlow"], fo)
        box((0, 0.42, 0.2), (0.24, 0.9, 0.06), M["Armor2"], fo)

def legs_spring():
    # spring legs: slim thighs, shins carrying an exposed coil spring around a damper rod, wide feet with a sprung
    # heel pad. They walk like standard legs; the page gives them a second jump in mid-air.
    K = kit("P_legs_spring")
    for side, s in SIDES:
        th = pt(K, "legsspring", f"M_Thigh{side}")
        ball((0, 0, 0), 0.27, M["Joint"], th)
        cyl((0, 0, -0.55), 0.16, 1.0, M["Frame"], th)
        wedge((0, 0.08, -0.48), (0.56, 0.52, 0.84), M["Armor"], th, rot=(math.pi, 0, 0), bevel=0.05, taper=0.78)
        box((s * 0.29, 0.0, -0.5), (0.05, 0.42, 0.6), M["Armor2"], th, bevel=0.02)
        sh = pt(K, "legsspring", f"M_Shin{side}")
        ball((0, 0, 0), 0.25, M["Joint"], sh)
        box((0, 0.28, 0.04), (0.5, 0.2, 0.46), M["Armor2"], sh, bevel=0.04)
        box((0, 0.1, -0.2), (0.46, 0.46, 0.3), M["Armor"], sh, bevel=0.04)
        cyl((0, 0.0, -0.62), 0.07, 0.8, M["Piston"], sh)
        for i in range(7):
            torus((0, 0.0, -0.36 - i * 0.075), 0.2, 0.035, M["Hazard"] if i % 2 == 0 else M["Accent"], sh)
        box((0, 0.06, -0.98), (0.5, 0.5, 0.3), M["Armor"], sh, bevel=0.04)
        box((0, 0.32, -0.98), (0.08, 0.03, 0.2), M["Visor"], sh)
        for k in (-1, 1):
            box((k * 0.26, -0.06, -0.62), (0.05, 0.12, 0.7), M["Frame"], sh)
        ft = pt(K, "legsspring", f"M_Foot{side}")
        ball((0, 0, 0), 0.22, M["Joint"], ft)
        box((0, 0.04, -0.06), (0.6, 0.6, 0.26), M["Armor2"], ft, bevel=0.03)
        box((0, 0.16, -0.26), (0.86, 1.36, 0.18), M["Frame"], ft, bevel=0.04)
        wedge((0, 0.86, -0.24), (0.78, 0.36, 0.2), M["Armor"], ft, bevel=0.02, taper=0.45)
        for i in range(3):
            torus((0, -0.44, -0.24 + i * 0.07), 0.15, 0.03, M["Hazard"], ft)
        box((0, -0.44, -0.04), (0.36, 0.3, 0.1), M["Armor"], ft, bevel=0.02)

def pack_drone():
    # drone pack: a slim pack with a docking cradle on top (two prongs, a glowing landing ring). The page flies a
    # D_Mini escort drone out of it for the whole sortie.
    K = kit("P_pack_drone"); g = pt(K, "packdrone", "M_Pack")
    box((0, 0, 0.0), (0.92, 0.5, 1.0), M["Frame"], g, bevel=0.06)
    grille((0, -0.26, -0.1), (0.46, 0.04, 0.5), g, n=4)
    box((0, -0.04, 0.56), (0.8, 0.5, 0.12), M["Armor2"], g, bevel=0.03)
    cyl((0, -0.04, 0.66), 0.3, 0.06, M["Black"], g, verts=20)
    torus((0, -0.04, 0.7), 0.3, 0.03, M["Visor"], g)
    for sd in (-1, 1):
        box((sd * 0.38, -0.04, 0.82), (0.08, 0.36, 0.34), M["Armor"], g, bevel=0.02)
        box((sd * 0.42, -0.04, 0.96), (0.03, 0.2, 0.04), M["Accent"], g)
        box((sd * 0.52, -0.08, 0.0), (0.14, 0.4, 0.86), M["Armor"], g, bevel=0.03)
        box((sd * 0.6, -0.08, 0.0), (0.03, 0.26, 0.6), M["Hazard"], g)
    rod((0.2, -0.24, 0.5), (0.34, -0.2, 1.2), 0.02, M["Piston"], g)
    ball((0.34, -0.2, 1.22), 0.035, M["Visor"], g, sub=1)

head_ew(); core_nanite(); legs_wheel(); pack_aegis()
head_hunter(); core_reclaim(); arms_rapid(); legs_spring(); pack_drone()
def head_thermal():
    # thermal head: rounded helm, a sun hood over a 2x2 cluster of orange thermal lenses, a cooling fin crest
    K = kit("P_head_thermal"); g = pt(K, "headthermal", "M_Head")
    cyl((0, 0, 0.06), 0.18, 0.17, M["Joint"], g)
    ball((0, 0.0, 0.3), 0.36, M["Armor"], g, scale=(1.0, 1.05, 0.82))
    box((0, 0.26, 0.3), (0.5, 0.2, 0.3), M["Frame"], g, bevel=0.03)
    for x in (-0.11, 0.11):
        for z in (0.24, 0.37):
            cyl((x, 0.36, z), 0.065, 0.06, M["Black"], g, rot=ALONG_Y, verts=14)
            cyl((x, 0.395, z), 0.05, 0.02, M["Plasma"], g, rot=ALONG_Y, verts=14)
    wedge((0, 0.32, 0.5), (0.58, 0.3, 0.08), M["Armor2"], g, bevel=0.01, taper=0.8)
    for k in range(4):
        box((0, -0.16 + k * 0.1, 0.62), (0.04, 0.08, 0.12 - k * 0.015), M["Armor2"], g)
    for sd in (-1, 1):
        box((sd * 0.34, 0.0, 0.26), (0.08, 0.34, 0.2), M["Armor2"], g, bevel=0.02)
        box((sd * 0.39, 0.0, 0.26), (0.02, 0.2, 0.04), M["Accent"], g)
    box((0, -0.3, 0.22), (0.4, 0.12, 0.22), M["Frame"], g, bevel=0.02)

def core_reactive():
    # reactive armour core: a blocky chest tiled with explosive reactive armour bricks (bevelled tiles with dark gaps
    # and hazard-striped edges), a squat collar
    K = kit("P_core_reactive"); g = pt(K, "corereactive", "M_Torso")
    box((0, 0, 0.22), (0.92, 0.66, 0.56), M["Frame"], g, bevel=0.05)
    cyl((0, 0, 0.0), 0.34, 0.2, M["Joint"], g, verts=16)
    box((0, 0.0, 0.56), (1.2, 0.84, 0.14), M["Armor2"], g, bevel=0.03)
    box((0, -0.02, 1.02), (1.62, 0.96, 0.84), M["Frame"], g, bevel=0.06)
    for i in range(4):
        for j in range(3):
            x = -0.57 + i * 0.38; z = 0.76 + j * 0.25
            box((x, 0.52, z), (0.34, 0.1, 0.21), M["Armor"] if (i + j) % 2 else M["Armor2"], g, bevel=0.025)
            box((x, 0.575, z + 0.085), (0.26, 0.012, 0.025), M["Hazard"], g)
    for sd in (-1, 1):
        for j in range(3):
            box((sd * 0.86, 0.0, 0.76 + j * 0.25), (0.12, 0.7, 0.21), M["Armor"], g, bevel=0.02)
        box((sd * 0.62, -0.5, 1.02), (0.3, 0.08, 0.6), M["Armor2"], g, bevel=0.02)
    box((0, -0.04, 1.5), (1.04, 0.9, 0.16), M["Armor2"], g, bevel=0.04)
    box((0, 0.36, 1.52), (0.6, 0.12, 0.12), M["Armor"], g, bevel=0.02)
    cyl((0, 0.12, 1.62), 0.25, 0.12, M["Joint"], g, verts=16)

def arms_coil():
    # coil arms: capacitor banks on the pauldrons, forearms built around a rail with stacked glowing coil rings
    K = kit("P_arms_coil")
    for side, s in SIDES:
        sh = pt(K, "armscoil", f"M_Shoulder{side}")
        ball((0, 0, 0), 0.3, M["Joint"], sh)
        box((s * 0.26, 0.0, 0.06), (0.6, 0.78, 0.52), M["Armor"], sh, bevel=0.07)
        for k in range(3):
            cyl((s * 0.42, -0.22 + k * 0.22, 0.42), 0.08, 0.2, M["Frame"], sh, verts=12)
            cyl((s * 0.42, -0.22 + k * 0.22, 0.53), 0.05, 0.03, M["Coil"], sh, verts=12)
        box((s * 0.56, 0.0, 0.06), (0.04, 0.5, 0.3), M["Accent"], sh)
        ar = pt(K, "armscoil", f"M_Arm{side}")
        cyl((0, 0, -0.42), 0.15, 0.84, M["Frame"], ar)
        box((0, 0, -0.34), (0.42, 0.44, 0.5), M["Armor2"], ar, bevel=0.05)
        cyl((0, 0, -0.82), 0.2, 0.44, M["Joint"], ar, rot=(0, math.pi / 2, 0))
        fo = pt(K, "armscoil", f"M_Fore{side}")
        ball((0, 0, 0), 0.2, M["Joint"], fo)
        box((0, 0.2, -0.04), (0.42, 0.5, 0.42), M["Armor"], fo, bevel=0.05)
        box((0, 0.7, -0.04), (0.12, 0.9, 0.16), M["Frame"], fo)
        for i in range(5):
            torus((0, 0.42 + i * 0.13, -0.04), 0.17, 0.045, M["Joint"], fo, rot=ALONG_Y)
            torus((0, 0.42 + i * 0.13, -0.04), 0.13, 0.02, M["Coil"], fo, rot=ALONG_Y)
        box((0, 0.2, 0.2), (0.22, 0.4, 0.06), M["Armor2"], fo)

def legs_anchor():
    # anchor legs: thick armoured legs, hydraulic rams down the shins, feet with three big forward claws and a heel spike
    K = kit("P_legs_anchor")
    for side, s in SIDES:
        th = pt(K, "legsanchor", f"M_Thigh{side}")
        ball((0, 0, 0), 0.3, M["Joint"], th)
        cyl((0, 0, -0.55), 0.18, 1.0, M["Frame"], th)
        wedge((0, 0.08, -0.48), (0.66, 0.62, 0.86), M["Armor"], th, rot=(math.pi, 0, 0), bevel=0.06, taper=0.8)
        box((s * 0.34, 0.0, -0.46), (0.08, 0.5, 0.66), M["Armor2"], th, bevel=0.02)
        sh = pt(K, "legsanchor", f"M_Shin{side}")
        ball((0, 0, 0), 0.27, M["Joint"], sh)
        box((0, 0.3, 0.04), (0.56, 0.22, 0.5), M["Armor2"], sh, bevel=0.04)
        box((0, 0.08, -0.52), (0.6, 0.6, 0.9), M["Armor"], sh, bevel=0.06)
        for k in (-1, 1):
            cyl((k * 0.36, -0.1, -0.5), 0.07, 0.8, M["Piston"], sh)
            cyl((k * 0.36, -0.1, -0.22), 0.1, 0.24, M["Frame"], sh)
        box((0, 0.39, -0.5), (0.1, 0.03, 0.4), M["Hazard"], sh)
        ft = pt(K, "legsanchor", f"M_Foot{side}")
        ball((0, 0, 0), 0.24, M["Joint"], ft)
        box((0, 0.0, -0.08), (0.7, 0.7, 0.3), M["Armor2"], ft, bevel=0.04)
        box((0, 0.06, -0.26), (0.9, 0.9, 0.16), M["Frame"], ft, bevel=0.03)
        for k, x in enumerate((-0.3, 0.0, 0.3)):
            wedge((x, 0.66, -0.26), (0.2, 0.62, 0.22), M["Joint"] if k == 1 else M["Frame"], ft, rot=(R(-12), 0, 0), taper=0.25)
            box((x, 0.38, -0.12), (0.16, 0.2, 0.12), M["Armor"], ft, bevel=0.02)
        wedge((0, -0.6, -0.26), (0.18, 0.42, 0.2), M["Joint"], ft, rot=(R(12), 0, math.pi), taper=0.2)

def pack_swarm():
    # swarm pack: a missile box on the back, a 4x3 grid of tubes with dark mouths and glowing seeker tips, angled up
    K = kit("P_pack_swarm"); g = pt(K, "packswarm", "M_Pack")
    box((0, 0, 0.0), (0.96, 0.5, 1.0), M["Frame"], g, bevel=0.06)
    grille((0, -0.26, -0.2), (0.46, 0.04, 0.4), g, n=4)
    box((0, -0.12, 0.66), (1.06, 0.62, 0.44), M["Armor"], g, rot=(R(-20), 0, 0), bevel=0.04)
    for i in range(4):
        for j in range(3):
            x = -0.36 + i * 0.24; y = -0.32 + j * 0.2
            cyl((x, y, 0.88 + (j - 1) * 0.07), 0.075, 0.06, M["Black"], g, rot=(R(-20), 0, 0), verts=12)
            cyl((x, y, 0.9 + (j - 1) * 0.07), 0.035, 0.02, M["Plasma"], g, rot=(R(-20), 0, 0), verts=8)
    for sd in (-1, 1):
        box((sd * 0.56, -0.12, 0.66), (0.06, 0.64, 0.48), M["Armor2"], g, rot=(R(-20), 0, 0), bevel=0.02)
        box((sd * 0.6, -0.12, 0.66), (0.02, 0.4, 0.06), M["Hazard"], g, rot=(R(-20), 0, 0))
        box((sd * 0.52, -0.06, -0.06), (0.12, 0.38, 0.8), M["Armor"], g, bevel=0.03)

head_thermal(); core_reactive(); arms_coil(); legs_anchor(); pack_swarm()
arms_stab(); arms_pod(); arms_fist()
head_hawk(); head_mono(); head_crest()
core_bulwark(); core_sleek()
arms_brace(); arms_guard()
legs_heavy(); legs_rev(); legs_tread()
pack_sprint(); pack_tank(); pack_glide()

PARTS = list(KIT)
glb = os.path.join(OUT, "site", "assets", "parts.glb")
bpy.ops.object.select_all(action="DESELECT")
for K in PARTS:
    K.select_set(True)
    for o in K.children_recursive: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
                          export_materials="EXPORT", export_animations=False, export_normals=True, export_texcoords=False,
                          export_lights=False, export_cameras=False)
nmesh = sum(1 for K in PARTS for o in K.children_recursive if o.type == "MESH")
print(f"exported {glb}: {len(PARTS)} parts, {nmesh} meshes, {os.path.getsize(glb)/1e6:.2f} MB")

# ---------------------------------------------------------------- preview: assemble presets on copies of the mech
if PREVIEW:
    i1 = _src.index("# ================================================================= ARM WEAPONS")
    exec(compile("\n".join(_src[_i0:i1]), "build_mech", "exec"))
    build_mech()
    MECH = bpy.data.objects["Kit_Mech"]
    PRESETS = [
        ("std", {}),
        ("striker", dict(head="crest", core="sleek", legs="rev", pack="sprint")),
        ("juggernaut", dict(head="mono", core="bulwark", arms="brace", legs="tread", pack="tank")),
        ("recon", dict(head="hawk", arms="guard", legs="heavy", pack="glide")),
        ("gale", dict(head="crest", core="sleek", arms="guard", legs="hover", pack="jumpjet")),
        ("siege", dict(head="radar", core="reactor", arms="brace", legs="quad", pack="tank")),
        ("brawler", dict(head="mono", core="bulwark", arms="fist", legs="heavy", pack="sprint")),
        ("marksman", dict(head="hawk", arms="stab", legs="quad", pack="glide")),
        ("barrage", dict(head="radar", core="reactor", arms="pod", legs="tread", pack="tank")),
        ("racer", dict(head="ew", core="sleek", arms="stab", legs="wheel", pack="sprint")),
        ("aegis", dict(head="ew", core="nanite", arms="guard", legs="heavy", pack="aegis")),
        ("hunter", dict(head="hunter", core="reclaim", arms="rapid", legs="rev", pack="drone")),
        ("hopper", dict(head="crest", core="sleek", arms="stab", legs="spring", pack="jumpjet")),
        ("berserk", dict(head="mono", core="reactive", arms="fist", legs="anchor", pack="sprint")),
        ("command", dict(head="thermal", core="reactor", arms="coil", legs="heavy", pack="swarm")),
    ]
    def dup(o, parent, tag):
        c = o.copy()
        if c.data: c.data = o.data
        link(c); c.name = f"{tag}|{o.name}"; c.parent = parent
        for ch in o.children: dup(ch, c, tag)
        return c
    for n, (tag, pr) in enumerate(PRESETS):
        root = dup(MECH, None, tag); root.location = ((n - (len(PRESETS) - 1) / 2) * 5.8, 0, 0)
        byname = {o.name.split("|", 1)[1]: o for o in root.children_recursive}
        for slot, pid in pr.items():
            K = bpy.data.objects[f"Kit_P_{slot}_{pid}"]
            for ch in K.children:
                kind, rest = ch.name.split("_", 1)
                node = byname.get(rest.split("__", 1)[1])
                if node is None: continue
                if kind == "PV": node.location = ch.location
                elif kind == "PH": node.hide_render = True; [setattr(o, "hide_render", True) for o in node.children_recursive]
                elif kind == "PT":
                    for o in list(node.children):
                        if o.type == "MESH": o.hide_render = True
                    for m in ch.children: dup(m, node, tag).matrix_parent_inverse.identity()
    for K in KIT:
        K.hide_render = True
        for o in K.children_recursive: o.hide_render = True
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"; scene.display.shading.color_type = "MATERIAL"; scene.display.shading.show_cavity = True
    w = bpy.data.worlds.new("W"); scene.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.66, 1)
    cam_data = bpy.data.cameras.new("C"); cam_data.type = "ORTHO"; cam_data.ortho_scale = max(36, len(PRESETS) * 5.8 + 4)
    cam = bpy.data.objects.new("C", cam_data); scene.collection.objects.link(cam); scene.camera = cam
    scene.render.resolution_x = int(2400 * max(36, len(PRESETS) * 5.8 + 4) / 36); scene.render.resolution_y = 640
    from mathutils import Vector
    c = Vector((0, 0, 2.9))
    roots = [o for o in bpy.data.objects if o.parent is None and "|" in o.name]
    for nm_, dv in (("front", (0.3, 1.0, 0.18)), ("back", (-0.4, -1.0, 0.3)), ("side", (1.0, 0.15, 0.12))):
        for r in roots:   # line up across the view direction
            k = r.location.x
            r.location = (k, 0, 0) if nm_ != "side" else (0, -k, 0)
        d = Vector(dv).normalized()
        cam.location = c + d * 40; cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PVDIR, f"parts_preview_{nm_}.png")
        bpy.ops.render.render(write_still=True)
    print("preview done")
