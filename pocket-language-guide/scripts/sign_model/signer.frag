#version 330
// Orthographic studio portrait. Coordinates increase to the viewer's right, up and forward.
uniform vec3 joints[21];
uniform vec3 palmX, palmY, palmZ, palmCenter;
uniform vec3 palmSize, handMin, handMax, elbow, shoulder;
uniform vec4 camera; // centre and half extents
uniform float handSize;
uniform bool bust;
uniform float yaw, headRoll;
in vec2 screen;
out vec4 pixel;

float blend(float a, float b, float k) {
    float h = max(k - abs(a-b), 0.) / k;
    return min(a,b) - h*h*k*.25;
}
float oval(vec3 p, vec3 r) {
    float k = length(p/r);
    return k*(k-1.) / max(length(p/(r*r)), .0001);
}
float limb(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 v = b-a;
    float t = clamp(dot(p-a,v)/max(dot(v,v),.000001), 0., 1.);
    return length(p-a-v*t) - mix(r1,r2,t);
}
// A tapered tube along a quadratic Bézier. Adjacent spans share their tangent.
float fingerBend(vec3 p, vec3 a, vec3 control, vec3 b, float r1, float r2) {
    vec3 chord=b-a, first=control-a, curve=chord-2.*first;
    float t=clamp(dot(p-a,chord)/max(dot(chord,chord),.000001),0.,1.);
    for (int k=0;k<3;k++) {
        vec3 offset=a+t*(2.*first+t*curve)-p;
        vec3 tangent=2.*(first+t*curve);
        t=clamp(t-dot(offset,tangent)/max(dot(tangent,tangent)+2.*dot(offset,curve),.000001),0.,1.);
    }
    return length(a+t*(2.*first+t*curve)-p)-mix(r1,r2,t);
}
float hand(vec3 p) {
    vec3 outside=max(max(handMin-p,p-handMax),vec3(0.));
    float bound=length(outside);
    if(bound>.45) return bound;
    vec3 q = p-palmCenter;
    vec3 local = vec3(dot(q,palmX),dot(q,palmY),dot(q,palmZ));
    vec3 palmR=palmSize;
    palmR.x *= mix(.73,1.08,smoothstep(-.93,.30,local.y/palmR.y));
    float d = oval(local,palmR);
    for(int finger=0;finger<5;finger++) {
        int i = 1+4*finger;
        float r = max(handSize*.100, length(joints[5]-joints[17])*.140);
        r *= finger==0 ? 1.10 : finger==4 ? .82 : finger==3 ? .95 : 1.;
        // Round the bends of a single tapered finger around the tracked joints.
        // Its centreline keeps both endpoints, including fingertip contacts.
        vec3 a=joints[i], b=joints[i+1], c=joints[i+2], tip=joints[i+3];
        vec3 ab=.5*(a+b), bc=.5*(b+c), ct=.5*(c+tip);
        float f = limb(p,a,ab,r,r*.96);
        f = min(f,fingerBend(p,ab,b,bc,r*.96,r*.87));
        f = min(f,fingerBend(p,bc,c,ct,r*.87,r*.76));
        f = min(f,limb(p,ct,tip,r*.76,r*.66));
        vec3 base = mix(joints[0],joints[i],finger==0 ? .28 : .46);
        f = min(f,limb(p,base,a,r*1.08,r));
        d = blend(d,f,r*.40);
    }
    return d;
}

vec3 headPoint(vec3 p) {
    float c=cos(headRoll), s=sin(headRoll);
    vec2 relative=p.xy-vec2(0.,-.47);
    return vec3(c*relative.x+s*relative.y,-s*relative.x+c*relative.y-.47,p.z);
}

float mannequin(vec3 p) {
    vec3 other = vec3(.90,-1.13,-.14);
    float torso = oval(p-vec3(0.,-1.92,-.16),vec3(.71,1.05,.43));
    float yoke = oval(p-vec3(0.,-1.20,-.16),vec3(.98,.29,.37));
    torso = blend(torso,yoke,.24);
    torso = blend(torso,limb(p,vec3(0.,-2.25,-.16),vec3(0.,-3.92,-.17),.62,.70),.14);
    float upper = limb(p,shoulder,elbow,.19,.14);
    vec3 otherElbow=vec3(1.09,-2.38,-.10);
    float resting = limb(p,other,otherElbow,.19,.14);
    resting = blend(resting,limb(p,otherElbow,vec3(1.08,-3.75,-.06),.14,.095),.035);
    float shoulderBlend=.14*smoothstep(-1.58,-1.28,p.y)+.001;
    float body = blend(blend(torso,upper,shoulderBlend),resting,shoulderBlend);
    float neck = limb(p,vec3(0.,-1.05,-.095),vec3(0.,-.49,-.05),.260,.224);
    body = blend(body,neck,.16);
    // The chin locates signs that touch the face. The head is a single smooth form.
    vec3 h = headPoint(p)-vec3(0.,.025,-.015);
    float jaw = 1.-.16*smoothstep(.00,.56,-h.y);
    float head = oval(h,vec3(.622*jaw,.804,.502*jaw));
    return blend(body,head,.08);
}

float scene(vec3 p) {
    vec3 end = bust ? elbow : joints[0]+normalize(elbow-joints[0])*handSize*2.2;
    float forearm = limb(p,joints[0],end,handSize*.248,bust ? .167 : handSize*.32);
    float arm = blend(hand(p),forearm,handSize*.16);
    if (!bust) return arm;
    float body = mannequin(p);
    return length(p-elbow)<.40 ? blend(arm,body,.08) : min(arm,body);
}
vec3 normalAt(vec3 p, float e) {
    vec2 d=vec2(e,-e);
    return normalize(d.xyy*scene(p+d.xyy)+d.yyx*scene(p+d.yyx)+
                     d.yxy*scene(p+d.yxy)+d.xxx*scene(p+d.xxx));
}

void main() {
    vec2 xy = camera.xy+screen*camera.zw;
    float background = .96-.024*dot(screen,screen);
    vec3 view = vec3(sin(yaw),0.,cos(yaw));
    vec3 origin = vec3(0.,0.,.38) + vec3(view.z*xy.x,xy.y,-view.x*xy.x);
    vec3 p = origin+view*4.;
    float dist;
    float eps = .0011*camera.w;
    for(int i=0;i<100;i++) {
        dist=scene(p);
        if(dist<eps || p.z < -1.2) break;
        p-=view*max(dist*.84,eps*.48);
    }
    if(dist>=eps || p.z < -1.2) { pixel=vec4(vec3(background),1.); return; }
    vec3 n=normalAt(p,eps*1.4);
    vec3 light=normalize(vec3(-.60,.78,1.));
    float diffuse=.48+.29*max(dot(n,light),0.)+.032*n.y;
    float ao=0.;
    for(int i=1;i<=3;i++) {
        float stepSize=float(i)*.043;
        ao += max(0.,stepSize-scene(p+n*stepSize))/stepSize * (.12/float(i));
    }
    float visibility=1.;
    float ray=.027;
    for(int i=0;i<24;i++) {
        float shadowDist=scene(p+n*eps*4.+light*ray);
        visibility=min(visibility,7.*shadowDist/ray);
        ray+=clamp(shadowDist,.013,.15);
        if(ray>1.2 || visibility<.02) break;
    }
    float grey=diffuse*(1.-clamp(ao,0.,.29))*mix(.80,1.,smoothstep(0.,1.,visibility));
    pixel=vec4(vec3(grey),1.);
}
