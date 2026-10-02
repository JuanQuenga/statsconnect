/** Canvas operations supplied by the browser or the server PNG adapter. */
export type ProfileImageRuntime = {
  assetUrl: (source: string) => string;
  loadImage: (source: string) => Promise<HTMLImageElement | undefined>;
  loadFont: (source: string, family: string, weight?: string) => Promise<void>;
  createCanvas: (width: number, height: number) => HTMLCanvasElement;
};

export const browserProfileImageRuntime: ProfileImageRuntime = {
  assetUrl: (source) => source,
  loadImage: (source) => new Promise((resolve) => {
    if (!source) { resolve(undefined); return; }
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (result: HTMLImageElement | undefined) => {
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(result);
    };
    const timeout = setTimeout(() => finish(undefined), 8000);
    image.onload = () => finish(image);
    image.onerror = () => finish(undefined);
    image.src = source;
  }),
  async loadFont(source, family, weight) {
    try {
      const font = new FontFace(family, `url("${source}")`, weight ? { weight } : {});
      document.fonts.add(await font.load());
    } catch {
      // Export remains available if the game font cannot be loaded.
    }
  },
  createCanvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
};
