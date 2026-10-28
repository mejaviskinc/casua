import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({base:"/pos/",plugins:[react(),tailwindcss()],server:{allowedHosts:["terminal.local"]},build:{chunkSizeWarningLimit:1600}});
