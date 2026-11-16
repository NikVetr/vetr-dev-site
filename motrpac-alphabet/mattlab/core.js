/* Cardinal Polygon Studio core. Standalone; no network or external dependencies. */
(function (global) {
"use strict";
const FACES = [
  {
    "id": "face-red_top-left-leg-cell-1",
    "label": "Upper left • lower triangle",
    "d": "M 490.05108743101005,180.84306206407632 C 500.84730210892985,169.68964504579586 515.1424480833077,162.0 531.0,162.0 L 640.0,162.0 C 657.479966688482,162.0 668.9694722017733,170.07934714406895 678.2027440404213,181.10166004782687 C 639.0946182557368,231.01113278443836 614.5350146968916,293.43119248513045 583.5,346.054 C 555.4917565413159,302.9843926676162 528.2270388426758,224.6827734672557 490.05108743101005,180.84306206407632 Z",
    "fill": "#A01417"
  },
  {
    "id": "face-red_top-left-leg-cell-2",
    "label": "Upper left • diamond",
    "d": "M 583.5,346.054 L 539.0038435615705,421.5014485763821 L 304.5,516.0003 C 299.4913779970635,518.0186422979517 292.8558,523.7 292.8558,529.5 C 292.8558,518.0472119128207 298.38623184258034,500.11870155972076 304.08825144874487,490.5 L 479.2622895619024,195.0 C 482.26826170467916,189.92924420902625 485.9011882991558,185.13026429024478 490.05108743101005,180.84306206407632 C 528.2270388426758,224.6827734672557 555.4917565413159,302.9843926676162 583.5,346.054 Z",
    "fill": "#A01417"
  },
  {
    "id": "face-red_top-connector",
    "label": "Upper bridge",
    "d": "M 678.2027440404213,181.10166004782687 C 683.0133589519473,186.84438091004395 687.2115190964438,193.3859700051852 691.3253482096642,200.0 L 769.5,325.6857 C 738.447309691207,376.94788104458854 713.1285982670755,432.55741575965567 671.8657322971576,477.0739353091296 C 666.3574744461441,472.5362355784323 661.7705336709282,466.41432019915106 656.9489878505575,459.0 L 583.5,346.054 C 614.5350146968916,293.43119248513045 639.0946182557368,231.01113278443836 678.2027440404213,181.10166004782687 Z",
    "fill": "#A01417"
  },
  {
    "id": "face-red_top-right-leg-cell-1",
    "label": "Upper right • lower triangle",
    "d": "M 858.913876230864,180.95286774247077 C 869.8885083066563,169.3814418233842 884.9792960146447,162.0 901.0,162.0 L 1009.0,162.0 C 1026.5148304733548,162.0 1039.1669914870827,169.11741619239723 1049.3166255418876,179.5854006618146 C 1006.3924568231743,228.56584566746793 968.0450095918077,293.96195032074843 933.5,350.0969 C 912.7516132174137,312.2807362634586 889.3357216968246,223.01552493432825 858.913876230864,180.95286774247077 Z",
    "fill": "#A01417"
  },
  {
    "id": "face-red_top-right-leg-cell-2",
    "label": "Upper right • diamond",
    "d": "M 933.5,350.0969 L 873.2511969300334,448.0 C 865.5304468687642,460.54606443294216 859.5576829832606,470.2516862788761 851.9464659926917,476.72681527851773 C 815.5915086763378,437.2945610787182 793.8676736694015,364.86295314241704 769.5,325.6857 L 850.4817404609325,192.0 C 852.8944282400321,188.01710394473483 855.7310477489373,184.30877650892617 858.913876230864,180.95286774247077 C 889.3357216968246,223.01552493432825 912.7516132174137,312.2807362634586 933.5,350.0969 Z",
    "fill": "#A01417"
  },
  {
    "id": "face-red_top-right-leg-cell-3",
    "label": "Upper right • cap",
    "d": "M 851.9464659926917,476.72681527851773 C 844.7314817023564,482.8648552356228 836.0441964757528,486.1 823.0,486.1 L 700.0,486.1 C 687.4900384885077,486.1 678.9219358601006,482.8868318498063 671.8657322971576,477.0739353091296 C 713.1285982670755,432.55741575965567 738.447309691207,376.94788104458854 769.5,325.6857 C 793.8676736694015,364.86295314241704 815.5915086763378,437.2945610787182 851.9464659926917,476.72681527851773 Z",
    "fill": "#A01417"
  },
  {
    "id": "face-red_left",
    "label": "Left red leg",
    "d": "M 292.8558,529.5 C 292.8558,534.5 299.31605739311783,536.9464092436077 303.5,538.6031 L 554.7186766510886,638.0766584461359 L 582.5,682.1022 C 558.5390299713924,720.6231815267117 539.6779161948594,752.4675473149239 514.3516769207116,790.9179580440159 C 500.7144711577089,811.6220253596808 485.2027615522025,834.2414548179678 468.00109800623545,840.944058261154 C 458.50439013915786,834.5763761367236 451.4007269171565,824.7394055658432 445.71842960022093,815.0 L 305.1109105762495,574.0 C 296.5595842350292,559.3431049595382 292.8558,546.5637236506378 292.8558,529.5 Z",
    "fill": "#AD1D23"
  },
  {
    "id": "face-red_bottom-cell-1",
    "label": "Lower left • cap",
    "d": "M 681.4955501766964,553.1638420544176 C 684.1426460155785,552.7598661049747 686.9685670238297,552.55 690.0,552.55 L 823.0,552.55 C 824.9121023262541,552.55 826.7535538356424,552.6880663017579 828.5305958948952,552.9542149151526 C 799.7455333935134,598.2157283054705 774.8135225670524,649.3484629644086 747.5,694.9562 C 729.6462439940899,665.5700421509537 700.5685643873668,587.3186972320298 681.4955501766964,553.1638420544176 Z",
    "fill": "#901315"
  },
  {
    "id": "face-red_bottom-cell-2",
    "label": "Lower left • diamond",
    "d": "M 747.5,694.9562 L 678.6026674038376,810.0 C 672.0888008125507,820.8767631070297 664.823934443026,832.4803038756675 654.5851435505308,839.9629058640148 C 624.8797766198196,808.4410092836177 598.4973168758486,707.4534235548564 582.5,682.1022 L 643.5219101585058,584.0 C 653.5097305413623,567.9430271812544 663.258888147785,555.9469573272355 681.4955501766964,553.1638420544176 C 700.5685643873668,587.3186972320298 729.6462439940899,665.5700421509537 747.5,694.9562 Z",
    "fill": "#901315"
  },
  {
    "id": "face-red_bottom-cell-3",
    "label": "Lower left • lower triangle",
    "d": "M 654.5851435505308,839.9629058640148 C 647.8756621336252,844.8662562222798 639.8891230639674,848.0 630.0,848.0 L 491.0,848.0 C 482.0234227064244,848.0 474.4589695520058,845.2741559939092 468.00109800623545,840.944058261154 C 485.2027615522025,834.2414548179678 500.7144711577089,811.6220253596808 514.3516769207116,790.9179580440159 C 539.6779161948594,752.4675473149239 558.5390299713924,720.6231815267117 582.5,682.1022 C 598.4973168758486,707.4534235548564 624.8797766198196,808.4410092836177 654.5851435505308,839.9629058640148 Z",
    "fill": "#901315"
  },
  {
    "id": "face-gray_top",
    "label": "Upper gray leg",
    "d": "M 933.5,350.0969 C 968.0450095918077,293.96195032074843 1006.3924568231743,228.56584566746793 1049.3166255418876,179.5854006618146 C 1058.1381282602763,188.6835960208194 1065.0691899200758,200.31285375975256 1071.6593933326117,212.0 L 1219.9610798066076,475.0 C 1224.4999716953419,483.04932563559487 1232.0207,501.48919626500003 1232.0207,510.5 C 1232.0207,500.66628754951387 1222.599482896138,495.9754527232993 1214.5,492.6726 L 953.2819531254892,386.1516345806149 L 933.5,350.0969 Z",
    "fill": "#A3AEB9"
  },
  {
    "id": "face-gray_right-cell-1",
    "label": "Lower right • lower triangle",
    "d": "M 935.5,701.9232 L 1004.624320048703,586.5730431822928 C 1072.3659705278483,560.6490363142589 1143.2665845559297,539.3545393770152 1213.5,521.2891 C 1218.848312208444,519.9134071142121 1232.0207,518.6031857002282 1232.0207,510.5 C 1232.0207,528.4047078547809 1226.8577562696194,538.6840626886552 1217.8908268805358,554.0 L 1064.7919999802384,815.5 C 1057.8077923953972,827.4293551780468 1050.4360769617829,837.4662422995714 1039.6283042002212,843.1047315906719 C 1003.8211328888734,807.1530187440623 961.4880721063547,745.776425108288 935.5,701.9232 Z",
    "fill": "#697988"
  },
  {
    "id": "face-gray_right-cell-2",
    "label": "Lower right • diamond",
    "d": "M 1039.6283042002212,843.1047315906719 C 1033.644576212212,846.2264835857953 1026.6075977165813,848.0 1018.0,848.0 L 869.5,848.0 C 859.4395918608808,848.0 851.5778230834519,845.9852786499922 845.0178558829703,842.3481563353699 C 880.2343130039708,803.1005945991104 908.2829090950199,747.3413061281939 935.5,701.9232 C 961.4880721063547,745.776425108288 1003.8211328888734,807.1530187440623 1039.6283042002212,843.1047315906719 Z",
    "fill": "#697988"
  },
  {
    "id": "face-gray_bottom",
    "label": "Lower gray bridge",
    "d": "M 747.5,694.9562 C 774.8135225670524,649.3484629644086 799.7455333935134,598.2157283054705 828.5305958948952,552.9542149151526 C 849.0390193959928,556.0257733227372 860.9687971910535,576.156517462091 873.913569162723,598.0 L 935.5,701.9232 C 908.2829090950199,747.3413061281939 880.2343130039708,803.1005945991104 845.0178558829703,842.3481563353699 C 834.9341192959632,836.7573077480963 827.9263693285545,827.3329381794756 820.7371888928335,815.5 L 747.5,694.9562 Z",
    "fill": "#505860"
  },
  {
    "id": "face-charcoal_left",
    "label": "Left charcoal wedge",
    "d": "M 292.8558,529.5 C 292.8558,523.7 299.4913779970635,518.0186422979517 304.5,516.0003 L 539.0038435615705,421.5014485763821 L 505.6830563099666,478.0 C 499.8062945975195,487.9646062173714 491.9493,506.01244588943484 491.9493,518.5 C 491.9493,526.3680445141385 495.2838865642808,543.8893230248204 499.1398912137753,550.0 L 554.7186766510886,638.0766584461359 L 303.5,538.6031 C 299.31605739311783,536.9464092436077 292.8558,534.5 292.8558,529.5 Z",
    "fill": "#353D44"
  },
  {
    "id": "face-charcoal_right",
    "label": "Right charcoal wedge",
    "d": "M 953.2819531254892,386.1516345806149 L 1214.5,492.6726 C 1222.599482896138,495.9754527232993 1232.0207,500.66628754951387 1232.0207,510.5 C 1232.0207,518.6031857002282 1218.848312208444,519.9134071142121 1213.5,521.2891 C 1143.2665845559297,539.3545393770152 1072.3659705278483,560.6490363142589 1004.624320048703,586.5730431822928 L 1006.7654890535355,583.0 C 1015.7812756716875,567.9550433261973 1025.7167,549.763574605703 1025.7167,531.5 C 1025.7167,518.171741830444 1014.9122159825521,498.4794090601627 1006.4192136626002,483.0 L 953.2819531254892,386.1516345806149 Z",
    "fill": "#373F46"
  },
  {
    "id": "inner-fillet-lower-left",
    "label": "Inner corner • lower left",
    "d": "M 576.5374810705852,672.6532935675806 C 579.2945433300841,677.0224576116296 585.672546418103,677.0018387951543 588.4013020671664,672.61494019201 L 582.5,682.1022 L 576.5374810705852,672.6532935675806 Z",
    "fill": "#AD1D23"
  },
  {
    "id": "inner-fillet-lower-right",
    "label": "Inner corner • lower right",
    "d": "M 929.5115260740035,691.8180296719702 C 932.2150483678655,696.3800522511292 938.8120791339368,696.3962183642591 941.5379274204195,691.8475005311501 L 935.5,701.9232 L 929.5115260740035,691.8180296719702 Z",
    "fill": "#697988"
  },
  {
    "id": "inner-fillet-upper-right",
    "label": "Inner corner • upper right",
    "d": "M 939.2899883154791,360.6497756748736 C 936.7073548976596,355.9426488402369 930.0053783076319,355.7755903569314 927.1914312848273,360.34819798945836 L 933.5,350.0969 L 939.2899883154791,360.6497756748736 Z",
    "fill": "#A3AEB9"
  },
  {
    "id": "inner-fillet-upper-left",
    "label": "Inner corner • upper left",
    "d": "M 589.6588517748435,355.5247591339012 C 586.8258140298242,351.1682623255315 580.4009337733006,351.3087603768257 577.7610472625636,355.7849380449333 L 583.5,346.054 L 589.6588517748435,355.5247591339012 Z",
    "fill": "#A01417"
  }
];
const SILHOUETTE = "M 292.8558,529.5 C 292.8558,518.0472119128207 298.38623184258034,500.11870155972076 304.08825144874487,490.5 L 479.2622895619024,195.0 C 490.08848083245454,176.7373649947967 509.0470486404823,162.0 531.0,162.0 L 640.0,162.0 C 666.5871813220442,162.0 679.3156257026287,180.69130663797705 691.3253482096642,200.0 L 769.5,325.6857 L 850.4817404609325,192.0 C 861.2135572285184,174.28377868047204 880.3330215342836,162.0 901.0,162.0 L 1009.0,162.0 C 1041.737756127476,162.0 1057.4867909661505,186.86613597591926 1071.6593933326117,212.0 L 1219.9610798066076,475.0 C 1224.4999716953419,483.04932563559487 1232.0207,501.48919626500003 1232.0207,510.5 C 1232.0207,528.4047078547809 1226.8577562696194,538.6840626886552 1217.8908268805358,554.0 L 1064.7919999802384,815.5 C 1053.940982894358,834.034047748162 1042.1545878755874,848.0 1018.0,848.0 L 869.5,848.0 C 843.9751081931558,848.0 832.603285216802,835.030847151305 820.7371888928335,815.5 L 747.5,694.9562 L 678.6026674038376,810.0 C 667.8202629250861,828.0043078248531 654.9801050446299,848.0 630.0,848.0 L 491.0,848.0 C 468.82279900260335,848.0 455.2647550278725,831.3623143629453 445.71842960022093,815.0 L 305.1109105762495,574.0 C 296.5595842350292,559.3431049595382 292.8558,546.5637236506378 292.8558,529.5 Z M 491.9493,518.5 C 491.9493,526.3680445141385 495.2838865642808,543.8893230248204 499.1398912137753,550.0 L 576.5374810705852,672.6532935675806 C 579.2945433300841,677.0224576116296 585.672546418103,677.0018387951543 588.4013020671664,672.61494019201 L 643.5219101585058,584.0 C 654.9594869569303,565.6123185314939 666.0840875736768,552.55 690.0,552.55 L 823.0,552.55 C 846.9792245308579,552.55 859.847140802406,574.2637933729702 873.913569162723,598.0 L 929.5115260740035,691.8180296719702 C 932.2150483678655,696.3800522511292 938.8120791339368,696.3962183642591 941.5379274204196,691.8475005311501 L 1006.7654890535355,583.0 C 1015.7812756716875,567.9550433261973 1025.7167,549.763574605703 1025.7167,531.5 C 1025.7167,518.171741830444 1014.9122159825521,498.4794090601627 1006.4192136626002,483.0 L 939.2899883154791,360.6497756748736 C 936.7073548976596,355.9426488402369 930.0053783076319,355.7755903569314 927.1914312848273,360.3481979894583 L 873.2511969300334,448.0 C 858.2116316949638,472.4389927125296 849.8047544824499,486.1 823.0,486.1 L 700.0,486.1 C 677.7244339255325,486.1 667.9470435070339,475.91223297322745 656.9489878505575,459.0 L 589.6588517748435,355.5247591339012 C 586.8258140298242,351.1682623255315 580.4009337733006,351.3087603768257 577.7610472625635,355.7849380449335 L 505.6830563099666,478.0 C 499.8062945975195,487.9646062173714 491.9493,506.01244588943484 491.9493,518.5 Z";
const GEOMETRY_ID = "ribbon20-0c215a23238c4df2";
const SCHEMA = 'cardinal-polygon-studio';
const VERSION = 1;
const WIDTH = 1536;
const HEIGHT = 1024;
const VIEWBOX = '0 0 1536 1024';
const SHADES = ['Dark', 'Medium', 'Light'];
// First three families retain the logo palette. The following twelve medium tones
// are RGB samples from the uploaded color reference; dark/light tones are derived.
const PALETTES = [
  {
    "id": "cardinal",
    "name": "Cardinal",
    "colors": [
      "#5E0E0E",
      "#8C1515",
      "#B85150"
    ]
  },
  {
    "id": "slate",
    "name": "Slate",
    "colors": [
      "#405365",
      "#697988",
      "#A3AEB9"
    ]
  },
  {
    "id": "charcoal",
    "name": "Charcoal",
    "colors": [
      "#22292F",
      "#373F46",
      "#737D85"
    ]
  },
  {
    "id": "sage",
    "name": "Sage",
    "colors": [
      "#61664B",
      "#8B8D5E",
      "#C0C1A8"
    ]
  },
  {
    "id": "burgundy",
    "name": "Burgundy",
    "colors": [
      "#491710",
      "#671201",
      "#AD7F76"
    ]
  },
  {
    "id": "gray",
    "name": "Gray",
    "colors": [
      "#929699",
      "#D8D8D8",
      "#EAEAEA"
    ]
  },
  {
    "id": "mustard",
    "name": "Mustard",
    "colors": [
      "#9A7B42",
      "#E5AE4F",
      "#F1D3A0"
    ]
  },
  {
    "id": "sky-blue",
    "name": "Sky blue",
    "colors": [
      "#80949B",
      "#BCD5DB",
      "#DBE8EC"
    ]
  },
  {
    "id": "burnt-orange",
    "name": "Burnt orange",
    "colors": [
      "#8A582D",
      "#CC782E",
      "#E3B68E"
    ]
  },
  {
    "id": "emerald",
    "name": "Emerald",
    "colors": [
      "#1F3426",
      "#253F24",
      "#899789"
    ]
  },
  {
    "id": "fawn",
    "name": "Fawn",
    "colors": [
      "#9D8479",
      "#E9BCA5",
      "#F3DBCE"
    ]
  },
  {
    "id": "navy",
    "name": "Navy",
    "colors": [
      "#282F44",
      "#323753",
      "#9093A2"
    ]
  },
  {
    "id": "violet",
    "name": "Violet",
    "colors": [
      "#785073",
      "#B06B9C",
      "#D4AFCA"
    ]
  },
  {
    "id": "chocolate",
    "name": "Chocolate",
    "colors": [
      "#29221F",
      "#342319",
      "#918883"
    ]
  },
  {
    "id": "peacock-blue",
    "name": "Peacock blue",
    "colors": [
      "#0F4866",
      "#0C5F87",
      "#7CA9BE"
    ]
  }
];
const SEQUENCES = {
  uppercase:Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
  lowercase:Array.from('abcdefghijklmnopqrstuvwxyz'),
  digits:Array.from('0123456789'),
  ascii:Array.from({length:95}, function(_, i) { return String.fromCharCode(i + 32); })
};
const PRESETS = [
  {id:'original-warm',name:'Original'},
  {id:'nv-1',name:'NV-1'},
  {id:'nv-2',name:'NV-2'},
  {id:'reference',name:'Original colors'},
  {id:'cardinal',name:'Cardinal palette'},
  {id:'monochrome',name:'All Cardinal'},
  {id:'white',name:'All white'},
  {id:'blank',name:'Clear all'}
];
// Inner tips follow the ending leg, not the adjacent outer diamond.
const CORNER_PARENTS = Object.freeze({
  'inner-fillet-upper-left':'face-red_top-connector',
  'inner-fillet-upper-right':'face-gray_top',
  'inner-fillet-lower-left':'face-red_left',
  'inner-fillet-lower-right':'face-gray_bottom'
});
const FACE_IDS = FACES.map(function(face) { return face.id; });
const FACE_ID_SET = new Set(FACE_IDS);
const HISTORY_LIMIT = 80;
const MAX_DOCUMENTS = 256;
const MAX_CUSTOM_PALETTES = 8;
const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const DEFAULT_SETTINGS = {
  family:0, shade:1, brush:'#8C1515', tool:'paint', showGuides:true,
  showIds:false, background:'white', backgroundColor:'#FFFFFF', exportTransparent:true, seed:'blank', exportType:'svg',
  pngScale:2, zoom:1
};
const own = function(object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
const isObject = function(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); };
const now = function() { return new Date().toISOString(); };
const copy = function(value) { return JSON.parse(JSON.stringify(value)); };
const positiveModulo = function(value, length) { return ((value % length) + length) % length; };

function normalizeColor(value) {
  if (typeof value !== 'string') throw new Error('Colors must be a hex value or "none".');
  const candidate = value.trim();
  if (/^(none|transparent)$/i.test(candidate)) return 'none';
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    return '#' + Array.from(candidate.slice(1)).map(function(char) { return char + char; }).join('').toUpperCase();
  }
  throw new Error('Invalid color. Use #RRGGBB, #RGB, or "none".');
}

function safeText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const result = Array.from(value).filter(function(character) {
    const point = character.codePointAt(0);
    return point >= 32 && point !== 127 && !(point >= 0xD800 && point <= 0xDFFF) && point !== 0xFFFE && point !== 0xFFFF;
  }).join('').trim();
  return Array.from(result).slice(0, maxLength || 120).join('') || fallback;
}

