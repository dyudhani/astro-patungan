/// <reference path="../.astro/types.d.ts" />

declare const Tesseract: any;
declare const htmlToImage: {
  toPng: (node: HTMLElement, options?: any) => Promise<string>;
};