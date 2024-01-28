import { dracoInitialize, createGraphicsDevice, WebglGraphicsDevice, XRTYPE_VR, XRSPACE_LOCAL } from 'playcanvas';
import { Scene } from './scene';
import { getSceneConfig } from './scene-config';
import { CreateDropHandler } from './drop-handler';
import { initMaterials } from './material';
import { EditorUI } from './ui/editor';
import { registerEvents } from './editor-ops';
import {
  LookingGlassWebXRPolyfill,
  LookingGlassConfig,
} from "../static/lib/lkg-webxr.module.js";

new LookingGlassWebXRPolyfill();

declare global {
    interface Window {
        scene: Scene;
        showError: (err: string) => void;
    }
}

const getURLArgs = () => {
    // extract settings from command line in non-prod builds only
    const config = {};

    const apply = (key: string, value: string) => {
        let obj: any = config;
        key.split('.').forEach((k, i, a) => {
            if (i === a.length - 1) {
                obj[k] = value;
            } else {
                if (!obj.hasOwnProperty(k)) {
                    obj[k] = {};
                }
                obj = obj[k];
            }
        });
    };

    const params = new URLSearchParams(window.location.search.slice(1));
    params.forEach((value: string, key: string) => {
        apply(key, value);
    });

    return config;
};

const initDropHandler = (canvas: HTMLCanvasElement, scene: Scene) => {
    // add a 'choose file' button
    const selector = document.createElement('input');
    selector.setAttribute('id', 'file-selector');
    selector.setAttribute('type', 'file');
    selector.setAttribute('accept', '.gltf,.glb,.ply');
    selector.onchange = () => {
        const files = selector.files;
        if (files.length > 0) {
            const file = selector.files[0];
            scene.loadModel(URL.createObjectURL(file), file.name);
        }
    };
    document.getElementById('file-selector-container')?.appendChild(selector);

    // also support user dragging and dropping a local glb file onto the canvas
    CreateDropHandler(canvas, urls => {
        const modelExtensions = ['.ply'];
        const model = urls.find(url => modelExtensions.some(extension => url.filename.endsWith(extension)));
        if (model) {
            scene.loadModel(model.url, model.filename);
        }
    });
};

const main = async () => {
    const url = new URL(window.location.href);

    // decode remote storage details
    let remoteStorageDetails;
    try {
        remoteStorageDetails = JSON.parse(decodeURIComponent(url.searchParams.get('remoteStorage')));
    } catch (e) {

    }

    const editorUI = new EditorUI(!!remoteStorageDetails);

    // create the graphics device
    const createPromise = createGraphicsDevice(editorUI.canvas, {
        deviceTypes: ['webgl2'],
        antialias: false,
        depth: false,
        stencil: false,
        xrCompatible: false,
        powerPreference: 'high-performance'
    });

    // monkey-patch materials for premul alpha rendering
    initMaterials();

    // wait for async loads to complete
    const graphicsDevice = await createPromise;

    const overrides = [
        getURLArgs()
    ];

    // resolve scene config
    const sceneConfig = getSceneConfig(overrides);

    // construct the manager
    const scene = new Scene(
        sceneConfig,
        editorUI.canvas,
        graphicsDevice
    );
    // scene.app.xr._deviceAvailabilityCheck();
    addVrButton(scene);

    registerEvents(scene, editorUI, remoteStorageDetails);

    initDropHandler(editorUI.canvas, scene);

    // load async models
    await scene.load();

    // handle load param and ready promise for visual testing harness
    const loadParam = url.searchParams.get('load');
    const loadUrl = loadParam && decodeURIComponent(loadParam);
    if (loadUrl) {
        await scene.loadModel(loadUrl, loadUrl);
    }

    window.scene = scene;
}

function addVrButton(scene: Scene) {
    const vrButton = document.createElement('button');
    function stylizeElement(element) {

        element.style.position = 'absolute';
        element.style.right = '0';
        element.style.bottom = '20px';
        element.style.padding = '12px 6px';
        element.style.border = '1px solid #fff';
        element.style.borderRadius = '4px';
        element.style.background = 'rgba(0,0,0,0.1)';
        element.style.color = '#fff';
        element.style.font = 'normal 13px sans-serif';
        element.style.textAlign = 'center';
        element.style.opacity = '0.5';
        element.style.outline = 'none';
        element.style.zIndex = '999';
        element.textContent = "Looking Glass";

    }
    vrButton.id = "VRButton"; // the webxr.mjs will try finding this id for a limit of time. but without webxr.mjs modify the button, the code above seems good enough to trigger the Looking glass feature
    document.body.appendChild(vrButton);

    stylizeElement(vrButton);

    vrButton.addEventListener("click", (ev) => {
        if (scene.app.xr.active) {
            scene.camera.entity.camera.endXr();
        } else {
            let canvas = scene.app.graphicsDevice.canvas;
            const gl = canvas.getContext('webgl2');
            gl.makeXRCompatible();
            scene.camera.entity.camera.startXr(XRTYPE_VR, XRSPACE_LOCAL, {
                callback: function (err) {
                    if (err) {
                        console.log(err);
                    }
                }
            });
        }
    })
}

export { main };