function validGlyph(value) {
  if (typeof value !== 'string' || !value.length || Array.from(value).length > 24 || /[\u0000-\u001F\u007F]/.test(value) || Array.from(value).some(function(character) {
    const point = character.codePointAt(0);
    return (point >= 0xD800 && point <= 0xDFFF) || point === 0xFFFE || point === 0xFFFF;
  })) {
    throw new Error('A character label must contain 1–24 printable characters.');
  }
  return value;
}

function checkedFills(value, options) {
  if (!isObject(value)) throw new Error('A design must have a polygon color map.');
  const partial = options && options.partial;
  const result = Object.create(null);
  Object.keys(value).forEach(function(id) {
    if (!FACE_ID_SET.has(id)) throw new Error('This project contains an unknown polygon: ' + safeText(id, 'unknown', 60));
    result[id] = normalizeColor(value[id]);
  });
  if (!partial) FACE_IDS.forEach(function(id) {
    if (!own(result, id)) throw new Error('A design is missing polygon ' + id + '.');
  });
  return result;
}

function presetFills(preset) {
  const kind = preset || 'reference';
  if (!PRESETS.some(function(item) { return item.id === kind; }) && kind !== 'mono') throw new Error('Unknown color preset.');
  const result = Object.create(null);
  const cardinalMap = {'#A01417':'#8C1515','#AD1D23':'#B85150','#901315':'#5E0E0E'};
  FACES.forEach(function(face) {
    result[face.id] = kind === 'blank' ? 'none' : kind === 'white' ? '#FFFFFF' :
      kind === 'monochrome' || kind === 'mono' ? '#8C1515' :
      kind === 'cardinal' ? cardinalMap[face.fill] || face.fill : face.fill;
  });
  if (kind === 'original-warm') {
    // Existing Cardinal tones (including the perceptual high tone) and Mustard.
    const red = '#8C1515', coral = '#DF3531', gold = '#E5AE4F', dark = '#5E0E0E';
    const colors = [red,red,red,red,red,red,coral,gold,gold,gold,coral,gold,gold,dark,dark,dark];
    FACES.slice(0,16).forEach(function (face, index) { result[face.id] = colors[index]; });
    Object.entries(CORNER_PARENTS).forEach(function ([corner, owner]) { result[corner] = result[owner]; });
  }
  if (kind === 'nv-1' || kind === 'nv-2') {
    const colors = kind === 'nv-1' ?
      ['#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#6B8196','#3E4D5B','#3E4D5B','#161F27','#161F27','#161F27'] :
      ['#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#8C1515','#3E4D5B','#8C1515','#161F27','#3E4D5B','#6B8196','#8C1515','#8C1515','#8C1515','#161F27','#161F27'];
    FACES.slice(0,16).forEach(function (face, index) { result[face.id] = colors[index]; });
    Object.entries(CORNER_PARENTS).forEach(function ([corner, owner]) { result[corner] = result[owner]; });
  }
  return result;
}

