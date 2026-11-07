// Everything in this collection is sold by the resident furniture catalog.
function buildExtraFurniture(id,g,kit,T) {
  const {box,cylinder}=kit,wood=0xb88951,light=0xe2bc83,dark=0x654b32,white=0xedead8,green=0x748d68,metal=0x59665e
  function legs(w,d,h){for(const x of [-w/2+.18,w/2-.18])for(const z of [-d/2+.18,d/2-.18])box(g,x,h/2,z,.15,h,.15,dark)}
  if(id==='kitchen'){
    box(g,0,.43,0,2.84,.82,.83,wood);box(g,0,.88,0,2.94,.12,.9,white)
    for(const x of [-.94,0,.94]){box(g,x,.43,.43,.88,.68,.04,light);box(g,x,.64,.47,.19,.045,.04,metal)}
    box(g,-.9,.95,0,.62,.04,.58,metal);box(g,-.9,.974,0,.48,.01,.44,0xa7c3bc)
    box(g,-.9,1.1,-.29,.04,.3,.04,metal);box(g,-.9,1.23,-.2,.04,.04,.22,metal)
    box(g,.84,.96,0,.76,.03,.63,0x414942)
    for(const x of [.64,1.04])for(const z of [-.15,.15])cylinder(g,x,.985,z,.115,.115,.015,metal,12)
    box(g,0,.96,0,.5,.03,.4,light);box(g,.05,1.01,0,.16,.07,.18,0x809852)
  }else if(id==='bathtub'){
    box(g,0,.18,0,1.82,.28,.82,white);box(g,0,.38,0,1.55,.1,.54,0x9ecac8)
    for(const z of [-.37,.37])box(g,0,.43,z,1.9,.5,.14,white)
    for(const x of [-.88,.88])box(g,x,.43,0,.15,.5,.88,white)
    box(g,-.7,.79,-.3,.045,.27,.045,metal);box(g,-.7,.91,-.2,.045,.045,.24,metal)
    for(const x of [-.5,-.2,.16,.48])cylinder(g,x,.45,.1,.08,.08,.025,0xe6f4e8,10)
  }else if(id==='vanity'){
    box(g,0,.42,0,.84,.78,.75,wood);box(g,0,.84,0,.91,.1,.84,white)
    box(g,0,.9,0,.54,.07,.42,0xa9c5ba);box(g,0,.94,0,.4,.01,.28,white)
    box(g,.1,1.05,-.25,.04,.22,.04,metal);box(g,.1,1.15,-.15,.04,.04,.22,metal)
    box(g,0,1.43,-.36,.83,.92,.09,wood);box(g,0,1.43,-.3,.68,.74,.03,0xa5c6c3)
    box(g,0,.45,.4,.67,.55,.035,light);box(g,0,.66,.44,.22,.04,.04,dark)
  }else if(id==='toilet'){
    box(g,0,.22,.08,.38,.44,.4,white);box(g,0,.49,.1,.62,.18,.68,white)
    box(g,0,.58,.09,.4,.025,.43,0xa9c8bd);box(g,0,.61,.09,.29,.015,.31,0xeff3e7)
    box(g,0,.6,-.29,.65,.69,.25,white);box(g,0,.97,-.29,.69,.07,.29,white)
    box(g,.19,.95,-.12,.09,.03,.05,metal)
  }else if(id==='piano'){
    legs(1.75,.76,.36);box(g,0,.69,-.14,1.86,.86,.56,dark);box(g,0,1.16,-.14,1.94,.11,.64,wood)
    box(g,0,.75,.25,1.84,.13,.39,wood);box(g,0,.83,.28,1.68,.04,.3,white)
    for(let i=0;i<16;i++){const x=-.79+i*.105;box(g,x,.858,.29,.008,.009,.29,0xc1baa0);if(i%7!==2&&i%7!==6)box(g,x+.04,.883,.2,.045,.04,.16,0x343d36)}
    box(g,0,1.04,.18,.54,.3,.03,white);box(g,0,.16,.31,.33,.03,.2,0xc7ad6d)
  }else if(id==='arcade'){
    box(g,0,.53,0,.78,1.02,.78,green);box(g,0,1.3,-.16,.8,.64,.48,dark)
    box(g,0,1.35,.1,.65,.45,.025,0x2b4246);box(g,0,1.72,-.13,.87,.19,.57,0xb5975d)
    box(g,0,1.72,.17,.66,.11,.015,0xe7d289);box(g,0,.98,.2,.88,.12,.5,light)
    cylinder(g,-.2,1.11,.24,.035,.04,.18,metal,8);box(g,-.2,1.22,.24,.1,.1,.1,0xb36149)
    for(let i=0;i<3;i++)cylinder(g,.04+i*.13,1.06,.28,.045,.045,.035,[0xb7754f,0xd6bc65,0x80a4a0][i],8)
    for(let i=0;i<5;i++)box(g,-.23+i*.11,1.22+(i%3)*.07,.126,.075,.065,.008,0xb4cd91)
  }else if(id==='aquarium'){
    legs(1.75,.75,.2);box(g,0,.47,0,1.85,.6,.78,wood)
    box(g,0,1.18,0,1.83,.81,.78,0x83b8b6);box(g,0,.8,0,1.9,.1,.85,dark);box(g,0,1.62,0,1.9,.1,.85,dark)
    box(g,0,.88,.4,1.68,.12,.025,0xd7c894)
    for(const x of [-.68,.58])for(let i=0;i<3;i++)box(g,x+i*.05,1.08+i*.05,.415,.035,.34+i*.1,.018,green)
    for(const [x,y,c]of [[-.27,1.23,0xdba960],[.34,1.4,0xe0be77]]){box(g,x,y,.425,.22,.11,.025,c);box(g,x-.15,y,.425,.08,.16,.025,c);box(g,x+.08,y+.02,.444,.025,.025,.008,metal)}
  }else if(id==='fireplace'){
    box(g,0,.1,0,1.92,.2,.92,0x9d9c87);box(g,0,.63,-.3,1.85,1.2,.2,0x949885)
    for(const x of [-.78,.78])for(let y=0;y<4;y++)box(g,x,.28+y*.26,0,.3,.24,.78,y%2?0xb9b59b:0xa8a58d)
    box(g,0,1.3,0,1.97,.2,.9,wood);box(g,0,.64,-.18,1.3,.93,.05,0x373e32)
    for(const x of [-.3,0,.3]){box(g,x,.25,.03,.14,.14,.5,dark);box(g,x,.5,-.08,.16,.36+(x===0?.15:0),.13,0xddaa52);box(g,x,.4,.02,.1,.24,.1,0xf3d68b)}
  }else if(id==='pool'){
    box(g,0,.12,0,2.84,.24,2.84,0x80b4bc);box(g,0,.26,0,2.48,.06,2.48,0x83c6ca)
    for(const z of [-1.37,1.37])box(g,0,.3,z,2.94,.36,.22,white)
    for(const x of [-1.37,1.37])box(g,x,.3,0,.22,.36,2.94,white)
    for(let i=0;i<6;i++)box(g,-.9+i*.34,.296,(i%3)*.52-.5,.32,.012,.035,0xc2e3d6)
    for(const x of [-.25,.25]){box(g,x,.5,1.19,.045,.75,.045,metal);box(g,x,.86,1.3,.045,.045,.27,metal)}
    for(const y of [.2,.4,.6])box(g,0,y,1.15,.54,.04,.09,metal)
  }else if(id==='treadmill'){
    box(g,0,.13,0,.87,.22,1.84,metal);box(g,0,.255,.1,.64,.035,1.42,0x37453c)
    for(const x of [-.39,.39]){box(g,x,.8,-.64,.07,1.34,.07,metal);box(g,x,1.34,-.4,.06,.07,.6,metal)}
    box(g,0,1.45,-.62,.86,.22,.22,metal);box(g,0,1.48,-.49,.38,.12,.015,0x98bba0)
    for(let i=0;i<6;i++)box(g,0,.275,-.45+i*.23,.58,.006,.018,0x667a69)
  }else if(id==='pooltable'){
    legs(2.7,1.7,.75);box(g,0,.77,0,2.82,.22,1.82,dark);box(g,0,.91,0,2.61,.07,1.61,green)
    for(const z of [-.88,.88])box(g,0,.96,z,2.9,.16,.18,wood)
    for(const x of [-1.38,1.38])box(g,x,.96,0,.18,.16,1.84,wood)
    for(const x of [-1.24,0,1.24])for(const z of [-.75,.75])cylinder(g,x,.966,z,.08,.08,.015,0x354332,12)
    for(let i=0;i<6;i++)box(g,-.45+i*.17,.99,(i%3)*.16-.2,.09,.09,.09,[white,0xd9b85d,0xbb7151,0x78a3ab][i%4])
    const cue=box(g,0,1.04,.39,1.97,.025,.025,light);cue.rotation.y=.12
  }else if(id==='sectional'){
    legs(2.7,1.7,.2);box(g,0,.28,0,2.84,.23,1.82,wood)
    box(g,0,.64,-.78,2.84,.6,.24,white);box(g,-1.29,.64,0,.25,.6,1.84,white)
    for(const x of [-.87,0,.87]){box(g,x,.49,-.3,.81,.2,.69,0xd6d5b7);box(g,x,.75,-.58,.8,.3,.19,white)}
    box(g,-.86,.49,.45,.81,.2,.73,0xd6d5b7);box(g,1.29,.51,-.34,.24,.33,.95,white)
    for(const [x,z]of [[-.95,-.47],[.9,-.47]])box(g,x,.75,z,.34,.32,.2,green)
  }
}
module.exports={buildExtraFurniture}
