// Xerox of a Xerox: the scene quantized to 1 bit through a Bayer matrix three
// times — one drifting plate per channel. Sunburst is composited after the
// degradation so it always spins. Polarity alternates every 12s generation
// (black S on white, then white S on black, equal time each);
// prefers-color-scheme: dark starts on the dark phase instead.
import { run } from './core.js';

export const start = () => run(({ gl, mkProg, mkTex, PRE, MARCH, SH }) => {
  const scene = mkProg(PRE + `
float mp(vec3 p){
vec3 q=p-vec3(0.,.4,0.);
q.xz*=rt(T*.3);
return min(p.y+1.25,lg(q));}` + MARCH + SH + `
void main(){
vec2 uv=(2.*gl_FragCoord.xy-R)/R.y;
vec3 ro=vec3(0.,.45,3.8);
vec3 fw=normalize(vec3(0.,.15,0.)-ro);
vec3 rg=normalize(cross(fw,vec3(0.,1.,0.)));
vec3 rd=normalize(fw*1.7+uv.x*rg+uv.y*cross(rg,fw));
vec3 ld=normalize(vec3(.5,.8,.6));
vec3 oc=ro-vec3(0.,.4,0.);
float b=dot(oc,rd);
float t;
if(b*b-dot(oc,oc)+3.6>0.)t=mh(ro,rd,30.);
else{t=rd.y<0.?(-1.25-ro.y)/rd.y:-1.;if(t>30.)t=-1.;}
if(t<0.){gl_FragColor=vec4(1.,1.,1.,0.);return;}
vec3 p=ro+rd*t;
float l;
if(p.y<-1.2){
float ck=mod(floor(p.x*1.1)+floor(p.z*1.1),2.);
l=mix(.1,.95,ck)*(.45+.55*sh(p,ld));
}else{
vec3 n=nm(p);
l=.12+.3*max(0.,dot(n,ld));
l+=.45*pow(clamp(1.+dot(n,rd),0.,1.),2.);
}
l=mix(l,1.,smoothstep(8.,28.,t));
gl_FragColor=vec4(vec3(l),1.);}`);
  const post = mkProg(`precision highp float;
uniform float T,DK;uniform vec2 R;uniform sampler2D S,X;
float m2(vec2 p){return 2.*p.x+3.*p.y-4.*p.x*p.y;}
float bay(vec2 p){return(4.*m2(mod(p,2.))+m2(mod(floor(p*.5),2.)))/16.+.03;}
float plate(vec2 tuv,float g){
vec4 sc=texture2D(S,clamp(tuv,0.,1.));
float l=clamp((sc.r-.5)*(1.+4.*g)+.5,0.,1.);
vec2 sp=tuv*R;
if(sc.a<.5){
vec2 cu=(2.*sp-R)/R.y;
l=mix(.78,1.,step(.5,fract(atan(cu.y-.25,cu.x)*1.2732+T*.05)));}
float tv=1.-(sp.y-8.+9.*sin(sp.x*.02+T*2.2))/30.;
if(tv>0.&&tv<1.)l=min(l,1.-texture2D(X,vec2((sp.x+T*130.)/1024.,tv)).r);
return l;}
void main(){
vec2 fc=gl_FragCoord.xy;
vec2 tuv=fc/R;
float cyc=mod(T,12.);
float g=cyc/12.;
float th=bay(floor(fc/2.)+floor(T/12.)*vec2(1.,2.));
vec2 px=(1.+3.*g)/R;
vec3 col=vec3(
step(th,plate(tuv+px*vec2(sin(T*.6),cos(T*.83)),g)),
step(th,plate(tuv+px*vec2(sin(T*.71+2.1),cos(T*.55+1.3)),g)),
step(th,plate(tuv+px*vec2(sin(T*.64+4.2),cos(T*.77+2.6)),g)));
float inv=mod(floor(T/12.),2.);
inv=abs(inv-step(11.8,cyc));
inv=abs(inv-DK);
col=mix(col,1.-col,inv);
gl_FragColor=vec4(col,1.);}`);
  // Scrolltext texture (unit 1): real text, rendered once, sine-displaced.
  const txt = document.createElement('canvas');
  txt.width = 1024;
  txt.height = 32;
  const tc = txt.getContext('2d');
  tc.fillStyle = '#000';
  tc.fillRect(0, 0, 1024, 32);
  tc.fillStyle = '#fff';
  tc.font = 'bold 26px monospace';
  tc.fillText('SPEEDSHOP +++ FAST SITES ARE PROFITABLE SITES +++ GREETZ TO PUMA CREW ', 0, 26);
  mkTex(1, gl.LINEAR, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, txt);
  const dark = matchMedia('(prefers-color-scheme: dark)');
  let fbo = null;
  return {
    staticT: 1,
    resize(W, H) {
      // Scene renders into unit 2's texture, post reads it back.
      const tex = mkTex(2, gl.LINEAR, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.useProgram(scene);
      gl.uniform2f(scene.u.R, W, H);
      gl.uniform1i(scene.u.D, 0);
      gl.useProgram(post);
      gl.uniform2f(post.u.R, W, H);
      gl.uniform1i(post.u.S, 2);
      gl.uniform1i(post.u.X, 1);
    },
    draw(t) {
      gl.useProgram(scene);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.uniform1f(scene.u.T, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(post);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.uniform1f(post.u.T, t);
      gl.uniform1f(post.u.DK, dark.matches ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
});
