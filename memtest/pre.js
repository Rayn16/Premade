const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('lpc',{on:(fn)=>ipcRenderer.on('pcm',(e,v)=>fn(v))})