function getPalettes(project) {
  return PALETTES.concat(project && Array.isArray(project.customPalettes) ? project.customPalettes : []);
}

function mixHex(first, second, fraction) {
  const a = normalizeColor(first);
  const b = normalizeColor(second);
  if (a === 'none' || b === 'none') throw new Error('A palette color cannot be transparent.');
  return '#' + [1,3,5].map(function(at) {
    const n = Math.round(parseInt(a.slice(at, at + 2),16) * (1 - fraction) + parseInt(b.slice(at, at + 2),16) * fraction);
    return n.toString(16).padStart(2,'0');
  }).join('').toUpperCase();
}

function makeFamily(name, medium, id) {
  const base = normalizeColor(medium);
  if (base === 'none') throw new Error('Choose an opaque base color for a family.');
  return {id:id || 'custom-1',name:safeText(name,'Custom color',40),colors:[mixHex(base,'#15202A',0.36),base,mixHex(base,'#FFFFFF',0.46)]};
}

function validDate(value) {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : now();
}

function checkedSettings(value, paletteCount) {
  const input = isObject(value) ? value : {};
  const result = Object.assign({}, DEFAULT_SETTINGS);
  (/** @type {const} */ (['showGuides','showIds','exportTransparent'])).forEach(function(key) { if (typeof input[key] === 'boolean') result[key] = input[key]; });
  const allowed = {
    tool:['paint','clear','pick'],
    seed:['blank','copy','reference'],exportType:['svg','png']
  };
  (/** @type {const} */ (['tool','seed','exportType'])).forEach(function(key) { if (allowed[key].includes(input[key])) result[key] = input[key]; });
  if (Number.isInteger(input.family)) result.family = Math.min(Math.max(input.family,0),paletteCount - 1);
  if (Number.isInteger(input.shade)) result.shade = Math.min(Math.max(input.shade,0),3);
  if (Number.isFinite(input.pngScale)) result.pngScale = Math.min(Math.max(input.pngScale,0.25),4);
  if (Number.isFinite(input.zoom)) result.zoom = Math.min(Math.max(input.zoom,0.4),16);
  if (own(input,'brush')) result.brush = normalizeColor(input.brush);
  // Old projects may have selected the retired White tool; keep that paint color.
  if (input.tool === 'white') { result.tool = 'paint'; result.brush = '#FFFFFF'; }
  if (own(input,'background')) {
    const background = normalizeBackground(input.background);
    result.background = background === 'none' ? 'transparent' : background;
  }
  result.backgroundColor = normalizeBackground(input.backgroundColor || (result.background === 'transparent' ? 'white' : result.background));
  if (result.backgroundColor === 'none') throw new Error('Choose an opaque background color.');
  return result;
}

