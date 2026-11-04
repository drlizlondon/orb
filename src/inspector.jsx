import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as Dialog from '@radix-ui/react-dialog';
import {Toaster,toast} from 'sonner';

function Arrow(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>}
function Copy(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3"/><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>}
function Inspector(){
 const [project,setProject]=useState(null),[open,setOpen]=useState(false);
 useEffect(()=>{const inspect=e=>{setProject(e.detail.project);setOpen(true);};const portrait=e=>setProject(current=>current?.id===e.detail.id&&current?.portraitRequest===e.detail.request?{...current,portrait:e.detail.portrait}:current);window.addEventListener('orbit:inspect',inspect);window.addEventListener('orbit:portrait',portrait);return()=>{window.removeEventListener('orbit:inspect',inspect);window.removeEventListener('orbit:portrait',portrait);};},[]);
 function change(next){setOpen(next);if(!next)window.dispatchEvent(new Event('orbit:close'));}
 async function copy(){try{await navigator.clipboard.writeText(project.url);toast.success('Project link copied');}catch{toast.error('Could not copy. Use the project link below.');}}
 return <><Dialog.Root open={open} onOpenChange={change}><Dialog.Portal><Dialog.Overlay className="inspector-overlay"/><Dialog.Content className="inspector" data-world={project?.id} style={{'--planet-color':project?.color}} onCloseAutoFocus={e=>e.preventDefault()}>
 <Dialog.Close className="inspector-close" aria-label="Return to galaxy"><svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></Dialog.Close>
 <div className="inspector-heading"><div className="inspector-planet" aria-hidden="true">{project?.portrait&&<img src={project.portrait} alt="" width="192" height="192"/>}</div><div><span className="inspector-category">{project?.category}</span><Dialog.Title className="inspector-title">{project?.title}</Dialog.Title></div></div>
 <div className="inspector-bento"><div className="inspector-summary"><Dialog.Description className="inspector-description">{project?.description}</Dialog.Description></div>
 <div className="inspector-destination"><span>Destination</span><a href={project?.url} target="_blank" rel="noopener noreferrer">{project?new URL(project.url).hostname:''}</a></div>
 <button className="inspector-copy" onClick={copy}><Copy/><span>Copy link</span></button>
 <a className="inspector-launch" href={project?.url} target="_blank" rel="noopener noreferrer">Open project <Arrow/></a></div>
 <Dialog.Close className="inspector-return">← Back to the galaxy</Dialog.Close>
 </Dialog.Content></Dialog.Portal></Dialog.Root><Toaster theme="dark" position="bottom-right" closeButton toastOptions={{style:{background:'#151523',border:'1px solid #ffffff20',color:'#eeedf8'}}}/></>;
}
createRoot(document.getElementById('inspector-root')).render(<Inspector/>);
