const overlaps=(a,b)=>a.left<b.right+7&&a.right>b.left-7&&a.top<b.bottom+7&&a.bottom>b.top-7;

// Keep text near its planet while avoiding UI, viewport edges and other names.
export function layoutLabels(candidates,reserved,width,height,previous=new Map()){
 const placed=[],output=[];
 const planetBounds=candidates.map(c=>({left:c.x-c.radius,top:c.y-c.radius,right:c.x+c.radius,bottom:c.y+c.radius}));
 const obstacles=[...reserved,...planetBounds];
 for(const c of [...candidates].sort((a,b)=>a.id-b.id)){
  const left=Math.max(12,Math.min(width-c.width-12,c.x-c.width/2));
  const preferred=c.y+c.radius+13;
  let best=null,bestCost=Infinity;
  const old=previous.get(c.id);
  if(old){
   const x=Math.max(12,Math.min(width-c.width-12,old.left+c.x-old.anchorX));
   const top=Math.max(86,Math.min(height-c.height-20,old.top+c.y-old.anchorY));
   const rect={left:x,top,right:x+c.width,bottom:top+c.height};
   if(![...obstacles,...placed].some(box=>overlaps(rect,box))){
    best=rect;bestCost=Math.abs(top-preferred)+Math.abs(x-left)*1.35-14;
   }
  }
  const positions=[preferred,c.y-c.radius-c.height-13];
  for(let step=1;step<=9;step++)positions.push(preferred+step*22,preferred-step*22);
  for(const y of positions){
   const top=Math.max(86,Math.min(height-c.height-20,y));
   for(const dx of [0,24,-24,48,-48]){
    const x=Math.max(12,Math.min(width-c.width-12,left+dx));
    const rect={left:x,top,right:x+c.width,bottom:top+c.height};
    if([...obstacles,...placed].some(box=>overlaps(rect,box)))continue;
    const cost=Math.abs(top-preferred)+Math.abs(x-left)*1.35;
    if(cost<bestCost){best=rect;bestCost=cost;}
   }
  }
  // Dense phone views may need a longer vertical offset, but never hide a name.
  if(!best){for(let top=90;top<height-c.height-20;top+=c.height+12){const rect={left,top,right:left+c.width,bottom:top+c.height};if(![...obstacles,...placed].some(box=>overlaps(rect,box))){best=rect;break;}}}
  if(!best){const top=Math.max(86,Math.min(height-c.height-20,preferred));best={left,top,right:left+c.width,bottom:top+c.height};}
  placed.push(best);output.push({...best,id:c.id,anchorX:c.x,anchorY:c.y});
 }
 return output;
}