function validateProject(value) {
  let input = value;
  if (typeof input === 'string') {
    if (input.length > MAX_PROJECT_BYTES) throw new Error('This project is too large (maximum 2 MB).');
    try { input = JSON.parse(input); } catch (_) { throw new Error('The file is not valid project JSON.'); }
  }
  if (!isObject(input) || input.schema !== SCHEMA || input.version !== VERSION) {
    throw new Error('This is not a supported Cardinal Polygon Studio project (version 1).');
  }
  if (input.geometryId !== GEOMETRY_ID) throw new Error('This project uses a different polygon template.');
  if (!isObject(input.documents)) throw new Error('This project has no character designs.');
  const keys = Object.keys(input.documents);
  if (!keys.length || keys.length > MAX_DOCUMENTS) throw new Error('A project must have 1–256 character designs.');
  const documents = Object.create(null);
  keys.forEach(function(key) {
    const glyph = validGlyph(key);
    const entry = input.documents[key];
    if (!isObject(entry) || entry.glyph !== glyph) throw new Error('A character design has an invalid label.');
    documents[glyph] = {
      glyph:glyph,name:safeText(entry.name,glyph,120),fills:checkedFills(entry.fills),
      touched:entry.touched === true,updatedAt:validDate(entry.updatedAt)
    };
  });
  const currentGlyph = validGlyph(input.currentGlyph);
  if (!own(documents,currentGlyph)) throw new Error('The current character is missing from this project.');
  const custom = input.customPalettes === undefined ? [] : input.customPalettes;
  if (!Array.isArray(custom) || custom.length > MAX_CUSTOM_PALETTES) throw new Error('A project can contain at most eight custom color families.');
  const paletteIds = new Set(PALETTES.map(function(family) { return family.id; }));
  const customPalettes = custom.map(function(family, index) {
    if (!isObject(family) || !Array.isArray(family.colors) || family.colors.length !== 3) throw new Error('Every color family needs three solid shades.');
    const id = typeof family.id === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(family.id) ? family.id : 'custom-' + (index + 1);
    if (paletteIds.has(id)) throw new Error('Two color families have the same identifier.');
    paletteIds.add(id);
    const colors = family.colors.map(normalizeColor);
    if (colors.includes('none')) throw new Error('Color family shades must be opaque hex colors.');
    return {id:id,name:safeText(family.name,'Custom ' + (index + 1),40),colors:colors};
  });
  return {
    schema:SCHEMA,version:VERSION,geometryId:GEOMETRY_ID,
    title:safeText(input.title,'Cardinal study',120),currentGlyph:currentGlyph,
    sequenceName:own(SEQUENCES,input.sequenceName) ? input.sequenceName : 'uppercase',
    documents:documents,customPalettes:customPalettes,
    settings:checkedSettings(input.settings, PALETTES.length + customPalettes.length),
    createdAt:validDate(input.createdAt),updatedAt:validDate(input.updatedAt)
  };
}

