"use client";

import { useEffect, useRef } from "react";
import type { MpSdk } from "../matterport";
import type { Point3, StagingItem } from "../tours/types";

/*
 * Virtual staging as real surfaces in Matterport's own 3D scene (its Scene
 * API, like MPSkins): a picture, a video or a sign is a flat plane on the
 * wall, drawn together with the room every frame - so it never lags or jumps
 * when the visitor turns, is seen from every scan point where the wall is,
 * and is hidden by the room's own walls (never seen through one). A tap on it
 * goes to `onClick`. Web pages and the year wheel stay HTML on top
 * (staging.tsx), as they must be clickable pages.
 */

// Matterport's own THREE (context.three) - its types aren't installed here, so loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Three = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj3 = any;
type Scene = {
  register(name: string, factory: () => unknown): Promise<unknown>;
  createObjects(n: number): Promise<SceneObject[]>;
};
type SceneObject = { addNode(): SceneNode; start(): void; stop(): void };
type SceneNode = { addComponent(name: string, inputs?: Record<string, unknown>): { inputs: Record<string, unknown> } };

export const IN_3D = new Set<StagingItem["kind"]>(["image", "video", "sign"]);

/** Where a surface sits: from its one-click place, or worked out from its four corners. */
export function surfaceOf(item: StagingItem): { center: Point3; normal: Point3; w: number; h: number } | null {
  if (item.place) return item.place;
  const c = item.corners;
  if (!c || c.length !== 4) return null;
  const right = { x: c[1].x - c[0].x, y: c[1].y - c[0].y, z: c[1].z - c[0].z };
  const up = { x: c[0].x - c[3].x, y: c[0].y - c[3].y, z: c[0].z - c[3].z };
  const n = { x: right.y * up.z - right.z * up.y, y: right.z * up.x - right.x * up.z, z: right.x * up.y - right.y * up.x };
  const l = Math.hypot(n.x, n.y, n.z);
  const w = Math.hypot(right.x, right.y, right.z);
  const h = Math.hypot(up.x, up.y, up.z);
  if (!l || !w || !h) return null;
  const center = { x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, y: (c[0].y + c[1].y + c[2].y + c[3].y) / 4, z: (c[0].z + c[1].z + c[2].z + c[3].z) / 4 };
  return { center, normal: { x: n.x / l, y: n.y / l, z: n.z / l }, w, h };
}

/** A sign's text drawn on a canvas, as a texture. */
function signCanvas(text: string, w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = Math.max(64, Math.round((1024 * h) / w));
  const g = cv.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#1d2a30";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const lines = (text || "").split("\n").slice(0, 6);
  const size = Math.min(cv.height / (lines.length * 1.3), 140);
  g.font = `800 ${size}px system-ui, -apple-system, sans-serif`;
  lines.forEach((l, i) => g.fillText(l, cv.width / 2, cv.height / 2 + (i - (lines.length - 1) / 2) * size * 1.2, cv.width * 0.9));
  return cv;
}

/** The component Matterport runs for each surface (written in its component style: inputs, onInit, onEvent …). */
function factory() {
  return function StagingPlane(this: {
    inputs: { item: StagingItem | null; onClick: ((id: string) => void) | null };
    outputs: { objectRoot: unknown; collider: unknown };
    events: Record<string, boolean>;
    context: { three: Three };
    mesh?: Obj3;
    video?: HTMLVideoElement;
    texture?: Obj3;
    built?: string;
    onInit(): void;
    onInputsUpdated(): void;
    onEvent(type: string): void;
    onDestroy(): void;
    build(): void;
    dropContent(): void;
    dispose(): void;
  }) {
    this.inputs = { item: null, onClick: null };
    this.events = { "INTERACTION.CLICK": true };
    this.build = function () {
      const THREE = this.context.three;
      const item = this.inputs.item;
      const s = item && surfaceOf(item);
      if (!item || !s) return;
      // One plane for the item's whole life: Matterport keeps drawing the object it was handed first (objectRoot), so a
      // new picture (e.g. uploaded after the surface was placed) goes onto the same plane - a new plane wouldn't show.
      if (!this.mesh) {
        const geo = new THREE.PlaneGeometry(1, 1);
        // Transparent: a PNG sign (white letters, nothing around them) shows just its letters on the wall - not a black box.
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.FrontSide, transparent: true, alphaTest: 0.02, toneMapped: false });
        this.mesh = new THREE.Mesh(geo, mat);
        this.outputs.objectRoot = this.mesh;
        this.outputs.collider = this.mesh;
      }
      const mesh = this.mesh;
      const mat = mesh.material as Obj3;
      const key = JSON.stringify([item.kind, item.src, item.text, item.fit]);
      // Only the place or size changed: move the plane, keep its picture (no flicker).
      if (this.built === key) {
        place(THREE, mesh, s, this.texture, item);
        return;
      }
      this.built = key;
      this.dropContent();
      // Until the picture is there: nothing (not a white box).
      mat.map = null;
      mat.visible = item.kind === "sign";
      mat.needsUpdate = true;
      const done = (tex: Obj3) => {
        // A newer picture was asked for meanwhile: this one is not used.
        if (this.built !== key) return void tex.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        this.texture = tex;
        mat.map = tex;
        mat.visible = true;
        mat.needsUpdate = true;
        const now = this.inputs.item;
        const at = now && surfaceOf(now);
        if (now && at) place(THREE, mesh, at, tex, now);
      };
      if (item.kind === "image" && item.src) {
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin("anonymous");
        loader.load(item.src, done, undefined, () => console.warn("Virtual staging: billedet kunne ikke hentes", item.src));
      } else if (item.kind === "video" && item.src) {
        const v = document.createElement("video");
        v.crossOrigin = "anonymous";
        v.src = item.src;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "");
        v.preload = "auto";
        v.addEventListener("loadedmetadata", () => {
          const now = this.inputs.item;
          const at = now && surfaceOf(now);
          if (now && at) place(THREE, mesh, at, this.texture, now);
        }, { once: true });
        void v.play().catch(() => {});
        this.video = v;
        done(new THREE.VideoTexture(v));
      } else if (item.kind === "sign") {
        done(new THREE.CanvasTexture(signCanvas(item.text ?? "", s.w, s.h)));
      }
      place(THREE, mesh, s, this.texture, item);
    };
    /** The picture or film on the plane (the plane itself stays). */
    this.dropContent = function () {
      this.video?.pause();
      this.video?.removeAttribute("src");
      this.video = undefined;
      this.texture?.dispose();
      this.texture = undefined;
    };
    this.dispose = function () {
      this.dropContent();
      if (this.mesh) {
        this.mesh.geometry.dispose();
        (this.mesh.material as Obj3).dispose();
        this.mesh = undefined;
      }
    };
    this.onInit = function () {
      this.build();
    };
    this.onInputsUpdated = function () {
      this.build();
    };
    this.onEvent = function (type: string) {
      if (type !== "INTERACTION.CLICK" || !this.inputs.item) return;
      // A video without a button: a tap turns its sound on and off.
      if (this.video && !this.inputs.item.action) this.video.muted = !this.video.muted;
      this.inputs.onClick?.(this.inputs.item.id);
    };
    this.onDestroy = function () {
      this.dispose();
    };
  };
}

