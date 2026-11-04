const overlaps=(a,b)=>a.left<b.right+7&&a.right>b.left-7&&a.top<b.bottom+7&&a.bottom>b.top-7;

// Keep text near its planet while avoiding UI, viewport edges and other names.
export function layoutLabels(candidates,reserved,width,height){
 const placed=[],output=[];
 for(const c of [...candidates].sort((a,b)=>b.priority-a.priority||a.y-b.y)){
  const left=Math.max(12,Math.min(width-c.width-12,c.x-c.width/2));
  const preferred=c.y+c.radius+13;
  let best=null,bestCost=Infinity;
  const positions=[preferred,c.y-c.radius-c.height-13];
  for(let step=1;step<=9;step++)positions.push(preferred+step*22,preferred-step*22);
  for(const y of positions){
   const top=Math.max(86,Math.min(height-c.height-20,y));
   for(const dx of [0,24,-24,48,-48]){
    const x=Math.max(12,Math.min(width-c.width-12,left+dx));
    const rect={left:x,top,right:x+c.width,bottom:top+c.height};
    if([...reserved,...placed].some(box=>overlaps(rect,box)))continue;
    const cost=Math.abs(top-preferred)+Math.abs(x-left)*1.35;
    if(cost<bestCost){best=rect;bestCost=cost;}
   }
  }
  // Dense phone views may need a longer vertical offset, but never hide a name.
  if(!best){for(let top=90;top<height-c.height-20;top+=c.height+12){const rect={left,top,right:left+c.width,bottom:top+c.height};if(![...reserved,...placed].some(box=>overlaps(rect,box))){best=rect;break;}}}
  best??={left,top:Math.max(86,Math.min(height-c.height-20,preferred)),right:left+c.width,bottom:preferred+c.height};
  placed.push(best);output.push({...best,id:c.id});
 }
 return output;
}