function createProject() {
  const timestamp = now();
  const documents = Object.create(null);
  documents.A = {glyph:'A',name:'A',fills:presetFills('reference'),touched:false,updatedAt:timestamp};
  return {
    schema:SCHEMA,version:VERSION,geometryId:GEOMETRY_ID,title:'Cardinal study',
    currentGlyph:'A',sequenceName:'uppercase',documents:documents,customPalettes:[],
    settings:Object.assign({},DEFAULT_SETTINGS),createdAt:timestamp,updatedAt:timestamp
  };
}

function snapshot(doc) { return {name:doc.name,fills:Object.assign(Object.create(null),doc.fills),touched:doc.touched}; }
function equalSnapshot(first, second) {
  return first.name === second.name && first.touched === second.touched && FACE_IDS.every(function(id) { return first.fills[id] === second.fills[id]; });
}

class Store {
  constructor(project) {
    this.project = project === undefined || project === null ? createProject() : validateProject(project);
    this._histories = new Map();
    this._pending = null;
  }
  get doc() { return this.project.documents[this.project.currentGlyph]; }
  get canUndo() { return this._history().past.length > 0; }
  get canRedo() { return this._history().future.length > 0; }
  get undoLabel() { const list = this._history().past; return list.length ? list[list.length - 1].label : ''; }
  get redoLabel() { const list = this._history().future; return list.length ? list[list.length - 1].label : ''; }
  _history(glyph) {
    const key = glyph === undefined ? this.project.currentGlyph : glyph;
    if (!this._histories.has(key)) this._histories.set(key,{past:[],future:[]});
    return this._histories.get(key);
  }
  _touch(doc) { const timestamp = now(); doc.updatedAt = timestamp; this.project.updatedAt = timestamp; }
  _push(glyph, before, label) {
    const history = this._history(glyph);
    history.past.push({snapshot:before,label:label || 'Paint'});
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
  }
  _edit(label, change) {
    const before = snapshot(this.doc);
    change(this.doc);
    const changed = before.name !== this.doc.name || FACE_IDS.some((id) => before.fills[id] !== this.doc.fills[id]);
    if (!changed) return false;
    this.doc.touched = true;
    this._touch(this.doc);
    if (!this._pending) this._push(this.project.currentGlyph,before,label);
    return true;
  }
  beginEdit(label) {
    if (this._pending) return false;
    this._pending = {glyph:this.project.currentGlyph,before:snapshot(this.doc),label:label || 'Paint'};
    return true;
  }
  endEdit() {
    if (!this._pending) return false;
    const pending = this._pending;
    this._pending = null;
    const doc = this.project.documents[pending.glyph];
    if (equalSnapshot(pending.before,snapshot(doc))) return false;
    this._push(pending.glyph,pending.before,pending.label);
    return true;
  }
  paint(id, color) {
    if (!FACE_ID_SET.has(id)) throw new Error('Unknown polygon.');
    const normalized = normalizeColor(color);
    return this._edit(normalized === 'none' ? 'Clear polygon' : 'Paint polygon',function(doc) { doc.fills[id] = normalized; });
  }
  setFills(map, label) {
    const colors = checkedFills(map,{partial:true});
    return this._edit(label || 'Change colors',function(doc) {
      Object.keys(colors).forEach(function(id) { doc.fills[id] = colors[id]; });
    });
  }
  undo() {
    this.endEdit();
    const history = this._history();
    if (!history.past.length) return false;
    const item = history.past.pop();
    history.future.push({snapshot:snapshot(this.doc),label:item.label});
    this.doc.name = item.snapshot.name;
    this.doc.fills = Object.assign(Object.create(null),item.snapshot.fills);
    this.doc.touched = item.snapshot.touched;
    this._touch(this.doc);
    return true;
  }
  redo() {
    this.endEdit();
    const history = this._history();
    if (!history.future.length) return false;
    const item = history.future.pop();
    history.past.push({snapshot:snapshot(this.doc),label:item.label});
    this.doc.name = item.snapshot.name;
    this.doc.fills = Object.assign(Object.create(null),item.snapshot.fills);
    this.doc.touched = item.snapshot.touched;
    this._touch(this.doc);
    return true;
  }
  selectGlyph(value, options) {
    this.endEdit();
    const glyph = validGlyph(value);
    const seed = options && options.seed || this.project.settings.seed || 'blank';
    if (!['blank','copy','reference'].includes(seed)) throw new Error('Unknown new-character starting point.');
    if (!own(this.project.documents,glyph)) {
      if (Object.keys(this.project.documents).length >= MAX_DOCUMENTS) throw new Error('This project already contains 256 character designs.');
      this.project.documents[glyph] = {
        glyph:glyph,name:glyph,
        fills:seed === 'copy' ? Object.assign(Object.create(null),this.doc.fills) : presetFills(seed),
        touched:false,updatedAt:now()
      };
    }
    this.project.currentGlyph = glyph;
    this.project.updatedAt = now();
    return this.doc;
  }
  stepGlyph(delta, options) {
    const sequence = SEQUENCES[this.project.sequenceName];
    const index = sequence.indexOf(this.project.currentGlyph);
    const direction = Number.isFinite(delta) ? Math.trunc(delta) : 1;
    const next = index === -1 ? (direction < 0 ? sequence.length - 1 : 0) : positiveModulo(index + direction,sequence.length);
    return this.selectGlyph(sequence[next],options);
  }
  setSequence(name, options) {
    if (!own(SEQUENCES,name)) throw new Error('Unknown character sequence.');
    this.project.sequenceName = name;
    this.project.updatedAt = now();
    if (!SEQUENCES[name].includes(this.project.currentGlyph)) this.selectGlyph(SEQUENCES[name][0],options);
    return this.doc;
  }
  rename(value) {
    const name = safeText(value,this.project.currentGlyph,120);
    return this._edit('Rename design',function(doc) { doc.name = name; });
  }
  setTitle(value) {
    const title = safeText(value,'Cardinal study',120);
    if (title === this.project.title) return false;
    this.project.title = title;
    this.project.updatedAt = now();
    return true;
  }
  reset(preset) { return this.setFills(presetFills(preset || 'reference'),'Apply ' + (preset || 'reference') + ' colors'); }
  addFamily(name, medium) {
    if (this.project.customPalettes.length >= MAX_CUSTOM_PALETTES) throw new Error('You can add up to eight custom color families per project.');
    const used = new Set(getPalettes(this.project).map(function(family) { return family.id; }));
    let suffix = 1;
    while (used.has('custom-' + suffix)) suffix += 1;
    const family = makeFamily(name,medium,'custom-' + suffix);
    this.project.customPalettes.push(family);
    this.project.updatedAt = now();
    return family;
  }
  toJSON() { this.endEdit(); return validateProject(this.project); }
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g,function(character) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character];
  });
}

