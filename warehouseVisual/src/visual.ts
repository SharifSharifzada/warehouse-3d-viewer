import powerbi from "powerbi-visuals-api";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;

const GLB_URL = "https://sharifsharifzada.github.io/warehouse-3d-viewer/warehouse-3d-textures-stuff2.glb";

export class Visual implements IVisual {
    private container: HTMLElement;
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private controls: OrbitControls;
    private animationId: number;
    private tooltip: HTMLElement;
    private selectionManager: powerbi.extensibility.ISelectionManager;
    private host: powerbi.extensibility.visual.IVisualHost;
    private meshMap: Map<string, THREE.Object3D> = new Map();
    private originalMaterials: Map<string, THREE.Material | THREE.Material[]> = new Map();
    private selectionMap: Map<string, powerbi.extensibility.ISelectionId> = new Map();
    private selectedIds: Set<string> = new Set();
    private dataContainerIds: Set<string> = new Set();
    private outlineMeshes: THREE.Mesh[] = [];
    private glbLoaded: boolean = false;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
        this.container = options.element;
        this.container.style.cssText = "position:relative;overflow:hidden;width:100%;height:100%;";

        this.tooltip = document.createElement("div");
        this.tooltip.style.cssText = "position:absolute;pointer-events:none;background:rgba(20,20,20,0.92);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;display:none;z-index:999;border:1px solid #555;line-height:1.7;max-width:260px;";
        this.container.appendChild(this.tooltip);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf5f5f5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.container.clientWidth || 800, this.container.clientHeight || 600);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(50, (this.container.clientWidth || 800) / (this.container.clientHeight || 600), 0.1, 5000);
        this.camera.position.set(30, 25, 40);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.07;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 1000;

        this.addLights();
        this.addUI();
        this.loadGLB();
        this.animate();

        this.renderer.domElement.addEventListener("click", (e) => this.onClick(e));
        this.renderer.domElement.addEventListener("mousemove", (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener("mouseleave", () => { this.tooltip.style.display = "none"; });
    }

    private addLights(): void {
        this.scene.add(new THREE.AmbientLight(0xffffff, 2.0));
        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(100, 150, 100);
        dir.castShadow = true;
        this.scene.add(dir);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
        dir2.position.set(-100, 80, -100);
        this.scene.add(dir2);
    }

    private addUI(): void {
        const bar = document.createElement("div");
        bar.id = "wh-status";
        bar.style.cssText = "position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.72);color:#fff;padding:5px 16px;border-radius:20px;font-size:12px;pointer-events:none;border:1px solid #555;white-space:nowrap;z-index:10;";
        bar.textContent = "Loading 3D model...";
        this.container.appendChild(bar);

        const hint = document.createElement("div");
        hint.style.cssText = "position:absolute;bottom:10px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.55);color:#ddd;padding:4px 14px;border-radius:20px;font-size:11px;pointer-events:none;white-space:nowrap;z-index:10;";
        hint.textContent = "Click = filter  |  Ctrl+Click = multi-select  |  Drag = rotate  |  Scroll = zoom";
        this.container.appendChild(hint);
    }

    private loadGLB(): void {
        const loader = new GLTFLoader();
        const statusBar = document.getElementById("wh-status");
        loader.load(
            GLB_URL,
            (gltf) => {
                this.scene.add(gltf.scene);
                gltf.scene.traverse((obj) => {
                    if (!obj.name) return;
                    this.meshMap.set(obj.name, obj);
                    if ((obj as THREE.Mesh).isMesh) {
                        const mesh = obj as THREE.Mesh;
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        const mat = mesh.material;
                        if (Array.isArray(mat)) {
                            this.originalMaterials.set(obj.name, (mat as THREE.Material[]).map(m => m.clone()));
                        } else {
                            this.originalMaterials.set(obj.name, (mat as THREE.Material).clone());
                        }
                    }
                });
                const box = new THREE.Box3().setFromObject(gltf.scene);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                gltf.scene.position.sub(center);
                this.camera.position.set(maxDim * 0.8, maxDim * 0.6, maxDim);
                this.camera.near = maxDim * 0.001;
                this.camera.far = maxDim * 10;
                this.camera.updateProjectionMatrix();
                this.controls.target.set(0, 0, 0);
                this.controls.update();
                this.glbLoaded = true;
                if (statusBar) statusBar.textContent = "Loaded " + this.meshMap.size + " objects";
                this.updateHighlights();
            },
            (xhr) => {
                if (xhr.total && statusBar) {
                    statusBar.textContent = "Loading... " + Math.round((xhr.loaded / xhr.total) * 100) + "%";
                }
            },
            (err) => {
                console.error(err);
                if (statusBar) statusBar.textContent = "Could not load 3D model";
            }
        );
    }

    private clearOutlines(): void {
        this.outlineMeshes.forEach(o => {
            this.scene.remove(o);
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
        });
        this.outlineMeshes = [];
    }

    private updateHighlights(): void {
        if (!this.glbLoaded) return;
        this.clearOutlines();
        this.meshMap.forEach((obj, name) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            const orig = this.originalMaterials.get(name);
            if (orig) {
                mesh.material = Array.isArray(orig)
                    ? (orig as THREE.Material[]).map(m => m.clone())
                    : (orig as THREE.Material).clone();
            }
            if (this.selectedIds.has(name)) {
                const outlineMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.BackSide, transparent: true, opacity: 0.9 });
                const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
                mesh.updateWorldMatrix(true, false);
                outlineMesh.applyMatrix4(mesh.matrixWorld);
                outlineMesh.scale.multiplyScalar(1.06);
                this.scene.add(outlineMesh);
                this.outlineMeshes.push(outlineMesh);
            }
        });
    }

    private getHitName(e: MouseEvent): string {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        const meshes: THREE.Object3D[] = [];
        this.meshMap.forEach(obj => { if ((obj as THREE.Mesh).isMesh) meshes.push(obj); });
        const hits = raycaster.intersectObjects(meshes, false);
        if (!hits.length) return "";
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
            if (obj.name && this.meshMap.has(obj.name)) return obj.name;
            obj = obj.parent;
        }
        return "";
    }

    private onClick(e: MouseEvent): void {
        const name = this.getHitName(e);
        const bar = document.getElementById("wh-status");
        if (!name) {
            this.selectedIds.clear();
            this.selectionManager.clear();
            this.updateHighlights();
            if (bar) bar.textContent = "Loaded " + this.meshMap.size + " objects";
            return;
        }
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl) {
            this.selectedIds.has(name) ? this.selectedIds.delete(name) : this.selectedIds.add(name);
        } else {
            if (this.selectedIds.size === 1 && this.selectedIds.has(name)) {
                this.selectedIds.clear();
                this.selectionManager.clear();
                this.updateHighlights();
                return;
            }
            this.selectedIds.clear();
            this.selectedIds.add(name);
        }
        const selIds: powerbi.extensibility.ISelectionId[] = [];
        this.selectedIds.forEach(id => { const s = this.selectionMap.get(id); if (s) selIds.push(s); });
        if (selIds.length) {
            this.selectionManager.select(selIds, isCtrl);
        } else {
            this.selectionManager.clear();
        }
        this.updateHighlights();
        if (bar) {
            bar.textContent = this.selectedIds.size > 0
                ? "Selected: " + Array.from(this.selectedIds).slice(0, 3).join(", ") + (this.selectedIds.size > 3 ? " +" + (this.selectedIds.size - 3) + " more" : "")
                : "Loaded " + this.meshMap.size + " objects";
        }
    }

    private onMouseMove(e: MouseEvent): void {
        const name = this.getHitName(e);
        if (!name) { this.tooltip.style.display = "none"; return; }
        const rect = this.renderer.domElement.getBoundingClientRect();
        const inData = this.dataContainerIds.has(name);
        const isSelected = this.selectedIds.has(name);
        this.tooltip.style.display = "block";
        this.tooltip.style.left = (e.clientX - rect.left + 16) + "px";
        this.tooltip.style.top = (e.clientY - rect.top - 10) + "px";
        this.tooltip.innerHTML = "<strong>Container: " + name + "</strong><br>" + (inData ? "In dataset" : "Not in dataset") + "<br>" + (isSelected ? "Selected - filtering" : "Click to filter");
    }

    private animate(): void {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    public update(options: VisualUpdateOptions): void {
        const w = options.viewport.width;
        const h = options.viewport.height;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.dataContainerIds.clear();
        this.selectionMap.clear();
        const dv = options.dataViews && options.dataViews[0];
        if (dv && dv.categorical && dv.categorical.categories && dv.categorical.categories.length) {
            const cat = dv.categorical.categories[0];
            const seen = new Set<string>();
            (cat.values as string[]).forEach((val, i) => {
                const id = String(val).trim();
                this.dataContainerIds.add(id);
                if (!seen.has(id)) {
                    seen.add(id);
                    this.selectionMap.set(id, this.host.createSelectionIdBuilder().withCategory(cat, i).createSelectionId());
                }
            });
        }
        this.updateHighlights();
    }

    public destroy(): void {
        cancelAnimationFrame(this.animationId);
        this.clearOutlines();
        this.renderer.dispose();
    }
}
