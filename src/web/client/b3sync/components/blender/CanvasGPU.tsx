"use client";
//
// Copyright © 2026 Wong Lok. MIT Lincesed
// Praise Jesus
//

import { useState } from "react";
import * as THREE from "three/webgpu";
import { Canvas, extend, type ThreeToJSXElements } from "@react-three/fiber";
import {
  HDRLoader,
} from "three/examples/jsm/Addons.js";
import { useRef } from "react";

declare module "@react-three/fiber" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}

extend(THREE as any);

export const rgbeLoader = new HDRLoader();

//

export const CanvasGPU: any = ({ children }: { children?: any }) => {
  const ref = useRef<HTMLDivElement>(null);

  // let dpr = typeof window !== "undefined" ? window?.devicePixelRatio || 1 : 1;

  // if (dpr >= 2) {
  //   dpr = dpr / 2;
  // } else if (dpr > 1) {
  //   dpr = 1;
  // }

  // if (webgl) {
  //   dpr = typeof window !== "undefined" ? window?.devicePixelRatio || 1 : 1;
  // }

  let [ok, setOK] = useState(false);
  let [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="w-full h-full relative" ref={ref}>
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-50">
            <div className="text-red-400 text-xs font-mono p-4 max-w-md text-center">
              <div className="text-sm mb-2">WebGPU Error</div>
              {error}
            </div>
          </div>
        )}
        <Canvas
          gl={async (props: any): Promise<any> => {
            try {
              const renderer = new THREE.WebGPURenderer({
                ...(props as any),
                alpha: true,
                antialias: true,
                requiredLimits: {
                  maxColorAttachments: 24,
                },
              });

              await renderer.init();

              renderer.toneMapping = THREE.NoToneMapping;
              renderer.toneMappingExposure = 1;

              if (ref.current) {
                const rect = ref.current.getBoundingClientRect();
                renderer.setSize(rect.width, rect.height, true);
              }

              renderer.setPixelRatio(window.devicePixelRatio);

              renderer.shadowMap.type = THREE.PCFShadowMap;
              renderer.shadowMap.transmitted = true;
              renderer.shadowMap.enabled = true;

              const testGeo = new THREE.BoxGeometry(1, 1, 1);
              const cam = new THREE.PerspectiveCamera(1, 1, 0.1, 1000);
              await renderer.compileAsync(
                new THREE.Mesh(testGeo),
                cam,
              );

              setOK(true);
              return renderer;
            } catch (e: any) {
              console.error("[CanvasGPU] WebGPU init failed:", e);
              setError(e.message || String(e));
              throw e;
            }
          }}
        >
          {ok && children}
        </Canvas>
      </div>
    </>
  );
};