/** Puts the plane on its surface: centred, facing the room, w x h metres - the picture filling it ("cover", cropped) or all of it ("contain"). */
function place(THREE: Three, mesh: Obj3, s: { center: Point3; normal: Point3; w: number; h: number }, tex: Obj3 | undefined, item: StagingItem) {
  const n = new THREE.Vector3(s.normal.x, s.normal.y, s.normal.z).normalize();
  mesh.position.set(s.center.x + n.x * 0.01, s.center.y + n.y * 0.01, s.center.z + n.z * 0.01);
  // On a floor or ceiling, "up" on the picture is north.
  mesh.up.set(...(Math.abs(n.y) > 0.9 ? ([0, 0, -1] as const) : ([0, 1, 0] as const)));
  mesh.lookAt(mesh.position.clone().add(n));
  let w = s.w;
  let h = s.h;
  const img = tex?.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined;
  const tw = img?.videoWidth || img?.width;
  const th = img?.videoHeight || img?.height;
  if (tex && tw && th && item.kind !== "sign") {
    const ta = tw / th;
    const pa = s.w / s.h;
    tex.repeat.set(1, 1);
    tex.offset.set(0, 0);
    if (item.fit === "contain") {
      if (ta > pa) h = s.w / ta;
      else w = s.h * ta;
    } else if (ta > pa) {
      tex.repeat.x = pa / ta;
      tex.offset.x = (1 - tex.repeat.x) / 2;
    } else {
      tex.repeat.y = ta / pa;
      tex.offset.y = (1 - tex.repeat.y) / 2;
    }
  }
  mesh.scale.set(w, h, 1);
}

const registered = new WeakSet<object>();

/**
 * Keeps the 3D surfaces in Matterport's scene in step with the setup: one
 * scene object per item, made when it appears, updated in place when it's
 * moved or resized, removed when it goes. False when the SDK has no Scene
 * API - the HTML layer is used then.
 */
export function useStaging3d(sdk: MpSdk | null, items: StagingItem[], onClick: (id: string) => void): boolean {
  const scene = (sdk as unknown as { Scene?: Scene } | null)?.Scene;
  const objects = useRef(new Map<string, { obj: SceneObject; comp: { inputs: Record<string, unknown> } }>());
  const click = useRef(onClick);
  useEffect(() => {
    click.current = onClick;
  });
  const key = JSON.stringify(items.filter((i) => IN_3D.has(i.kind)));
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    (async () => {
      if (!registered.has(scene)) {
        registered.add(scene);
        await scene.register("nv.staging", factory()).catch(() => {});
      }
      const want = items.filter((i) => IN_3D.has(i.kind) && surfaceOf(i));
      const ids = new Set(want.map((i) => i.id));
      for (const [id, o] of objects.current) {
        if (!ids.has(id)) {
          o.obj.stop();
          objects.current.delete(id);
        }
      }
      for (const item of want) {
        const have = objects.current.get(item.id);
        if (have) {
          have.comp.inputs.item = item;
          continue;
        }
        const [obj] = await scene.createObjects(1);
        if (!alive) return obj.stop();
        const comp = obj.addNode().addComponent("nv.staging", { item, onClick: (id: string) => click.current(id) });
        obj.start();
        objects.current.set(item.id, { obj, comp });
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
    // `key` stands for the items.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, key]);
  // Everything goes when the tour does.
  useEffect(() => {
    const map = objects.current;
    return () => {
      for (const o of map.values()) o.obj.stop();
      map.clear();
    };
  }, [scene]);
  return Boolean(scene);
}
