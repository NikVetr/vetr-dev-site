/** @typedef {ReturnType<typeof import('./diagram-projection.js').diagramProjection>} Projection */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{width:number,height:number,anchor:number,expanded?:boolean,shape?:string}} Size */
/** @typedef {{id:string,from:string,to:string,points:Point[],label?:string,kind:string}} Route */
/** @typedef {{positions:Record<string,Point>,plates:{id:string,x:number,y:number,width:number,height:number,label:string,members:string[]}[],routes:Route[],width:number,height:number}} DiagramLayout */

/** ELK owns ranking, crossing minimization, compound placement and orthogonal routes.
 * Layout coordinates are presentation only; the simulator never receives them.
 * @param {Projection} projection @param {Record<string,Size>} sizes @param {boolean} plateView
 * @param {{layout:(graph:any)=>Promise<any>}} engine @param {'DOWN'|'RIGHT'} [direction] @returns {Promise<DiagramLayout>} */
export async function layoutDiagram(projection,sizes,plateView,engine,direction='DOWN') {
  const edgeId=(/** @type {number} */i)=>`edge-${i}`;
  const nodes=projection.nodes.map(node=>{
    const size=sizes[node.id],shape=size.shape??(node.kind==='deterministic'?'diamond':'circle'),expanded=size.expanded??size.height>116;
    const outgoing=projection.edges.map((edge,index)=>({edge,index})).filter(({edge})=>edge.from===node.id);
    const incoming=projection.edges.map((edge,index)=>({edge,index})).filter(({edge})=>edge.to===node.id);
    const spread=(/** @type {number} */i,/** @type {number} */n)=>(i-(n-1)/2)*Math.min(10,36/Math.max(1,n-1));
    const ports=[...outgoing.map(({index},i)=>{
      const offset=spread(i,outgoing.length),symbolPort=plateView&&!expanded;
      const radius=shape==='diamond'?36*(1-Math.abs(offset)/30):Math.sqrt(30**2-offset**2);
      if(direction==='RIGHT')return {id:`${edgeId(index)}-out`,width:0,height:0,x:symbolPort?size.width/2+radius:size.width,y:size.anchor+offset,layoutOptions:{'elk.port.side':'EAST'}};
      return {id:`${edgeId(index)}-out`,width:0,height:0,x:symbolPort?size.width/2+radius:size.width/2+offset,y:symbolPort?size.anchor+offset:size.height,layoutOptions:{'elk.port.side':symbolPort?'EAST':'SOUTH'}};
    }),...incoming.map(({index},i)=>{
      const offset=spread(i,incoming.length),radius=shape==='diamond'?30*(1-Math.abs(offset)/36):Math.sqrt(30**2-offset**2);
      if(direction==='RIGHT'){const horizontalRadius=shape==='diamond'?36*(1-Math.abs(offset)/30):Math.sqrt(30**2-offset**2);return {id:`${edgeId(index)}-in`,width:0,height:0,x:plateView?size.width/2-horizontalRadius:0,y:size.anchor+offset,layoutOptions:{'elk.port.side':'WEST'}};}
      return {id:`${edgeId(index)}-in`,width:0,height:0,x:size.width/2+offset,y:plateView?size.anchor-radius:0,layoutOptions:{'elk.port.side':'NORTH'}};
    })];
    return {id:node.id,width:size.width,height:size.height,layoutOptions:{'elk.portConstraints':'FIXED_POS'},ports};
  });
  const grouped=new Set(plateView?projection.plates.flatMap(plate=>plate.members):[]);
  const groups=plateView?projection.plates.map(plate=>({id:plate.id,layoutOptions:{'elk.padding':'[top=30,left=25,bottom=38,right=25]'},children:nodes.filter(node=>plate.members.includes(node.id))})):[];
  const graph={id:'__diagram-root',layoutOptions:{
    'elk.algorithm':'layered','elk.direction':direction,'elk.edgeRouting':'ORTHOGONAL',
    'elk.hierarchyHandling':'INCLUDE_CHILDREN','elk.layered.crossingMinimization.strategy':'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy':'NETWORK_SIMPLEX','elk.layered.mergeEdges':'false',
    'elk.spacing.nodeNode':'34','elk.spacing.edgeNode':'18','elk.spacing.edgeEdge':'12',
    'elk.layered.spacing.nodeNodeBetweenLayers':'64','elk.layered.spacing.edgeEdgeBetweenLayers':'12',
    'elk.padding':'[top=24,left=24,bottom=24,right=24]',
  },children:[...nodes.filter(node=>!grouped.has(node.id)),...groups],edges:projection.edges.map((edge,i)=>({id:edgeId(i),sources:[`${edgeId(i)}-out`],targets:[`${edgeId(i)}-in`]}))};
  // ELK mutates requested port positions while snapping them to rectangle sides.
  const attachments=new Map(nodes.flatMap(node=>node.ports.map(port=>/** @type {[string,{x:number,y:number}]} */([port.id,{x:port.x,y:port.y}]))));
  const laid=await engine.layout(graph);
  /** @type {DiagramLayout} */const result={positions:{},plates:[],routes:[],width:laid.width,height:laid.height};
  /** @type {Map<string,Point>} */const origins=new Map([['__diagram-root',{x:0,y:0}]]);
  /** @param {any} parent @param {Point} origin */
  function collectNodes(parent,origin) {
    for(const child of parent.children??[]) {
      const x=origin.x+child.x,y=origin.y+child.y;origins.set(child.id,{x,y});
      if(child.children) {
        const plate=projection.plates.find(p=>p.id===child.id);
        if(plate)result.plates.push({...plate,x,y,width:child.width,height:child.height});
        collectNodes(child,{x,y});
      } else result.positions[child.id]={x:x+sizes[child.id].width/2,y:y+sizes[child.id].anchor};
    }
  }
  collectNodes(laid,{x:0,y:0});
  /** @param {any} parent */
  function collectEdges(parent) {
    for(const edge of parent.edges??[]) {
      const index=Number(edge.id.slice(5)),definition=projection.edges[index],origin=origins.get(edge.container??parent.id)??{x:0,y:0};
      for(const section of edge.sections??[]) {
        const points=[section.startPoint,...section.bendPoints??[],section.endPoint].map(point=>({x:point.x+origin.x,y:point.y+origin.y}));
        // ELK clamps cardinal ports to the label/card rectangle. Continue the
        // clear header segment to the actual circle/diamond boundary.
        for(const [id,suffix,prepend] of [[definition.from,'out',true],[definition.to,'in',false]]) {
          const port=attachments.get(`${edge.id}-${suffix}`),nodeOrigin=origins.get(String(id));
          if(!port||!nodeOrigin)continue;
          const exact={x:nodeOrigin.x+port.x,y:nodeOrigin.y+port.y},endpoint=prepend?points[0]:points[points.length-1];
          if(Math.hypot(exact.x-endpoint.x,exact.y-endpoint.y)>.01){if(prepend)points.unshift(exact);else points.push(exact);}
        }
        result.routes.push({id:edge.id,...definition,points});
      }
    }
    for(const child of parent.children??[])collectEdges(child);
  }
  collectEdges(laid);
  return result;
}

