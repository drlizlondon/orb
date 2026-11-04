export function advanceProgress(current,delta){return Math.max(0,Math.min(1,current+delta/2400));}
export function fitGalaxyDistance(width,height,elevation=.6){
 const tanV=Math.tan(Math.PI/8),aspect=width/height;
 const xLimit=width<600?.75:.88,yLimit=.76;
 let distance=0;
 // Include orbital trails and satellite stars in the visible perimeter.
 for(let i=0;i<180;i++){
  const angle=i*Math.PI/90,x=Math.cos(angle)*10.0,z=Math.sin(angle)*10.0;
  const depth=z*Math.cos(elevation),y=-z*Math.sin(elevation);
  distance=Math.max(distance,depth+Math.abs(x)/(tanV*aspect*xLimit),depth+Math.abs(y)/(tanV*yLimit));
 }
 return distance+.5;
}
