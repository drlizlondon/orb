// Keep fine particles crisp and avoid implicit derivatives in FXAA's edge loops.
export function createEdgeShader(base) {
  let fragmentShader=base.fragmentShader
    .replace('float _SubpixelBlending = 1.0;','float _SubpixelBlending = 0.38;')
    .replace('return texture( tex2D, uv );','return textureLod( tex2D, uv, 0.0 );');
  const start=fragmentShader.indexOf('vec4 ApplyFXAA(');
  const end=fragmentShader.indexOf('void main()',start);
  fragmentShader=fragmentShader.slice(0,start)+`
  vec4 ApplyFXAA(sampler2D tex2D,vec2 texSize,vec2 uv){
    vec4 result=vec4(0.0);
    LuminanceData luminance=SampleLuminanceNeighborhood(tex2D,texSize,uv);
    if(ShouldSkipPixel(luminance)){
      result=Sample(tex2D,uv);
    }else{
      float pixelBlend=DeterminePixelBlendFactor(luminance);
      EdgeData edge=DetermineEdge(texSize,luminance);
      float edgeBlend=DetermineEdgeBlendFactor(tex2D,texSize,luminance,edge,uv);
      float finalBlend=max(pixelBlend,edgeBlend);
      if(edge.isHorizontal)uv.y+=edge.pixelStep*finalBlend;
      else uv.x+=edge.pixelStep*finalBlend;
      result=Sample(tex2D,uv);
    }
    return result;
  }
  `+fragmentShader.slice(end);
  return {...base,fragmentShader};
}
