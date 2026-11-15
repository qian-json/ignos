# Written with AI assistance (Claude Code)
# The Home page's scroll film: an ILLUSTRATION (not a measurement) of a BASS-II style burning
# experiment in orbit. A small flow duct floats in the site's navy: a dark interior, a mesh screen
# and a fan at the far end, a thin black acrylic rod on the duct's axis, and a blue flame creeping
# along the rod against the air. One continuous camera move: wide outside, in through the open end,
# along the rod, past the flame, ending looking back at a calm glow. The flame reacts to three beats
# (fans at full -> long flame; fans turned down -> shorter and dimmer; fans off -> a small dim glow).
# No numbers or text are drawn into the frames.
#
# Run headless:
#   blender -b --factory-startup -P scripts/film/scene.py -- --out /path/frames --set desktop
#   options: --set desktop|phone  --frames 1,40,80  (only these)  --samples 48  --scale 0.5
#            --anchors path.json (write per-frame label anchors and quit)  --save scene.blend
import bpy, bmesh, math, sys, json, os, random
from mathutils import Vector, Matrix, Euler
from bpy_extras.object_utils import world_to_camera_view

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default

OUT = arg("--out", "/tmp/film")
SET = arg("--set", "desktop")
SAMPLES = int(arg("--samples", "48"))
SCALE = float(arg("--scale", "1"))
ONLY = [int(f) for f in arg("--frames", "").split(",") if f]
ANCHORS = arg("--anchors")
SAVE = arg("--save")

FRAMES = 168          # 7 s at 24 fps
FPS = 24
SIZE = {"desktop": (1600, 900), "phone": (720, 1280)}[SET]

# the story beats (frame numbers, 1-based): what the fans are doing
BEATS = [
    {"name": "approach", "frame": 1},
    {"name": "fans-full", "frame": 62},
    {"name": "fans-down", "frame": 100},
    {"name": "fans-off", "frame": 132},
    {"name": "calm", "frame": 168},
]

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def airflow(f):
    """Fan setting 1 (full) -> 0.42 (turned down) -> 0 (off), eased between beats."""
    down = smooth(88, 108, f)
    off = smooth(120, 140, f)
    return 1.0 - 0.58 * down - 0.42 * off

def shape_weights(a):
    """Flame shape-key weights (Down, Off) for a fan setting a."""
    w_down = max(0.0, min(1.0, (1.0 - a) / 0.58)) if a > 0.42 else 1.0 - max(0.0, min(1.0, (0.42 - a) / 0.42))
    w_off = max(0.0, min(1.0, (0.42 - a) / 0.42))
    return w_down, w_off

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for dev_type in ("METAL", "OPTIX", "CUDA", "HIP"):
    try:
        prefs.compute_device_type = dev_type
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type == dev_type]
        if gpus:
            for d in prefs.devices: d.use = True
            sc.cycles.device = "GPU"
            print("[film] device", dev_type, [d.name for d in gpus])
            break
    except TypeError:
        continue
cy = sc.cycles
cy.samples = SAMPLES
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.025
cy.use_denoising = True
cy.denoiser = "OPENIMAGEDENOISE"
if hasattr(cy, "denoising_use_gpu"): cy.denoising_use_gpu = True
cy.max_bounces = 4; cy.diffuse_bounces = 2; cy.glossy_bounces = 2
cy.transmission_bounces = 2; cy.transparent_max_bounces = 10; cy.volume_bounces = 0
if hasattr(cy, "volume_step_rate"): cy.volume_step_rate = 3.0
cy.caustics_reflective = False; cy.caustics_refractive = False
cy.sample_clamp_indirect = 4.0
sc.render.resolution_x = int(SIZE[0] * SCALE)
sc.render.resolution_y = int(SIZE[1] * SCALE)
sc.render.resolution_percentage = 100
sc.render.fps = FPS
sc.frame_start = 1; sc.frame_end = FRAMES
sc.render.use_motion_blur = True
sc.render.motion_blur_shutter = 0.35
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_mode = "RGB"
sc.render.image_settings.color_depth = "8"
sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError: pass
sc.view_settings.exposure = 0.0

