/// <reference types="vite/client" />

declare module '*.asm?raw' {
  const content: string;
  export default content;
}
