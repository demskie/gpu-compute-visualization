import React from "react";
import "./App.css";
import * as THREE from "three";
import * as gpu from "gpu-compute";
import { BoxLineGeometry } from "three/examples/jsm/geometries/BoxLineGeometry";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { virtualizeWebGLRenderingContext } from "gpu-compute/lib/vendor/virtual-webgl";

export class App extends React.Component {
  componentDidMount() {
    virtualizeWebGLRenderingContext();

    const container = document.createElement("div");
    document.body.appendChild(container);

    const clock = new THREE.Clock();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x505050);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 10);
    camera.position.set(0, 1.6, 3);
    scene.add(camera);

    const room = new THREE.LineSegments(
      new BoxLineGeometry(6, 6, 6, 10, 10, 10).translate(0, 3, 0),
      new THREE.LineBasicMaterial({ color: 0x808080 })
    );
    scene.add(room);

    scene.add(new THREE.HemisphereLight(0x606060, 0x404040));

    const light = new THREE.DirectionalLight(0xffffff);
    light.position.set(1, 1, 1).normalize();
    scene.add(light);

    const geometry = new THREE.BoxBufferGeometry(0.15, 0.15, 0.15);
    for (let i = 0; i < 200; i++) {
      const object = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: Math.random() * 0xffffff }));
      object.position.x = Math.random() * 4 - 2;
      object.position.y = Math.random() * 4;
      object.position.z = Math.random() * 4 - 2;
      object.rotation.x = Math.random() * 2 * Math.PI;
      object.rotation.y = Math.random() * 2 * Math.PI;
      object.rotation.z = Math.random() * 2 * Math.PI;
      object.scale.x = 1.0; // Math.random() + 0.5;
      object.scale.y = 1.0; // Math.random() + 0.5;
      object.scale.z = 1.0; // Math.random() + 0.5;
      object.userData.velocity = new THREE.Vector3();
      object.userData.velocity.x = Math.random() * 0.01 - 0.005;
      object.userData.velocity.y = Math.random() * 0.01 - 0.005;
      object.userData.velocity.z = Math.random() * 0.01 - 0.005;
      room.add(object);
    }

    const raycaster = new THREE.Raycaster();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);

    const gl = renderer.getContext();
    gpu.setWebGLContext(gl);

    const controller = renderer.xr.getController(0);
    controller.addEventListener("selectstart", () => (controller.userData.isSelecting = true));
    controller.addEventListener("selectend", () => (controller.userData.isSelecting = false));
    controller.addEventListener("connected", (ev: any) => {
      if (ev.data.targetRayMode === "tracked-pointer") {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
        g.setAttribute("color", new THREE.Float32BufferAttribute([0.5, 0.5, 0.5, 0, 0, 0], 3));
        const m = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending });
        controller.add(new THREE.Line(g, m));
      } else if (ev.data.targetRayMode === "gaze") {
        const g = new THREE.RingBufferGeometry(0.02, 0.04, 32).translate(0, 0, -1);
        const m = new THREE.MeshBasicMaterial({ opacity: 0.5, transparent: true });
        controller.add(new THREE.Mesh(g, m));
      }
    });
    controller.addEventListener("disconnected", () => {
      controller.remove(controller.children[0]);
    });
    scene.add(controller);

    const controllerModelFactory = new XRControllerModelFactory();

    const controllerGrip = renderer.xr.getControllerGrip(0);
    controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
    scene.add(controllerGrip);

    window.addEventListener(
      "resize",
      () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      },
      false
    );

    document.body.appendChild(VRButton.createButton(renderer));

    let INTERSECTED = undefined as THREE.Object3D | undefined | any;

    const render = () => {
      const delta = clock.getDelta() * 60;

      if (controller.userData.isSelecting === true) {
        const cube = room.children[0];
        room.remove(cube);
        cube.position.copy(controller.position);
        cube.userData.velocity.x = (Math.random() - 0.5) * 0.02 * delta;
        cube.userData.velocity.y = (Math.random() - 0.5) * 0.02 * delta;
        cube.userData.velocity.z = (Math.random() * 0.01 - 0.05) * delta;
        cube.userData.velocity.applyQuaternion(controller.quaternion);
        room.add(cube);
      }

      const tempMatrix = new THREE.Matrix4();
      tempMatrix.identity().extractRotation(controller.matrixWorld);
      raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

      const intersects = raycaster.intersectObjects(room.children);
      if (intersects.length > 0) {
        if (INTERSECTED !== intersects[0].object) {
          if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.currentHex);
          INTERSECTED = intersects[0].object;
          INTERSECTED.currentHex = INTERSECTED.material.emissive.getHex();
          INTERSECTED.material.emissive.setHex(0xff0000);
        }
      } else {
        if (INTERSECTED) INTERSECTED.material.emissive.setHex(INTERSECTED.currentHex);
        INTERSECTED = undefined;
      }

      for (let i = 0; i < room.children.length; i++) {
        const cube = room.children[i];
        cube.userData.velocity.multiplyScalar(1 - 0.001 * delta);
        cube.position.add(cube.userData.velocity);
        if (cube.position.x < -3 || cube.position.x > 3) {
          cube.position.x = THREE.MathUtils.clamp(cube.position.x, -3, 3);
          cube.userData.velocity.x = -cube.userData.velocity.x;
        }
        if (cube.position.y < 0 || cube.position.y > 6) {
          cube.position.y = THREE.MathUtils.clamp(cube.position.y, 0, 6);
          cube.userData.velocity.y = -cube.userData.velocity.y;
        }
        if (cube.position.z < -3 || cube.position.z > 3) {
          cube.position.z = THREE.MathUtils.clamp(cube.position.z, -3, 3);
          cube.userData.velocity.z = -cube.userData.velocity.z;
        }
        cube.rotation.x += cube.userData.velocity.x * 2 * delta;
        cube.rotation.y += cube.userData.velocity.y * 2 * delta;
        cube.rotation.z += cube.userData.velocity.z * 2 * delta;
      }

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(render);
  }

  render = () => <React.Fragment />;
}
