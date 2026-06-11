// I-Frame Funeral: 2s of clean spinning chrome per cycle, then the S is only
// ever re-projected from the previous frame along its true motion vectors,
// macroblock-quantized, until the next keyframe snaps in.
import { run } from './core.js';

run(({ gl, mkProg, mkTex, PRE, MARCH }) => {
  const sim = mkProg(PRE + `
uniform float K,TH,TP,B,BP;uniform sampler2D P;
float mp(vec3 p){vec3 q=p-vec3(0.,B,0.);q.xz*=rt(TH);return lg(q);}` + MARCH + `
vec3 chrome(vec3 p,vec3 n,vec3 rd){
vec3 l=normalize(vec3(.6,.7,.5));
vec3 rr=reflect(rd,n);
float fr=pow(clamp(1.+dot(n,rd),0.,1.),3.);
float c=.12+.5*max(0.,dot(n,l))+.7*fr;
c+=pow(max(0.,dot(rr,l)),50.);
c+=.45*pow(max(0.,dot(rr,normalize(vec3(-.7,.3,.4)))),8.);
return vec3(clamp(c,0.,1.));}
vec2 prj(vec3 w,vec3 ro){vec3 d=w-ro;return 1.8*d.xy/(-d.z);}
float cst(vec3 ro,vec3 rd){
vec3 oc=ro-vec3(0.,B,0.);
float b=dot(oc,rd);
return b*b-dot(oc,oc)+3.6>0.?mh(ro,rd,8.):-1.;}
void main(){
vec2 fc=gl_FragCoord.xy;
vec3 ro=vec3(0.,0.,3.4);
if(K>.5){
vec3 rd=normalize(vec3((2.*fc-R)/R.y,-1.8));
float t=cst(ro,rd);
vec3 col=vec3(0.);
if(t>0.){vec3 p=ro+rd*t;col=chrome(p,nm(p),rd);}
gl_FragColor=vec4(col,0.);
return;
}
vec2 bc=(floor(fc/8.)+.5)*8.;
vec3 rd=normalize(vec3((2.*bc-R)/R.y,-1.8));
float t=cst(ro,rd);
vec2 mv=vec2(0.);
if(t>0.){
vec3 p=ro+rd*t;
vec3 q=p-vec3(0.,B,0.);q.xz*=rt(TH);
vec3 pp=q;pp.xz*=rt(-TP);pp+=vec3(0.,BP,0.);
mv=prj(p,ro)-prj(pp,ro);
}
vec4 prev=texture2D(P,fc/R-mv*R.y/(2.*R));
float st=min(1.,prev.a+.005);
vec3 col=prev.rgb*.9985;
float n=hs(floor(fc/8.)+floor(T*30.)*.37);
if(n>.994&&st>.05&&dot(col,col)>.02){
col=.5+.5*cos(6.2832*hs(floor(fc/8.)+floor(T*30.))+vec3(0.,2.1,4.2));
}
gl_FragColor=vec4(col,st);}`);
  const show = mkProg(`precision highp float;
uniform vec2 R;uniform sampler2D P;
void main(){gl_FragColor=vec4(texture2D(P,gl_FragCoord.xy/R).rgb,1.);}`);
  const fbos = [];
  let cur = 0, forceKey = true, thPrev = 0, bPrev = 0;
  return {
    staticT: 15.708,
    resize(W, H) {
      // Ping-pong feedback textures live on units 1 and 2.
      for (let i = 0; i < 2; i++) {
        const tex = mkTex(1 + i, gl.NEAREST, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        fbos[i] = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      }
      gl.useProgram(sim);
      gl.uniform2f(sim.u.R, W, H);
      gl.uniform1i(sim.u.D, 0);
      gl.useProgram(show);
      gl.uniform2f(show.u.R, W, H);
      forceKey = true;
    },
    draw(t, still) {
      const th = t * 0.8, b = 0.25 * Math.sin(t * 0.9);
      const key = still || forceKey || t % 6.5 < 2;
      forceKey = false;
      gl.useProgram(sim);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[cur]);
      gl.uniform1i(sim.u.P, 2 - cur);
      gl.uniform1f(sim.u.T, t);
      gl.uniform1f(sim.u.K, key ? 1 : 0);
      gl.uniform1f(sim.u.TH, th);
      gl.uniform1f(sim.u.TP, thPrev);
      gl.uniform1f(sim.u.B, b);
      gl.uniform1f(sim.u.BP, bPrev);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(show);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.uniform1i(show.u.P, 1 + cur);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      thPrev = th;
      bPrev = b;
      cur = 1 - cur;
    },
  };
});