# the void: navy (#0e1428) seen by the camera; a darker fill for lighting
NAVY = (0.0044, 0.0070, 0.0222)
world = bpy.data.worlds.new("Void"); sc.world = world
world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
wn.clear()
lp = wn.new("ShaderNodeLightPath")
bg_cam = wn.new("ShaderNodeBackground"); bg_cam.inputs["Color"].default_value = (*NAVY, 1); bg_cam.inputs["Strength"].default_value = 1.0
bg_lit = wn.new("ShaderNodeBackground"); bg_lit.inputs["Color"].default_value = (0.010, 0.016, 0.045, 1); bg_lit.inputs["Strength"].default_value = 0.6
mix = wn.new("ShaderNodeMixShader"); wout = wn.new("ShaderNodeOutputWorld")
wl.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
wl.new(bg_lit.outputs[0], mix.inputs[1]); wl.new(bg_cam.outputs[0], mix.inputs[2])
wl.new(mix.outputs[0], wout.inputs["Surface"])

# ---------------------------------------------------------------- materials
def principled(name, base, metal=0.0, rough=0.5, coat=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.05
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = emit_strength
    return m

M_BODY = principled("Anodised", (0.035, 0.04, 0.05), metal=0.85, rough=0.32)
M_INNER = principled("Interior", (0.012, 0.013, 0.016), metal=0.0, rough=0.55)
M_EDGE = principled("Machined", (0.55, 0.57, 0.62), metal=1.0, rough=0.22)
M_ROD = principled("Acrylic", (0.006, 0.006, 0.008), metal=0.0, rough=0.38)
M_CHAR = principled("Char", (0.018, 0.012, 0.010), metal=0.0, rough=0.7)
M_SCREEN = principled("Screen", (0.5, 0.52, 0.56), metal=1.0, rough=0.3)
M_FAN = principled("Fan", (0.05, 0.055, 0.065), metal=0.4, rough=0.38)
M_MOTE = principled("Mote", (0.6, 0.7, 0.9), rough=0.5, emit=(0.55, 0.68, 1.0), emit_strength=0.9)

def flame_material(name, color, peak, edge_pow=2.0, tail_pow=1.3, edge_gain=2.2, edge_base=0.07):
    """Additive glow: transparent + emission, brighter where the shell is seen edge-on (a hollow
    flame sheet) and fading downstream along the UV's v (0 = leading edge, 1 = tail)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; l = nt.links
    n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    uv = n.new("ShaderNodeUVMap")
    sep = n.new("ShaderNodeSeparateXYZ"); l.new(uv.outputs["UV"], sep.inputs[0])
    # along = (1 - v)^tail_pow * smoothstep(0, 0.06, v)
    inv = n.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
    l.new(sep.outputs["Y"], inv.inputs[1])
    pw = n.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = tail_pow
    l.new(inv.outputs[0], pw.inputs[0])
    nose = n.new("ShaderNodeMapRange"); nose.inputs["From Min"].default_value = 0.0; nose.inputs["From Max"].default_value = 0.07
    nose.interpolation_type = "SMOOTHSTEP"; l.new(sep.outputs["Y"], nose.inputs["Value"])
    along = n.new("ShaderNodeMath"); along.operation = "MULTIPLY"
    l.new(pw.outputs[0], along.inputs[0]); l.new(nose.outputs["Result"], along.inputs[1])
    lw = n.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = 0.35
    ep = n.new("ShaderNodeMath"); ep.operation = "POWER"; ep.inputs[1].default_value = edge_pow
    l.new(lw.outputs["Facing"], ep.inputs[0])
    eadd = n.new("ShaderNodeMath"); eadd.operation = "MULTIPLY_ADD"
    eadd.inputs[1].default_value = edge_gain; eadd.inputs[2].default_value = edge_base
    l.new(ep.outputs[0], eadd.inputs[0])
    # fade the very rim so the silhouette is soft, not a hard capsule outline
    rim_p = n.new("ShaderNodeMath"); rim_p.operation = "POWER"; rim_p.inputs[1].default_value = 6.0
    l.new(lw.outputs["Facing"], rim_p.inputs[0])
    rim_i = n.new("ShaderNodeMath"); rim_i.operation = "SUBTRACT"; rim_i.inputs[0].default_value = 1.0
    l.new(rim_p.outputs[0], rim_i.inputs[1])
    soft = n.new("ShaderNodeMath"); soft.operation = "MULTIPLY"
    l.new(eadd.outputs[0], soft.inputs[0]); l.new(rim_i.outputs[0], soft.inputs[1])
    mul = n.new("ShaderNodeMath"); mul.operation = "MULTIPLY"
    l.new(along.outputs[0], mul.inputs[0]); l.new(soft.outputs[0], mul.inputs[1])
    # streaks along the flow: noise stretched along the rod's axis
    tc = n.new("ShaderNodeTexCoord")
    mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1.2, 14.0, 14.0)
    l.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = n.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 2.5; nz.inputs["Detail"].default_value = 3.0
    l.new(mp.outputs["Vector"], nz.inputs["Vector"])
    nr = n.new("ShaderNodeMapRange"); nr.inputs["From Min"].default_value = 0.3; nr.inputs["From Max"].default_value = 0.7
    nr.inputs["To Min"].default_value = 0.55; nr.inputs["To Max"].default_value = 1.25
    l.new(nz.outputs["Fac"], nr.inputs["Value"])
    mul_n = n.new("ShaderNodeMath"); mul_n.operation = "MULTIPLY"
    l.new(mul.outputs[0], mul_n.inputs[0]); l.new(nr.outputs["Result"], mul_n.inputs[1])
    mul = mul_n
    level = n.new("ShaderNodeValue"); level.name = "Level"; level.outputs[0].default_value = peak
    mul2 = n.new("ShaderNodeMath"); mul2.operation = "MULTIPLY"
    l.new(mul.outputs[0], mul2.inputs[0]); l.new(level.outputs[0], mul2.inputs[1])
    em = n.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (*color, 1)
    l.new(mul2.outputs[0], em.inputs["Strength"])
    tr = n.new("ShaderNodeBsdfTransparent")
    add = n.new("ShaderNodeAddShader"); l.new(tr.outputs[0], add.inputs[0]); l.new(em.outputs[0], add.inputs[1])
    l.new(add.outputs[0], out.inputs["Surface"])
    return m, level

M_BLUE, BLUE_LEVEL = flame_material("FlameSheet", (0.1, 0.26, 1.0), 1.6)
M_CORE, CORE_LEVEL = flame_material("FlameCore", (1.0, 0.36, 0.08), 0.5, edge_pow=1.0, tail_pow=1.2, edge_gain=-0.6, edge_base=0.8)

def haze_material(density):
    m = bpy.data.materials.new("Haze"); m.use_nodes = True
    n = m.node_tree.nodes; l = m.node_tree.links; n.clear()
    out = n.new("ShaderNodeOutputMaterial")
    v = n.new("ShaderNodeVolumePrincipled")
    v.inputs["Color"].default_value = (0.75, 0.82, 1.0, 1)
    v.inputs["Density"].default_value = density
    v.inputs["Anisotropy"].default_value = 0.35
    l.new(v.outputs[0], out.inputs["Volume"])
    return m

# ---------------------------------------------------------------- geometry helpers
def link(o):
    sc.collection.objects.link(o); return o

def box(name, size, loc, mat, bevel=0.0):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.location = loc
    me.materials.append(mat)
    if bevel:
        md = o.modifiers.new("bevel", "BEVEL"); md.width = bevel; md.segments = 3; md.limit_method = "ANGLE"
    for p in me.polygons: p.use_smooth = False
    return o

def cylinder_x(name, radius, x0, x1, mat, verts=48, loc_yz=(0, 0)):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=radius, radius2=radius, depth=x1 - x0)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "Y"))
    bm.to_mesh(me); bm.free()
    o = link(bpy.data.objects.new(name, me)); o.location = ((x0 + x1) / 2, *loc_yz)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return o

# ---------------------------------------------------------------- the apparatus
# Duct axis = X. Fan end at x = -3 (upstream), open end at x = +3. Air flows toward +X.
L, W, T = 6.0, 1.2, 0.05      # length, inner width/height, wall thickness
H = W / 2
box("Floor", (L, W + 2 * T, T), (0, 0, -H - T / 2), M_BODY, 0.01)
box("Ceiling", (L, W + 2 * T, T), (0, 0, H + T / 2), M_BODY, 0.01)
box("FarWall", (L, T, W), (0, H + T / 2, 0), M_BODY, 0.01)
# the near wall has a long viewing slot (open, no pane) so the flame reads from outside
slot_x0, slot_x1, slot_h = -2.2, 2.2, 0.62
box("NearWallA", (slot_x0 + L / 2, T, W), ((-L / 2 + slot_x0) / 2, -H - T / 2, 0), M_BODY, 0.01)
box("NearWallB", (L / 2 - slot_x1, T, W), ((L / 2 + slot_x1) / 2, -H - T / 2, 0), M_BODY, 0.01)
rail = (W - slot_h) / 2
box("NearRailTop", (slot_x1 - slot_x0, T, rail), (0, -H - T / 2, slot_h / 2 + rail / 2), M_BODY, 0.01)
box("NearRailLow", (slot_x1 - slot_x0, T, rail), (0, -H - T / 2, -slot_h / 2 - rail / 2), M_BODY, 0.01)
# slot frame and end flanges: machined edges that catch the rim light
for z in (slot_h / 2, -slot_h / 2):
    box("SlotLip", (slot_x1 - slot_x0, 0.03, 0.012), (0, -H - T - 0.012, z), M_EDGE, 0.004)
for x in (-L / 2, L / 2):
    o = W + 2 * T + 0.14
    for (sx, sy, sz, lx, ly, lz) in [
        (0.06, o, 0.07, x, 0, H + T + 0.035 - 0.07), (0.06, o, 0.07, x, 0, -H - T - 0.035 + 0.07),
        (0.06, 0.07, o, x, H + T + 0.035 - 0.07, 0), (0.06, 0.07, o, x, -H - T - 0.035 + 0.07, 0)]:
        box("Flange", (sx, sy, sz), (lx, ly, lz), M_EDGE if x > 0 else M_BODY, 0.008)
# inner liner so the interior reads matte-dark, not metal
box("LinerFloor", (L - 0.02, W, 0.004), (0, 0, -H + 0.002), M_INNER)
box("LinerCeil", (L - 0.02, W, 0.004), (0, 0, H - 0.002), M_INNER)
box("LinerFar", (L - 0.02, 0.004, W), (0, H - 0.002, 0), M_INNER)

# fan housing behind the duct's far end
box("FanHousing", (0.5, W + 0.3, W + 0.3), (-L / 2 - 0.3, 0, 0), M_BODY, 0.03)
fan = bpy.data.objects.new("Fan", None); link(fan); fan.location = (-L / 2 + 0.12, 0, 0)
hub = cylinder_x("Hub", 0.09, -0.07, 0.07, M_FAN); hub.parent = fan; hub.location = (0, 0, 0)
for i in range(7):
    a = i / 7 * math.tau
    bl = box("Blade", (0.02, 0.15, 0.4), (0, 0, 0), M_FAN, 0.01)
    bl.parent = fan
    bl.location = (0, math.cos(a) * 0.29, math.sin(a) * 0.29)
    bl.rotation_euler = (a - math.pi / 2, math.radians(28), 0)
# mesh screen in front of the fan
me = bpy.data.meshes.new("Screen"); bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=36, y_segments=36, size=W / 2 - 0.005)
bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "Y"))
bm.to_mesh(me); bm.free()
screen = link(bpy.data.objects.new("Screen", me)); screen.location = (-L / 2 + 0.38, 0, 0)
me.materials.append(M_SCREEN)
wf = screen.modifiers.new("wire", "WIREFRAME"); wf.thickness = 0.006; wf.use_replace = True

# the rod: black acrylic upstream of the flame front, charred downstream; a holder near the mouth
ROD_R = 0.032
FRONT = -0.55                  # where the flame's leading edge sits on the rod
rod = cylinder_x("Rod", ROD_R, -2.35, FRONT + 0.02, M_ROD)
char = cylinder_x("Burnt", ROD_R * 0.82, FRONT + 0.02, 2.55, M_CHAR)
cone = cylinder_x("Taper", ROD_R * 0.9, FRONT - 0.005, FRONT + 0.06, M_CHAR)
box("Holder", (0.08, 0.08, 0.1), (2.55, 0, 0), M_EDGE, 0.01)
box("Strut", (0.04, 0.04, H - 0.05), (2.55, 0, -H / 2 - 0.025), M_BODY, 0.005)

# haze inside the duct
hz = box("Haze", (L - 0.05, W - 0.02, W - 0.02), (0, 0, 0), haze_material(0.035))
hz.visible_shadow = False

# ---------------------------------------------------------------- the flame (shape keys)
def flame_shell(name, mat, scale_r, scale_l, offset):
    """Surface of revolution about the rod. Basis = fans full (long, streaming downstream);
    keys: Down (shorter, slightly rounder) and Off (a small, nearly round glow)."""
    rings, segs = 72, 40
    def profile(length, radius, lead, roundness):
        pts = []
        for i in range(rings + 1):
            t = i / rings
            # round nose (upstream), widest just behind it, tapering downstream
            r = radius * (math.sin(math.pi * 0.5 * min(1.0, t / roundness)) ** 0.75) * (1 - t) ** 1.35
            r = max(r, 0.0) + (ROD_R * 0.6 if 0 < i < rings else 0.0) * (1 - t) ** 0.6
            x = FRONT - lead + t * length
            pts.append((x, r, t))
        return pts
    shapes = {
        "Basis": profile(2.1 * scale_l, 0.2 * scale_r, 0.08 * scale_r + offset, 0.16),
        "Down": profile(0.95 * scale_l, 0.165 * scale_r, 0.075 * scale_r + offset, 0.24),
        "Off": profile(0.32 * scale_l, 0.105 * scale_r, 0.06 * scale_r + offset, 0.42),
    }
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    grid = []
    for (x, r, t) in shapes["Basis"]:
        row = []
        for j in range(segs):
            a = j / segs * math.tau
            row.append(bm.verts.new((x, r * math.cos(a), r * math.sin(a))))
        grid.append(row)
    for i in range(rings):
        for j in range(segs):
            f = bm.faces.new((grid[i][j], grid[i][(j + 1) % segs], grid[i + 1][(j + 1) % segs], grid[i + 1][j]))
            for lo, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                lo[uvl].uv = (jj / segs, ii / rings)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = link(bpy.data.objects.new(name, me)); me.materials.append(mat)
    o.visible_shadow = False
    o.visible_diffuse = True
    o.shape_key_add(name="Basis")
    # rebuild per-vertex positions for each key by matching (ring, segment) through the UV
    co_of = {}
    for key, pts in shapes.items():
        co_of[key] = pts
    uv = me.uv_layers["UVMap"].data
    vert_t = {}
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            u, v = uv[li].uv
            vert_t[vi] = (round(v * rings), u)
    for key in ("Down", "Off"):
        k = o.shape_key_add(name=key); k.value = 0.0
        pts = shapes[key]
        for vi, (ring, u) in vert_t.items():
            x, r, _ = pts[ring]
            co = me.vertices[vi].co
            a = math.atan2(co.z, co.y)
            k.data[vi].co = (x, r * math.cos(a), r * math.sin(a))
    return o

blue = flame_shell("FlameSheet", M_BLUE, 1.0, 1.0, 0.0)
core = flame_shell("FlameCore", M_CORE, 0.55, 0.72, -0.05)
core.location.x = 0.09     # the soot glow sits just behind the bright leading edge

# the flame's own light: blue, at the leading edge, plus a softer one downstream
flame_light = bpy.data.lights.new("FlameLight", "POINT"); flame_light.color = (0.32, 0.5, 1.0)
flame_light.shadow_soft_size = 0.12
fl = link(bpy.data.objects.new("FlameLight", flame_light)); fl.location = (FRONT + 0.12, 0, 0)
tail_light = bpy.data.lights.new("TailLight", "POINT"); tail_light.color = (0.3, 0.45, 1.0)
tail_light.shadow_soft_size = 0.3
tl = link(bpy.data.objects.new("TailLight", tail_light)); tl.location = (FRONT + 0.9, 0, 0)
core_light = bpy.data.lights.new("CoreLight", "POINT"); core_light.color = (1.0, 0.5, 0.2)
core_light.shadow_soft_size = 0.1
cl = link(bpy.data.objects.new("CoreLight", core_light)); cl.location = (FRONT + 0.3, 0, 0)

# the flame's point lights sit on the rod's axis; keep them off the rod so it doesn't glow white
no_flame_light = bpy.data.collections.new("RodUnlitByFlame")
for o in (rod, char, cone): no_flame_light.objects.link(o)
for co in no_flame_light.collection_objects: co.light_linking.link_state = "EXCLUDE"
for lo in (fl, tl, cl): lo.light_linking.receiver_collection = no_flame_light

# cool rim light from behind and above; a faint key for the outside so the duct shape reads
rim = bpy.data.lights.new("Rim", "AREA"); rim.shape = "RECTANGLE"; rim.size = 6; rim.size_y = 1.2
rim.color = (0.62, 0.74, 1.0); rim.energy = 900
ro = link(bpy.data.objects.new("Rim", rim)); ro.location = (-1.0, 5.5, 4.2)
ro.rotation_euler = (Vector((0, 0, 0)) - ro.location).to_track_quat("-Z", "Y").to_euler()
rim.cycles.is_caustics_light = False if hasattr(rim.cycles, "is_caustics_light") else None
ro.visible_volume_scatter = False if hasattr(ro, "visible_volume_scatter") else None
key2 = bpy.data.lights.new("Kicker", "AREA"); key2.size = 3; key2.color = (0.55, 0.65, 1.0); key2.energy = 160
ko = link(bpy.data.objects.new("Kicker", key2)); ko.location = (7.5, -4.0, -2.5)
ko.rotation_euler = (Vector((0, 0, 0)) - ko.location).to_track_quat("-Z", "Y").to_euler()

# a few far, dim specks in the void for depth (parallax during the approach)
random.seed(7)
spk = principled("Speck", (0, 0, 0), emit=(0.7, 0.78, 1.0), emit_strength=1.4)
me = bpy.data.meshes.new("Specks"); bm = bmesh.new()
for i in range(260):
    d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.6, 0.6)))
    if d.length < 0.2: continue
    p = d.normalized() * random.uniform(16, 40)
    p.x -= 10; p.y += 8      # mostly behind the apparatus as seen from the start
    r = random.uniform(0.012, 0.035)
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    bmesh.ops.translate(bm, verts=res["verts"], vec=p)
bm.to_mesh(me); bm.free()
specks = link(bpy.data.objects.new("Specks", me)); me.materials.append(spk)
specks.visible_shadow = False

# motes in the duct that drift with the air: the airflow made visible
random.seed(11)
motes = []
mote_me = bpy.data.meshes.new("Mote"); bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.0045); bm.to_mesh(mote_me); bm.free()
mote_me.materials.append(M_MOTE)
cum = [0.0]
for f in range(1, FRAMES + 2):
    cum.append(cum[-1] + 0.05 * airflow(f) ** 1.3 + 0.0015)
for i in range(110):
    o = link(bpy.data.objects.new("Mote", mote_me))
    o.visible_shadow = False
    x0 = random.uniform(-L / 2 + 0.45 - cum[-1], L / 2 - 0.1)
    y0 = random.uniform(-H + 0.06, H - 0.06); z0 = random.uniform(-H + 0.06, H - 0.06)
    if abs(y0) < 0.08 and abs(z0) < 0.08: y0 += 0.15
    motes.append((o, x0, y0, z0, random.uniform(0, math.tau)))

# ---------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new("Cam"); cam_data.sensor_width = 36
cam = link(bpy.data.objects.new("Cam", cam_data)); sc.camera = cam
cam_data.clip_start = 0.02; cam_data.clip_end = 200
cam_data.dof.use_dof = True; cam_data.dof.aperture_blades = 7
if SET == "phone":
    cam_data.sensor_fit = "HORIZONTAL"

# control points: frame, position, look-at point, focal length (mm), f-stop
SHOT = [
    (1,   (9.6, -9.4, 3.6),    (-0.2, 0.0, -0.1),   38, 6.0),
    (34,  (7.9, -4.4, 1.8),    (0.4, 0.0, 0.0),     36, 5.0),
    (62,  (5.5, -0.75, 0.42),  (0.0, 0.0, 0.0),     30, 3.2),
    (84,  (3.05, -0.36, 0.2),  (-0.4, 0.0, 0.0),    26, 2.2),
    (104, (1.35, -0.40, 0.17), (-0.6, -0.05, 0.0),  26, 1.8),
    (122, (0.15, -0.5, 0.14),  (-0.55, 0.05, 0.0),  26, 1.8),
    (140, (-0.8, -0.48, 0.14), (-0.62, 0.3, 0.0),   26, 1.8),
    (156, (-1.5, -0.40, 0.2),  (-0.45, 0.0, 0.0),   28, 2.0),
    (168, (-1.9, -0.36, 0.24), (-0.4, 0.0, 0.0),    30, 2.0),
]

def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)

def sample(f):
    keys = SHOT
    if f <= keys[0][0]: i = 0; t = 0.0
    elif f >= keys[-1][0]: i = len(keys) - 2; t = 1.0
    else:
        i = max(k for k in range(len(keys) - 1) if keys[k][0] <= f)
        t = (f - keys[i][0]) / (keys[i + 1][0] - keys[i][0])
    def get(k, idx):
        k = max(0, min(len(keys) - 1, k)); v = keys[k][idx]
        return Vector(v) if isinstance(v, tuple) else v
    out = []
    for idx in (1, 2, 3, 4):
        a, b, c, d = get(i - 1, idx), get(i, idx), get(i + 1, idx), get(i + 2, idx)
        out.append(catmull(a, b, c, d, t))
    return out

prev = None
for f in range(1, FRAMES + 1):
    pos, look, focal, fstop = sample(f)
    if SET == "phone":
        # portrait fits the frame's width: a slightly longer focal length than desktop keeps the
        # apparatus large enough outside and stops the tall frame going fish-eye inside the duct
        focal *= 1.3
    q = (look - pos).to_track_quat("-Z", "Y")
    e = q.to_euler("XYZ", prev) if prev else q.to_euler("XYZ")
    prev = e
    cam.location = pos; cam.rotation_euler = e
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
    # the camera keeps Blender's default 50 mm; the field of view comes from the sensor width, and
    # the f-stop is scaled by the same ratio so depth of field matches a true `focal` mm shot
    cam_data.sensor_width = 36.0 * 50.0 / focal; cam_data.keyframe_insert("sensor_width", frame=f)
    cam_data.dof.aperture_fstop = fstop * 50.0 / focal; cam_data.dof.keyframe_insert("aperture_fstop", frame=f)
    # focus: the flame's leading edge
    cam_data.dof.focus_distance = max(0.15, (Vector((FRONT + 0.1, 0, 0)) - pos).length)
    cam_data.dof.keyframe_insert("focus_distance", frame=f)

    a = airflow(f)
    # flame shape: Basis (full) -> Down -> Off
    w_down, w_off = shape_weights(a)
    flick = 1.0 + 0.04 * math.sin(f * 1.7) * a + 0.025 * math.sin(f * 0.61 + 1.0)
    for ob in (blue, core):
        kb = ob.data.shape_keys.key_blocks
        kb["Down"].value = w_down; kb["Down"].keyframe_insert("value", frame=f)
        kb["Off"].value = w_off; kb["Off"].keyframe_insert("value", frame=f)
    BLUE_LEVEL.outputs[0].default_value = (0.55 + 1.2 * a) * flick
    BLUE_LEVEL.outputs[0].keyframe_insert("default_value", frame=f)
    CORE_LEVEL.outputs[0].default_value = 0.45 * a ** 1.6 * flick
    CORE_LEVEL.outputs[0].keyframe_insert("default_value", frame=f)
    flame_light.energy = (5 + 14 * a) * flick; flame_light.keyframe_insert("energy", frame=f)
    tail_light.energy = 12 * a ** 1.4; tail_light.keyframe_insert("energy", frame=f)
    tl.location = (FRONT + 0.25 + 0.75 * a, 0, 0); tl.keyframe_insert("location", frame=f)
    core_light.energy = 2.5 * a ** 1.6; core_light.keyframe_insert("energy", frame=f)
    # the fan: spins at full, slows, stops
    fan.rotation_euler = (cum[f] * 6.0, 0, 0); fan.keyframe_insert("rotation_euler", frame=f)
    # motes drift downstream with the air; they're hidden outside the duct
    for (o, x0, y0, z0, ph) in motes:
        x = x0 + cum[f]
        inside = (-L / 2 + 0.42) < x < (L / 2 + 0.4)
        o.location = (x, y0 + 0.01 * math.sin(f * 0.07 + ph), z0 + 0.01 * math.cos(f * 0.05 + ph))
        o.scale = (1, 1, 1) if inside else (0, 0, 0)
        o.keyframe_insert("location", frame=f); o.keyframe_insert("scale", frame=f)

# per-frame keys: linear so nothing overshoots between them
for ob in [cam, cam_data, fan, blue.data.shape_keys, core.data.shape_keys, flame_light, tail_light, tl, core_light] + [m[0] for m in motes]:
    ad = getattr(ob, "animation_data", None)
    if not ad or not ad.action: continue
    act = ad.action
    curves = []
    if hasattr(act, "fcurves"): curves = list(act.fcurves)
    else:
        for layer in act.layers:
            for strip in layer.strips:
                for cb in strip.channelbags: curves += list(cb.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT" if fc.data_path == "scale" else "LINEAR"

# ---------------------------------------------------------------- compositor: a soft bloom on the flame
ng = bpy.data.node_groups.new("Grade", "CompositorNodeTree")
ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
rl = ng.nodes.new("CompositorNodeRLayers"); go = ng.nodes.new("NodeGroupOutput")
g = ng.nodes.new("CompositorNodeGlare")
g.inputs["Type"].default_value = "Fog Glow"
g.inputs["Highlights Threshold"].default_value = 0.7
g.inputs["Strength"].default_value = 0.55
g.inputs["Size"].default_value = 0.7
ng.links.new(rl.outputs["Image"], g.inputs["Image"]); ng.links.new(g.outputs["Image"], go.inputs[0])
sc.compositing_node_group = ng

# ---------------------------------------------------------------- anchors for HTML labels
POINTS = {
    "fan": Vector((-L / 2 + 0.12, 0, 0.0)),
    "rod": Vector((-1.15, 0, 0)),
    "duct": Vector((1.2, 0, H + T)),
    "airflow": Vector((-1.9, 0.0, 0.3)),
    "flame": Vector((FRONT, 0, 0.2)),      # replaced per frame by the top of the flame sheet
}
if ANCHORS:
    res = {k: [] for k in POINTS}
    for f in range(1, FRAMES + 1):
        sc.frame_set(f)
        for k, p in POINTS.items():
            if k == "flame":
                # ride the top of the flame sheet as it shrinks: its highest vertex this frame
                ev = blue.evaluated_get(bpy.context.evaluated_depsgraph_get())
                me_ev = ev.to_mesh()
                p = blue.matrix_world @ max((v.co for v in me_ev.vertices), key=lambda c: c.z).copy()
                ev.to_mesh_clear()
            v = world_to_camera_view(sc, cam, p)
            vis = v.z > 0 and -0.05 <= v.x <= 1.05 and -0.05 <= v.y <= 1.05
            res[k].append([round(v.x, 4), round(1 - v.y, 4), 1 if vis else 0])
    json.dump({"set": SET, "beats": BEATS, "frames": FRAMES, "fps": FPS,
               "width": SIZE[0], "height": SIZE[1], "anchors": res}, open(ANCHORS, "w"))
    print("[film] anchors ->", ANCHORS)
    sys.exit(0)

if SAVE:
    bpy.ops.wm.save_as_mainfile(filepath=SAVE)

os.makedirs(OUT, exist_ok=True)
todo = ONLY or list(range(1, FRAMES + 1))
for f in todo:
    path = os.path.join(OUT, f"{f:03d}.png")
    if os.path.exists(path) and not ONLY:
        continue          # resumable
    sc.frame_set(f)
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[film] frame {f} -> {path}", flush=True)
