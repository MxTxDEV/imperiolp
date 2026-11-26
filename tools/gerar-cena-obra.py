# Gera public/img/obra.svg (cena animada de obra da tela de login). Rode: python3 tools/gerar-cena-obra.py
import random, math
random.seed(7)
W,H,G=1600,900,790   # tela, chão
GOLD='#d4a84b'; GOLD2='#f1cf84'
o=[]; css=[]
def A(s): o.append(s)

# ---------- defs ----------
A(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Obra em andamento: guindaste, prédio subindo, escavadeira e caminhão betoneira">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050a"/><stop offset=".45" stop-color="#0a1020"/><stop offset=".78" stop-color="#1b1a22"/><stop offset="1" stop-color="#4a3414"/></linearGradient>
<radialGradient id="sun" cx=".34" cy="1" r=".85"><stop offset="0" stop-color="#ffe3a1" stop-opacity=".85"/><stop offset=".22" stop-color="#d4a84b" stop-opacity=".45"/><stop offset="1" stop-color="#d4a84b" stop-opacity="0"/></radialGradient>
<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#121a2e"/><stop offset=".25" stop-color="#0a0f1b"/><stop offset="1" stop-color="#04060b"/></linearGradient>
<linearGradient id="haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4a84b" stop-opacity="0"/><stop offset="1" stop-color="#d4a84b" stop-opacity=".30"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GOLD2}"/><stop offset="1" stop-color="{GOLD}"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#27406e"/><stop offset=".55" stop-color="#14203c"/><stop offset="1" stop-color="#0c1428"/></linearGradient>
<linearGradient id="lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe3a1"/><stop offset="1" stop-color="#d4a84b"/></linearGradient>
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".34"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></linearGradient>
<linearGradient id="beamH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe9b8" stop-opacity=".45"/><stop offset="1" stop-color="#ffe9b8" stop-opacity="0"/></linearGradient>
<pattern id="lat" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M0 0L18 18M18 0L0 18" stroke="{GOLD}" stroke-opacity=".75" stroke-width="1.3" fill="none"/></pattern>
<pattern id="stripes" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="11" height="22" fill="{GOLD}"/><rect x="11" width="11" height="22" fill="#0a0f1b"/></pattern>
<filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur2"><feGaussianBlur stdDeviation="1.6"/></filter>
</defs>
<rect width="{W}" height="{G}" fill="url(#sky)"/>
<rect width="{W}" height="{G}" fill="url(#sun)"/>
<circle cx="540" cy="{G-30}" r="120" fill="#ffd98a" opacity=".38" filter="url(#blur6)"/><circle cx="540" cy="{G-30}" r="70" fill="#fff0c9" opacity=".5" filter="url(#blur2)"/>''')

# ---------- estrelas ----------
A('<g class="stars">')
for i in range(46):
    x=random.randint(10,W-10); y=random.randint(8,380); r=random.choice([.8,1,1.2,1.6]); c=random.choice(['s1','s2','s3'])
    A(f'<circle class="{c}" cx="{x}" cy="{y}" r="{r}" fill="#fff6dc"/>')
A('</g>')

# ---------- nuvens ----------
A('<g class="clouds" filter="url(#blur6)" fill="#f1cf84">')
for i,(x,y,w,d) in enumerate([(120,230,260,150),(760,170,320,190),(1250,290,280,170),(-60,330,240,210)]):
    A(f'<g class="cl" style="--d:{d}s;--s:{-i*37}s"><ellipse cx="{x}" cy="{y}" rx="{w/2}" ry="14" opacity=".07"/><ellipse cx="{x+60}" cy="{y-8}" rx="{w/3}" ry="12" opacity=".06"/></g>')
A('</g>')

# ---------- skylines ----------
def skyline(fill,hmin,hmax,wmin,wmax,seed,lights,stroke=None):
    random.seed(seed); x=-20; out=[f'<g fill="{fill}">']; wins=[]
    while x<W+20:
        w=random.randint(wmin,wmax); h=random.randint(hmin,hmax); y=G-h
        out.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h+2}"/>')
        if random.random()<.35: out.append(f'<rect x="{x+w//2-3}" y="{y-random.randint(10,26)}" width="6" height="30"/>')
        if lights:
            for wy in range(y+10,G-8,16):
                for wx in range(x+7,x+w-9,13):
                    if random.random()<lights: wins.append((wx,wy))
        x+=w+random.randint(2,10)
    out.append('</g>')
    if wins:
        out.append('<g>')
        for i,(wx,wy) in enumerate(wins):
            out.append(f'<rect class="w{i%4}" x="{wx}" y="{wy}" width="4" height="6" fill="{GOLD2}"/>')
        out.append('</g>')
    return ''.join(out)
A('<g opacity=".95">'+skyline('#0d1428',70,250,40,90,3,.16)+'</g>')
A(f'<rect y="{G-260}" width="{W}" height="260" fill="url(#haze)"/>')
A('<g>'+skyline('#0a1022',40,170,50,110,11,.12)+'</g>')

# ---------- helpers de guindaste ----------
def crane(x,sc,op,dur,delay,tag,base=G,top=170,jibL=470,cj=130):
    mast_h=base-top
    s=[f'<g transform="translate({x},{base}) scale({sc})" opacity="{op}">']
    # mastro (coordenadas locais: chão em y=0, mastro sobe)
    s.append(f'<rect x="-11" y="{-mast_h}" width="22" height="{mast_h}" fill="#0d1429"/><rect x="-11" y="{-mast_h}" width="22" height="{mast_h}" fill="url(#lat)"/><rect x="-11" y="{-mast_h}" width="3" height="{mast_h}" fill="{GOLD}" opacity=".6"/><rect x="8" y="{-mast_h}" width="3" height="{mast_h}" fill="{GOLD}" opacity=".6"/>')
    s.append(f'<rect x="-22" y="-14" width="44" height="14" fill="#0d1429" stroke="{GOLD}" stroke-opacity=".4"/>')
    ty=-mast_h
    # lança e contra-lança
    s.append(f'<rect x="{-jibL}" y="{ty-10}" width="{jibL}" height="18" fill="#0d1429"/><rect x="{-jibL}" y="{ty-10}" width="{jibL}" height="18" fill="url(#lat)"/><rect x="{-jibL}" y="{ty-10}" width="{jibL}" height="2.4" fill="{GOLD}" opacity=".7"/><rect x="{-jibL}" y="{ty+6}" width="{jibL}" height="2" fill="{GOLD}" opacity=".5"/>')
    s.append(f'<rect x="0" y="{ty-8}" width="{cj}" height="14" fill="#0d1429"/><rect x="0" y="{ty-8}" width="{cj}" height="14" fill="url(#lat)"/>')
    s.append(f'<rect x="{cj-46}" y="{ty-2}" width="46" height="34" rx="3" fill="#121c38" stroke="{GOLD}" stroke-opacity=".5"/>')
    # torre de cabo (A)
    s.append(f'<path d="M-14 {ty-10} L0 {ty-78} L14 {ty-10}Z" fill="#0d1429" stroke="{GOLD}" stroke-opacity=".6"/>')
    s.append(f'<path d="M0 {ty-78} L{-jibL} {ty-10} M0 {ty-78} L{cj} {ty-8}" stroke="{GOLD2}" stroke-opacity=".55" stroke-width="1.2" fill="none"/>')
    # cabine
    s.append(f'<rect x="12" y="{ty+6}" width="30" height="24" rx="3" fill="#0e1630" stroke="{GOLD}" stroke-opacity=".6"/><rect class="cab" x="16" y="{ty+10}" width="14" height="12" rx="1.5" fill="url(#lit)"/>')
    s.append(f'<circle class="blink" cx="0" cy="{ty-82}" r="3.4" fill="#ff5d6c"/><circle class="blink" cx="0" cy="{ty-82}" r="9" fill="#ff5d6c" opacity=".25" filter="url(#blur2)"/>')
    # carrinho + cabo + carga
    L=300
    s.append(f'<g class="trolley" style="--a:{-jibL+60}px;--b:{-60}px;--d:{dur}s;--s:{delay}s;--y:{ty+8}px">')
    s.append(f'<rect x="-11" y="-3" width="22" height="9" rx="2" fill="#0d1429" stroke="{GOLD}" stroke-opacity=".8"/>')
    s.append(f'<g class="sway" style="--d:{dur*.31:.1f}s"><g class="hoist" style="--d:{dur*.62:.1f}s;--s:{delay}s"><rect x="-.8" y="6" width="1.6" height="{L}" fill="{GOLD2}" opacity=".8"/></g>')
    s.append(f'<g class="load" style="--d:{dur*.62:.1f}s;--s:{delay}s;--L:{L}px"><g transform="translate(0,{6+L})">')
    s.append(f'<path d="M0 0L-30 12M0 0L30 12" stroke="{GOLD2}" stroke-opacity=".9" fill="none"/><rect x="-5" y="-6" width="10" height="9" rx="2" fill="url(#gold)"/>')
    s.append(f'<rect x="-34" y="12" width="68" height="7" fill="url(#gold)"/><rect x="-34" y="19" width="68" height="3" fill="#7a5a1a"/>')
    s.append('</g></g></g></g>')
    s.append('</g>')
    return ''.join(s)

# crane distante (direita) e a principal depois do prédio
A(crane(1320,.55,.55,38,-6,'b',top=250,jibL=380,cj=110))

# ---------- prédio em construção ----------
BX0,BW,FH,NF=150,372,52,10
cols=[BX0+6+i*((BW-12-16)/3) for i in range(4)]
A('<g class="site">')
A(f'<rect x="{BX0-40}" y="{G-6}" width="{BW+110}" height="8" fill="#0a0f1b"/>')   # fundação
CYC=34; T0=3.2; STEP=2.15
floors=[]
for i in range(NF):
    y=G-(i+1)*FH
    t=T0+i*STEP
    p0=t/CYC*100; p1=(t+1.2)/CYC*100; pg=(t+2.6)/CYC*100
    pend=(CYC-5)/CYC*100; pfade=(CYC-2.2)/CYC*100
    g=[f'<g class="fl" style="animation-name:f{i}">']
    # painéis de vidro (aparecem depois)
    g.append(f'<g class="gl" style="animation-name:g{i}">')
    for k in range(3):
        px=cols[k]+16; pw=cols[k+1]-cols[k]-16
        lit = (i*3+k)%4==1
        g.append(f'<rect x="{px:.1f}" y="{y+12}" width="{pw:.1f}" height="{FH-12-1}" fill="url(#glass)"/>')
        if lit: g.append(f'<rect class="lw w{(i+k)%4}" x="{px+4:.1f}" y="{y+16}" width="{pw-8:.1f}" height="{FH-12-9}" fill="url(#lit)" opacity=".85"/>')
        g.append(f'<path d="M{px+6:.1f} {y+FH-2} L{px+pw*.55:.1f} {y+13}" stroke="#ffffff" stroke-opacity=".08" stroke-width="5"/>')
    g.append('</g>')
    # colunas e laje
    for cx in cols: g.append(f'<rect x="{cx:.1f}" y="{y+10}" width="16" height="{FH-10}" fill="#16203d"/><rect x="{cx:.1f}" y="{y+10}" width="2.4" height="{FH-10}" fill="{GOLD}" opacity=".45"/>')
    g.append(f'<rect x="{BX0-6}" y="{y}" width="{BW+12}" height="11" fill="#1a2547"/><rect x="{BX0-6}" y="{y}" width="{BW+12}" height="2.4" fill="{GOLD2}" opacity=".75"/>')
    # andaime lateral
    sx=BX0+BW+8
    g.append(f'<path d="M{sx} {y+11}V{y+FH} M{sx+14} {y+11}V{y+FH} M{sx} {y+11}L{sx+14} {y+FH} M{sx+14} {y+11}L{sx} {y+FH}" stroke="{GOLD}" stroke-opacity=".38" stroke-width="1.2" fill="none"/>')
    g.append('</g>')
    # vergalhões no topo (somem quando o próximo andar sobe)
    rb=[f'<g class="rb" style="animation-name:r{i}">']
    for cx in cols: rb.append(f'<path d="M{cx+3:.1f} {y}v-26M{cx+8:.1f} {y}v-30M{cx+13:.1f} {y}v-26" stroke="{GOLD2}" stroke-opacity=".75" stroke-width="1.5"/>')
    rb.append(f'<path d="M{cols[0]:.1f} {y-14}H{cols[3]+16:.1f}" stroke="{GOLD}" stroke-opacity=".5" stroke-width="1"/>')
    rb.append('</g>')
    A(''.join(g)); A(''.join(rb))
    # keyframes
    nxt=(T0+(i+1)*STEP)/CYC*100 if i<NF-1 else (CYC-5)/CYC*100
    css.append(f'@keyframes f{i}{{0%,{p0:.2f}%{{opacity:0;transform:translateY(26px)}}{p1:.2f}%,{pend:.2f}%{{opacity:1;transform:none}}{pfade:.2f}%,100%{{opacity:0;transform:none}}}}')
    css.append(f'@keyframes g{i}{{0%,{p1:.2f}%{{opacity:0}}{pg:.2f}%,{pend:.2f}%{{opacity:1}}{pfade:.2f}%,100%{{opacity:0}}}}')
    css.append(f'@keyframes r{i}{{0%,{p0:.2f}%{{opacity:0}}{p1:.2f}%,{nxt:.2f}%{{opacity:1}}{min(nxt+1.5,99):.2f}%,100%{{opacity:0}}}}')
# soldador no último piso? faíscas no topo
A('</g>')

# ---------- guindaste principal (esquerda do centro) ----------
A(crane(570,1,1,30,-3,'a',top=170,jibL=520,cj=96))

# ---------- chão ----------
A(f'<rect y="{G}" width="{W}" height="{H-G}" fill="url(#ground)"/><rect y="{G}" width="{W}" height="2" fill="{GOLD}" opacity=".45"/>')
# barreiras com listras
for i in range(9):
    x=40+i*54
    A(f'<g transform="translate({x},{G+6})"><path d="M0 18 L6 0 H40 L46 18Z" fill="url(#stripes)" opacity=".85"/><rect y="18" width="46" height="3" fill="#05070c"/></g>')
# torres de luz
for lx,ls in [(90,0),(1060,1.7)]:
    A(f'<g transform="translate({lx},{G})"><polygon class="cone" style="--s:{ls}s" points="-6,-120 6,-120 90,2 -90,2" fill="url(#beam)"/><rect x="-2.5" y="-120" width="5" height="120" fill="#0d1429"/><rect x="-16" y="-128" width="32" height="9" rx="2" fill="#0d1429" stroke="{GOLD}" stroke-opacity=".7"/><rect class="lamp" style="--s:{ls}s" x="-13" y="-126" width="26" height="4" fill="{GOLD2}"/></g>')
# pilhas de material (direita)
def tijolos(x,y):
    s=f'<g transform="translate({x},{y})">'
    for r in range(5):
        for c in range(7-(r%2)):
            s+=f'<rect x="{c*13+(r%2)*6}" y="{-r*7-7}" width="12" height="6" fill="#8a4a2b" opacity=".8"/>'
    return s+'</g>'
A(tijolos(1440,G+14))
A(f'<g transform="translate(1520,{G+16})" fill="#1a2445" stroke="{GOLD}" stroke-opacity=".5"><circle r="9" cx="0" cy="-9"/><circle r="9" cx="18" cy="-9"/><circle r="9" cx="36" cy="-9"/><circle r="9" cx="9" cy="-25"/><circle r="9" cx="27" cy="-25"/></g>')
A(f'<g transform="translate(1390,{G+16})"><rect width="34" height="13" rx="2" fill="#c9bfa3" opacity=".8"/><rect y="-13" width="34" height="13" rx="2" fill="#d8cfb4" opacity=".8"/></g>')

# ---------- escavadeira ----------
EX,EY=1190,G+22
A(f'<g transform="translate({EX},{EY})">')
A(f'<rect x="-6" y="-17" width="118" height="17" rx="8" fill="#0a0f1b" stroke="{GOLD}" stroke-opacity=".6"/>')
A('<g class="trk"><circle cx="12" cy="-8" r="5" fill="#1b2748"/><circle cx="55" cy="-8" r="5" fill="#1b2748"/><circle cx="98" cy="-8" r="5" fill="#1b2748"/></g>')
A(f'<rect x="6" y="-30" width="92" height="14" rx="3" fill="#121c38" stroke="{GOLD}" stroke-opacity=".5"/>')
A(f'<g class="cabg"><path d="M16 -30 V-58 Q16 -64 22 -64 H56 L72 -44 V-30Z" fill="#16203d" stroke="{GOLD}" stroke-opacity=".7"/><path d="M26 -58 H52 L63 -44 H26Z" fill="url(#lit)" opacity=".8"/><rect x="72" y="-62" width="22" height="32" rx="3" fill="#0e1630" stroke="{GOLD}" stroke-opacity=".45"/></g>')
A(f'<g transform="translate(70,-46)"><g class="boom"><path d="M-5 -7 L96 -34 L100 -26 L-3 6Z" fill="#17234a" stroke="{GOLD2}" stroke-opacity=".8"/><g transform="translate(96,-30)"><g class="stick"><path d="M-3 -5 L58 28 L52 36 L-8 5Z" fill="#17234a" stroke="{GOLD2}" stroke-opacity=".8"/><g transform="translate(55,32)"><g class="bucket"><path d="M-10 -2 L16 2 Q22 18 6 24 L-12 14Z" fill="url(#gold)" stroke="#7a5a1a"/></g></g></g></g></g></g>')
A('</g>')
A(f'<g transform="translate({EX+250},{G+20})">'+''.join(f'<ellipse class="dust" style="--s:{i*1.1}s" cx="{i*9}" cy="-6" rx="10" ry="6" fill="#d8cfb4"/>' for i in range(4))+'</g>')

# ---------- operários ----------
def operario(x,y,dist,dur,delay,sc=1):
    return (f'<g transform="translate({x},{y}) scale({sc})"><g class="walk" style="--w:{dist}px;--d:{dur}s;--s:{delay}s">'
      f'<g class="body"><ellipse cx="0" cy="-34" rx="6.5" ry="3.6" fill="url(#gold)"/><circle cx="0" cy="-30" r="5" fill="#16203d"/>'
      f'<rect x="-6" y="-25" width="12" height="17" rx="3" fill="#16203d" stroke="{GOLD}" stroke-opacity=".7"/><rect x="-6" y="-17" width="12" height="2.4" fill="{GOLD2}" opacity=".85"/>'
      f'<g transform="translate(0,-8)"><path class="leg l1" d="M-1.5 0 V12" stroke="#16203d" stroke-width="4.2" stroke-linecap="round"/><path class="leg l2" d="M1.5 0 V12" stroke="#0e1630" stroke-width="4.2" stroke-linecap="round"/></g>'
      f'</g></g></g>')
A(operario(300,G+30,160,16,0,1.15)); A(operario(760,G+40,110,12,-5,1.25)); A(operario(1060,G+34,140,18,-9,1.1))
# soldador com faíscas
A(f'<g transform="translate(560,{G+44})"><rect x="-26" y="-6" width="64" height="6" fill="#0e1630" stroke="{GOLD}" stroke-opacity=".6"/><circle cx="-8" cy="-26" r="5" fill="#16203d"/><ellipse cx="-8" cy="-30" rx="6.5" ry="3.6" fill="url(#gold)"/><path d="M-8 -21 L-14 -8 M-8 -21 L0 -10" stroke="#16203d" stroke-width="6" stroke-linecap="round"/><circle class="arc" cx="4" cy="-10" r="3" fill="#fff" />')
for i in range(7):
    ang=random.uniform(-160,-20); d=random.uniform(14,34)
    A(f'<circle class="sp" style="--dx:{math.cos(math.radians(ang))*d:.1f}px;--dy:{math.sin(math.radians(ang))*d:.1f}px;--s:{i*.13:.2f}s" cx="4" cy="-10" r="1.5" fill="#ffd36a"/>')
A('</g>')

# ---------- caminhão betoneira ----------
def wheel(cx): return f'<g transform="translate({cx},-3)"><circle r="17" fill="#060912" stroke="{GOLD}" stroke-opacity=".55"/><g class="spin"><circle r="9" fill="#1b2748"/><path d="M0 -9V9M-9 0H9" stroke="{GOLD}" stroke-opacity=".7" stroke-width="2"/></g></g>'
A(f'<g transform="translate(0,{G+52})"><g class="truck">')
A(f'<polygon class="hl" points="250,-22 560,-60 560,12 250,-6" fill="url(#beamH)"/>')
A(f'<rect x="0" y="-26" width="236" height="14" rx="3" fill="#0a0f1b" stroke="{GOLD}" stroke-opacity=".6"/>')
A(f'<path d="M168 -26 V-52 Q168 -58 176 -58 H206 L232 -34 V-26Z" fill="#16203d" stroke="{GOLD}" stroke-opacity=".8"/><path d="M180 -52 H204 L222 -34 H180Z" fill="url(#lit)" opacity=".85"/><rect x="232" y="-22" width="10" height="8" fill="#ffe9b8"/>')
A('<clipPath id="drum"><path d="M10 -30 L92 -86 Q132 -92 150 -74 L158 -32 Q156 -24 140 -24 L26 -24Z"/></clipPath>')
A(f'<path d="M10 -30 L92 -86 Q132 -92 150 -74 L158 -32 Q156 -24 140 -24 L26 -24Z" fill="#c5b88f" opacity=".95" stroke="{GOLD}"/><g clip-path="url(#drum)"><g class="stripe">'+''.join(f'<path d="M{-80+i*34} -100 L{-40+i*34} 0" stroke="#8b7a45" stroke-width="9" opacity=".75"/>' for i in range(9))+'</g></g>')
A(f'<path d="M130 -30 V-18" stroke="{GOLD}" stroke-width="3"/>')
A(wheel(52)+wheel(104)+wheel(205))
A('</g></g>')

# vinheta de brilho e partículas de poeira dourada
A('<g class="motes" fill="#f1cf84">'+''.join(f'<circle class="mote" style="--x:{random.randint(0,W)}px;--y:{random.randint(260,780)}px;--d:{random.randint(14,30)}s;--s:{-random.randint(0,20)}s" r="{random.choice([1,1.3,1.8])}" opacity=".5"/>' for _ in range(26))+'</g>')
A('</svg>')

# ---------- CSS ----------
base='''
.s1{animation:tw 3.2s ease-in-out infinite}.s2{animation:tw 4.7s ease-in-out -1.5s infinite}.s3{animation:tw 6.1s ease-in-out -3s infinite}
@keyframes tw{0%,100%{opacity:.25}50%{opacity:1}}
.w0{animation:wk 5.5s ease-in-out infinite}.w1{animation:wk 7.3s ease-in-out -2s infinite}.w2{animation:wk 9s ease-in-out -4s infinite}.w3{animation:wk 6.4s ease-in-out -1s infinite}
@keyframes wk{0%,100%{opacity:.12}50%{opacity:.85}}
.cl{animation:drift var(--d) linear var(--s) infinite}
@keyframes drift{from{transform:translateX(-420px)}to{transform:translateX(1900px)}}
.fl,.gl,.rb{opacity:0;animation-delay:-11s;animation-duration:34s;animation-iteration-count:infinite;animation-timing-function:cubic-bezier(.2,.8,.2,1);transform-box:view-box}
.trolley{animation:trolley var(--d) ease-in-out var(--s) infinite;transform:translate(var(--a),var(--y))}
@keyframes trolley{0%,100%{transform:translate(var(--a),var(--y))}50%{transform:translate(var(--b),var(--y))}}
.sway{transform-origin:0 6px;animation:sway var(--d) ease-in-out infinite alternate}
@keyframes sway{from{transform:rotate(-1.6deg)}to{transform:rotate(1.6deg)}}
.hoist{transform-origin:0 6px;animation:hoist var(--d) ease-in-out var(--s) infinite}
@keyframes hoist{0%,100%{transform:scaleY(.42)}50%{transform:scaleY(1)}}
.load{animation:load var(--d) ease-in-out var(--s) infinite}
@keyframes load{0%,100%{transform:translateY(calc(var(--L)*-.58))}50%{transform:translateY(0)}}
.blink{animation:bl 1.6s steps(1) infinite}@keyframes bl{0%{opacity:1}50%{opacity:.08}}
.cab{animation:wk 6s ease-in-out infinite}
.cone{animation:fk 5s ease-in-out var(--s) infinite}.lamp{animation:fk 5s ease-in-out var(--s) infinite}
@keyframes fk{0%,100%{opacity:1}47%{opacity:.82}50%{opacity:.5}53%{opacity:.9}}
.boom{transform-origin:-5px 0;animation:boom 9s ease-in-out infinite}
@keyframes boom{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(7deg)}}
.stick{transform-origin:0 0;animation:stick 9s ease-in-out infinite}
@keyframes stick{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(18deg)}}
.bucket{transform-origin:0 0;animation:buck 9s ease-in-out infinite}
@keyframes buck{0%,100%{transform:rotate(24deg)}50%{transform:rotate(-34deg)}}
.cabg{animation:cabg 9s ease-in-out infinite;transform-origin:50px -30px}@keyframes cabg{0%,100%{transform:rotate(0)}50%{transform:rotate(-.6deg)}}
.dust{animation:dust 4.4s ease-out var(--s) infinite;transform-box:fill-box;transform-origin:center;opacity:0}
@keyframes dust{0%{opacity:0;transform:translate(0,0) scale(.4)}25%{opacity:.18}100%{opacity:0;transform:translate(40px,-34px) scale(2.2)}}
.walk{animation:walk var(--d) linear var(--s) infinite}
@keyframes walk{0%{transform:translateX(0) scaleX(1)}47%{transform:translateX(var(--w)) scaleX(1)}50%{transform:translateX(var(--w)) scaleX(-1)}97%{transform:translateX(0) scaleX(-1)}100%{transform:translateX(0) scaleX(1)}}
.leg{transform-origin:0 0;animation:leg .8s ease-in-out infinite alternate}.l2{animation-direction:alternate-reverse}
@keyframes leg{from{transform:rotate(-24deg)}to{transform:rotate(24deg)}}
.body{animation:bob .4s ease-in-out infinite alternate}@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-1.2px)}}
.arc{animation:arc .12s steps(1) infinite}@keyframes arc{0%{opacity:1;r:3}50%{opacity:.4;r:1.6}}
.sp{animation:sp .9s ease-out var(--s) infinite;opacity:0}
@keyframes sp{0%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(var(--dx),calc(var(--dy) + 22px))}}
.truck{animation:drive 52s linear -17s infinite}
@keyframes drive{from{transform:translateX(-640px)}to{transform:translateX(1900px)}}
.spin{animation:spin 1.7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.stripe{animation:stripe 2.6s linear infinite}@keyframes stripe{to{transform:translateX(34px)}}
.hl{animation:fk 3s ease-in-out infinite}
.mote{animation:mote var(--d) linear var(--s) infinite;transform:translate(var(--x),var(--y))}
@keyframes mote{0%{transform:translate(var(--x),var(--y));opacity:0}15%{opacity:.55}85%{opacity:.4}100%{transform:translate(calc(var(--x) + 90px),calc(var(--y) - 220px));opacity:0}}
@media (prefers-reduced-motion:reduce){svg *{animation:none!important}.fl,.gl{opacity:1!important}.rb,.dust,.sp{opacity:0!important}.truck{transform:translateX(700px)}.trolley{transform:translate(-300px,var(--y))}}
'''
svg=''.join(o).replace('<defs>','<style>'+base+''.join(css)+'</style><defs>',1)
open(__import__('os').path.join(__import__('os').path.dirname(__file__),'..','public','img','obra.svg'),'w').write(svg)
print(len(svg)//1024,'KB')