/** Follow moved node endpoints while keeping ELK's interior channels orthogonal.
 * @param {Route} route @param {Record<string,Point>} offsets @returns {Route} */
export function movedRoute(route,offsets) {
  const a=offsets[route.from]??{x:0,y:0},b=offsets[route.to]??{x:0,y:0};
  if(!a.x&&!a.y&&!b.x&&!b.y)return route;
  const original=route.points,start={x:original[0].x+a.x,y:original[0].y+a.y},end={x:original[original.length-1].x+b.x,y:original[original.length-1].y+b.y};
  if(original.length===2){const y=(start.y+end.y)/2;return {...route,points:[start,{x:start.x,y},{x:end.x,y},end]};}
  const middle=original.slice(1,-1).map(p=>({...p}));
  const first=Math.abs(original[0].y-original[1].y)<.01?{x:middle[0].x,y:start.y}:{x:start.x,y:middle[0].y};
  const last=Math.abs(original[original.length-1].y-original[original.length-2].y)<.01?{x:middle[middle.length-1].x,y:end.y}:{x:end.x,y:middle[middle.length-1].y};
  return {...route,points:[start,first,...middle,last,end]};
}

/** Route jumps distinguish crossings from joins; true shared endpoints never jump.
 * @param {Point[]} points @param {Point[][]} preceding @param {number} [radius] */
export function bridgePath(points,preceding,radius=5) {
  if(!points.length)return '';
  let path=`M${points[0].x},${points[0].y}`;
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],horizontal=Math.abs(a.y-b.y)<.01,vertical=Math.abs(a.x-b.x)<.01;
    if(!horizontal&&!vertical){path+=` L${b.x},${b.y}`;continue;}
    const start=horizontal?a.x:a.y,end=horizontal?b.x:b.y,direction=Math.sign(end-start),fixed=horizontal?a.y:a.x;
    /** @type {number[]} */const crosses=[];
    for(const line of preceding)for(let j=1;j<line.length;j++) {
      const c=line[j-1],d=line[j];
      if(horizontal?Math.abs(c.x-d.x)>.01:Math.abs(c.y-d.y)>.01)continue;
      const cross=horizontal?c.x:c.y,lo=horizontal?Math.min(c.y,d.y):Math.min(c.x,d.x),hi=horizontal?Math.max(c.y,d.y):Math.max(c.x,d.x);
      if(fixed<=lo+.1||fixed>=hi-.1||cross<=Math.min(start,end)+radius+1||cross>=Math.max(start,end)-radius-1)continue;
      if(!crosses.some(value=>Math.abs(value-cross)<radius*2+1))crosses.push(cross);
    }
    crosses.sort((a,b)=>(a-b)*direction);
    for(const cross of crosses) {
      if(horizontal)path+=` L${cross-direction*radius},${fixed} Q${cross},${fixed-radius*1.6} ${cross+direction*radius},${fixed}`;
      else path+=` L${fixed},${cross-direction*radius} Q${fixed+radius*1.6},${cross} ${fixed},${cross+direction*radius}`;
    }
    path+=` L${b.x},${b.y}`;
  }
  return path;
}
