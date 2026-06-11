// Dazzle Interference: screen-space vs object-space B/W camo; the S is
// visible only as pattern shear, with a leaked white keyframe every ~18s.
import { run } from './core.js';

export const start = () => run(({ gl, mkProg, PRE, MARCH }) => {
  const prog = mkProg(PRE + `
float mp(vec3 p){vec3 q=p;q.xz*=rt(T*.3);return lg(q);}` + MARCH + `
float dz(vec2 p,float seed){
float h=hs(floor(p)+seed);
float a=h*6.2832;
return step(.5,fract(dot(p,vec2(cos(a),sin(a)))*(2.+5.*fract(h*7.3))));}
void main(){
vec2 uv=(2.*gl_FragCoord.xy-R)/R.y;
vec3 ro=vec3(0.,0.,3.4);
vec3 rd=normalize(vec3(uv,-1.8));
float b=dot(ro,rd);
float t=b*b-dot(ro,ro)+3.6>0.?mh(ro,rd,7.):-1.;
float c;
if(t>0.){
vec3 q=ro+rd*t;q.xz*=rt(T*.3);
c=dz(rt(.7)*q.xy*2.6+vec2(0.,T*.1),7.);
c=max(c,step(fract(T*.055),.004));
}else{
c=dz(rt(T*.04)*uv*(2.+.5*sin(T*.07))+vec2(T*.03,0.),0.);
}
gl_FragColor=vec4(vec3(c),1.);}`);
  gl.useProgram(prog);
  return {
    staticT: 8,
    resize(W, H) {
      gl.uniform2f(prog.u.R, W, H);
      gl.uniform1i(prog.u.D, 0);
    },
    draw(t) {
      gl.uniform1f(prog.u.T, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
});
