const gap=8;
const overlaps=(a,b)=>a.left<b.right+7&&a.right>b.left-7&&a.top<b.bottom+7&&a.bottom>b.top-7;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Project labels against actual obstacle edges. A moving anchor can slide along
// an edge continuously rather than switching between coarse vertical rows.
export function layoutLabels(candidates,reserved,width,height,previous=new Map()){
 const placed=[],output=[];
 const planetBounds=candidates.map(c=>({left:c.x-c.radius,top:c.y-c.radius,right:c.x+c.radius,bottom:c.y+c.radius}));
 for(const c of [...candidates].sort((a,b)=>a.id-b.id)){
  const obstacles=[...reserved,...planetBounds,...placed];
  const left=clamp(c.x-c.width/2,12,width-c.width-12);
  const preferred=c.y+c.radius+13;
  const old=previous.get(c.id);
  const retained=old?{left:clamp(old.left+c.x-old.anchorX,12,width-c.width-12),top:clamp(old.top+c.y-old.anchorY,86,height-c.height-20)}:null;
  // Most frames simply translate an already safe placement with its anchor.
  // Keep this path allocation-light for paused and settled camera views.
  if(retained){
   const rect={...retained,right:retained.left+c.width,bottom:retained.top+c.height};
   if(!obstacles.some(box=>overlaps(rect,box))){placed.push(rect);output.push({...rect,id:c.id,anchorX:c.x,anchorY:c.y});continue;}
  }
  const xs=[left],ys=[preferred,c.y-c.radius-c.height-13];
  if(retained){xs.push(retained.left);ys.push(retained.top);}
  for(const box of obstacles){
   xs.push(box.left-c.width-gap,box.right+gap);
   ys.push(box.top-c.height-gap,box.bottom+gap);
  }
  const positionsX=[...new Set(xs.map(x=>clamp(x,12,width-c.width-12)))];
  const positionsY=[...new Set(ys.map(y=>clamp(y,86,height-c.height-20)))];
  let best=null,bestCost=Infinity;
  for(const top of positionsY)for(const x of positionsX){
   const rect={left:x,top,right:x+c.width,bottom:top+c.height};
   if(obstacles.some(box=>overlaps(rect,box)))continue;
   const continuity=retained?Math.hypot(top-retained.top,x-retained.left)*2.5:0;
   const cost=Math.abs(top-preferred)+Math.abs(x-left)*1.35+continuity;
   if(cost<bestCost){best=rect;bestCost=cost;}
  }
  if(!best){const top=clamp(preferred,86,height-c.height-20);best={left,top,right:left+c.width,bottom:top+c.height};}
  placed.push(best);output.push({...best,id:c.id,anchorX:c.x,anchorY:c.y});
 }
 return output;
}
