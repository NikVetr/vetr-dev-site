import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createWarpGrid,gridWeights,gridGradientBound} from '../core/warp-grid.js';

/** @param {import('../core/warp-grid.js').Grid} grid @param {[number,number]} p */
function sample(grid,p){
 const out={x:0,y:0,xx:0,xy:0,yx:0,yy:0};
 for(const {j,b:[v,dx,dy]} of gridWeights(grid,p)){
  const n=grid.nodes[j];out.x+=v*n.dx;out.y+=v*n.dy;out.xx+=dx*n.dx;out.xy+=dy*n.dx;out.yx+=dx*n.dy;out.yy+=dy*n.dy;
 }
 return out;
}
/** @param {number} actual @param {number} expected @param {number} [tolerance] */
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);

test('the grid reproduces translation and affine fields without spurious strain, including edges',()=>{
 const grid=createWarpGrid(6.5,4.9);
 for(const node of grid.nodes){node.dx=.06;node.dy=-.03}
 assert.equal(gridGradientBound(grid),0);
 for(const x of [0,.17,1.2,4.3,6.5])for(const y of [0,.3,2.1,4.9]){
  const weights=gridWeights(grid,[x,y]);close(weights.reduce((a,w)=>a+w.b[0],0),1);
  const s=sample(grid,[x,y]);close(s.x,.06);close(s.y,-.03);
  for(const value of [s.xx,s.xy,s.yx,s.yy])close(value,0);
 }
 for(const n of grid.nodes){n.dx=.05*n.x+.02*n.y+.03;n.dy=-.01*n.x+.04*n.y-.06}
 close(gridGradientBound(grid),.07);
 for(const x of [0,.17,1.2,4.3,6.5])for(const y of [0,.3,2.1,4.9]){
  const s=sample(grid,[x,y]);close(s.x,.05*x+.02*y+.03);close(s.y,-.01*x+.04*y-.06);
  close(s.xx,.05);close(s.xy,.02);close(s.yx,-.01);close(s.yy,.04);
 }
});

test('nonlinear field derivatives match finite differences and stay inside the whole-grid bound',()=>{
 const grid=createWarpGrid(6.5,4.9);
 grid.nodes.forEach((n,i)=>{n.dx=.003*Math.sin(i*.71);n.dy=.002*Math.cos(i*.37)});
 const bound=gridGradientBound(grid);assert.ok(bound>0 && bound<.18);
 for(let ix=1;ix<23;ix++)for(let iy=1;iy<19;iy++){
  const x=ix/23*grid.width,y=iy/19*grid.height,h=1e-5,s=sample(grid,[x,y]);
  const xp=sample(grid,[x+h,y]),xm=sample(grid,[x-h,y]),yp=sample(grid,[x,y+h]),ym=sample(grid,[x,y-h]);
  close(s.xx,(xp.x-xm.x)/(2*h),1e-8);close(s.yx,(xp.y-xm.y)/(2*h),1e-8);
  close(s.xy,(yp.x-ym.x)/(2*h),1e-8);close(s.yy,(yp.y-ym.y)/(2*h),1e-8);
  const trace=s.xx*s.xx+s.xy*s.xy+s.yx*s.yx+s.yy*s.yy,det=s.xx*s.yy-s.xy*s.yx;
  const norm=Math.sqrt((trace+Math.sqrt(Math.max(0,trace*trace-4*det*det)))/2);
  assert.ok(norm<=bound+1e-12);
  assert.ok((1+s.xx)*(1+s.yy)-s.xy*s.yx>0,'identity plus the displacement cannot fold');
 }
});