/** @param {string} [value] */
function normalizeBackground(value) {
  return normalizeColor(value === undefined || value === 'white' ? '#FFFFFF' : value === 'transparent' ? 'none' : value);
}

/** @param {string} [value] */
function backgroundContrast(value) {
  const color = normalizeBackground(value);
  if (color === 'none') return '#172D38';
  const rgb = [1,3,5].map(function (offset) {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 0.179 ? '#FFFFFF' : '#172D38';
}

function svgString(fills, options) {
  const opts = options || {};
  const colors = fills === undefined ? presetFills('reference') : checkedFills(fills);
  const name = safeText(opts.name,'Cardinal polygon study',120);
  const label = opts.glyph === undefined ? '' : ' — ' + validGlyph(opts.glyph);
  const outlineOnly = opts.outlineOnly === true;
  const outline = outlineOnly || opts.outline === true;
  const outlineColor = normalizeColor(opts.outlineColor || backgroundContrast(opts.background));
  const outlineWidth = Number.isFinite(opts.outlineWidth) ? Math.min(Math.max(opts.outlineWidth,0.25),8) : 1.35;
  const background = normalizeBackground(opts.background);
  const displayed = Object.create(null);
  FACE_IDS.forEach(function(id) { displayed[id] = outlineOnly ? '#FFFFFF' : colors[id]; });
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1536" height="1024" viewBox="0 0 1536 1024" role="img" aria-labelledby="logo-title logo-description">',
    '<title id="logo-title">' + xmlEscape(name + label) + '</title>',
    '<desc id="logo-description">Twenty editable solid-color polygons, using the approved original geometry.</desc>',
    '<defs><clipPath id="logo-outline"><path fill-rule="evenodd" clip-rule="evenodd" d="' + SILHOUETTE + '"/></clipPath></defs>'
  ];
  if (background !== 'none') parts.push('<rect id="background" width="1536" height="1024" fill="' + background + '"/>');
  parts.push('<g id="logo" clip-path="url(#logo-outline)">');
  parts.push('<g id="seam-undercoats" aria-hidden="true" stroke-width="1.2" stroke-linejoin="round">');
  FACES.forEach(function(face) {
    const color = displayed[face.id];
    parts.push('<use xlink:href="#' + face.id + '" fill="' + color + '" stroke="' + color + '"/>');
  });
  parts.push('</g><g id="editable-faces">');
  FACES.forEach(function(face) {
    parts.push('<path id="' + face.id + '" fill="' + displayed[face.id] + '" d="' + face.d + '"/>');
  });
  parts.push('</g>');
  if (outline) {
    parts.push('<g id="polygon-outlines" fill="none" stroke="' + outlineColor + '" stroke-width="' + outlineWidth + '" stroke-linejoin="round" stroke-linecap="round" pointer-events="none">');
    FACES.forEach(function(face) {
      parts.push('<path d="' + face.d + '"/>');
    });
    parts.push('</g>');
  }
  parts.push('</g></svg>');
  return parts.join('\n');
}

function svgBlob(fills, options) { return new Blob([svgString(fills,options)],{type:'image/svg+xml;charset=utf-8'}); }

async function pngBlob(fills, options) {
  const opts = options || {};
  const scale = Number.isFinite(opts.scale) ? Math.min(Math.max(opts.scale,0.25),4) : 2;
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('PNG export requires a web browser.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = Math.round(HEIGHT * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create a PNG canvas.');
  const url = URL.createObjectURL(svgBlob(fills,opts));
  try {
    const img = new Image();
    await new Promise(function(resolve,reject) {
      img.onload = resolve;
      img.onerror = function() { reject(new Error('The SVG could not be rendered as a PNG.')); };
      img.src = url;
    });
    context.clearRect(0,0,canvas.width,canvas.height);
    context.drawImage(img,0,0,canvas.width,canvas.height);
    return await new Promise(function(resolve,reject) {
      canvas.toBlob(function(blob) { if (blob) resolve(blob); else reject(new Error('PNG export did not produce an image.')); },'image/png');
    });
  } finally { URL.revokeObjectURL(url); }
}

function filename(name, glyph, extension) {
  let stem = safeText(name,'cardinal-study',120).normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]/g,'-')
    .replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[. -]+|[. -]+$/g,'');
  stem = Array.from(stem).slice(0,90).join('') || 'cardinal-study';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(stem)) stem = 'study-' + stem;
  let suffix = '';
  if (glyph !== undefined && glyph !== null && glyph !== '') {
    const label = validGlyph(glyph);
    suffix = /^[A-Za-z0-9_-]{1,24}$/.test(label) ? label : 'glyph-' + Array.from(label).map(function(char) {
      return 'U' + char.codePointAt(0).toString(16).toUpperCase().padStart(4,'0');
    }).join('-');
  }
  const ext = String(extension || 'svg').toLowerCase().replace(/^\./,'');
  if (!['svg','png','json'].includes(ext)) throw new Error('Unsupported export file type.');
  // Keep the entire UTF-8 filename below common filesystem component limits.
  const byteBudget = 240 - (suffix ? suffix.length + 1 : 0) - ext.length - 1;
  let bytes = 0;
  stem = Array.from(stem).filter(function(character) {
    const point = character.codePointAt(0);
    bytes += point <= 0x7F ? 1 : point <= 0x7FF ? 2 : point <= 0xFFFF ? 3 : 4;
    return bytes <= byteBudget;
  }).join('').replace(/[. -]+$/g,'') || 'study';
  return stem + (suffix ? '-' + suffix : '') + '.' + ext;
}

