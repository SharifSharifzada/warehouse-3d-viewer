import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class GLBLoader {
  private static readonly LOADER = new GLTFLoader();
  private static readonly TIMEOUT_MS = 30000;

  static loadFromBase64(base64String: string): Promise<THREE.Group> {
    return new Promise((resolve, reject) => {
      try {
        const binaryString = atob(base64String);
        const bytes = new Uint8Array(binaryString.length);

        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const blobUrl = URL.createObjectURL(blob);

        const timeout = setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          reject(new Error('GLB loading timeout'));
        }, this.TIMEOUT_MS);

        this.LOADER.load(
          blobUrl,
          (gltf) => {
            clearTimeout(timeout);
            URL.revokeObjectURL(blobUrl);
            console.log('✅ GLB model loaded from Base64');
            resolve(gltf.scene);
          },
          (progress) => {
            const percent = ((progress.loaded / progress.total) * 100).toFixed(0);
            console.log(`⏳ Loading: ${percent}%`);
          },
          (error) => {
            clearTimeout(timeout);
            URL.revokeObjectURL(blobUrl);
            console.error('❌ GLB error:', error);
            reject(error);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }
}
