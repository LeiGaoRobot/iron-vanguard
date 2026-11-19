/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/three@0.184.0/examples/jsm/postprocessing/Pass.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import{OrthographicCamera as r,BufferGeometry as i,Float32BufferAttribute as t,Mesh as a}from"/npm/three@0.184.0/+esm";class n{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error("THREE.Pass: .render() must be implemented in derived pass.")}dispose(){}}const o=new r(-1,1,1,-1,0,1);class h extends i{constructor(){super(),this.setAttribute("position",new t([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute("uv",new t([0,2,0,0,2,0],2))}}const m=new h;class l{constructor(e){this._mesh=new a(m,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,o)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}}export{l as FullScreenQuad,n as Pass};
//# sourceMappingURL=/sm/661425aa01b11849187a3eb6f2e66c090cee1b5ae2968fbdc87c8a112dbccc1f.map