function projectString(project) {
  const data = project instanceof Store ? project.toJSON() : validateProject(project);
  return JSON.stringify(data,null,2);
}

FACES.forEach(Object.freeze);
PALETTES.forEach(function(family) { Object.freeze(family.colors); Object.freeze(family); });
Object.keys(SEQUENCES).forEach(function(key) { Object.freeze(SEQUENCES[key]); });
Object.freeze(FACES); Object.freeze(PALETTES); Object.freeze(SEQUENCES); Object.freeze(SHADES);
const API = {
  CORNER_PARENTS:CORNER_PARENTS,
  FACES:FACES,SILHOUETTE:SILHOUETTE,GEOMETRY_ID:GEOMETRY_ID,SCHEMA:SCHEMA,VERSION:VERSION,
  WIDTH:WIDTH,HEIGHT:HEIGHT,VIEWBOX:VIEWBOX,PALETTES:PALETTES,SHADES:SHADES,SEQUENCES:SEQUENCES,
  normalizeBackground:normalizeBackground,backgroundContrast:backgroundContrast,
  PRESETS:PRESETS,DEFAULT_SETTINGS:DEFAULT_SETTINGS,Store:Store,createProject:createProject,
  getPalettes:getPalettes,makeFamily:makeFamily,normalizeColor:normalizeColor,presetFills:presetFills,
  validateProject:validateProject,svgString:svgString,svgBlob:svgBlob,pngBlob:pngBlob,
  filename:filename,projectString:projectString,xmlEscape:xmlEscape
};
global.PainterCore = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
