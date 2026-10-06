"""Static force-directed layout sketch and semantic zoom study; Python + Pillow."""
from pathlib import Path
from runpy import run_path

helpers = run_path(str(Path(__file__).with_name('render-variants.py')))
Drawing, shell = helpers['Drawing'], helpers['shell']


def circle(c,x,y,r,fill='#ffffff',stroke='#777777',width=1):
    c.d.ellipse((x-r,y-r,x+r,y+r),fill=fill,outline=stroke,width=width)
    c.svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')


def edge(c,x1,y1,x2,y2,kind='suggestion',color='#999999'):
    if kind == 'topic':
        # Dotted topic membership, separate from destination recommendations.
        length=((x2-x1)**2+(y2-y1)**2)**.5
        for i in range(int(length/9)):
            t=i*9/length
            circle(c,x1+t*(x2-x1),y1+t*(y2-y1),1,color,color)
    else:
        c.line(x1,y1,x2,y2,dash=kind=='suggestion',color=color,width=2)


def hub(c,x,y,r,label,kind):
    circle(c,x,y,r,'#e7e7e7','#555555',2)
    c.text(x-r+15,y-24,label,14,True)
    c.text(x-r+15,y+r+10,kind,11,True)


def graph():
    c=shell('C / Force-directed bookmark graph','One bookmark bubble can belong to several hubs. Zoom controls how much detail appears.','Static layout study / hub positions, force strength and zoom thresholds are provisional.')
    c.button(22,330,50,'Lens')
    c.button(98,165,238,'Topic lens: proposed')
    c.button(348,165,230,'Filter: paired alternatives / 4')
    c.button(590,165,198,'Links: selected neighborhood')
    # Exactly four representative bookmarks from the previous paired-alternatives sketch.
    t=(304,339); i=(735,338); p=(670,642); b=(505,450); b2=(491,580)
    t2=(278,702); i2=(861,536); p2=(853,742); b3=(545,718); b4=(633,781)
    for bm in [b,b2]:
        for center,kind in [(t,'topic'),(i,'suggestion'),(p,'suggestion')]:
            edge(c,*bm,*center,kind,'#444444' if bm==b else '#c8c8c8')
    for bm in [b3,b4]:
        for center,kind in [(t2,'topic'),(i2,'suggestion'),(p2,'suggestion')]:
            edge(c,*bm,*center,kind,'#cccccc')
    hub(c,*t,75,'Customer\ndiscovery','TOPIC / PROPOSED')
    hub(c,*i,74,'#133\nLean Canvas','EXISTING ISSUE / OPEN')
    hub(c,*p,84,'Customer discovery\nand demand\nvalidation','PROPOSAL / NOT CREATED')
    hub(c,*t2,65,'Product\npositioning','TOPIC / PROPOSED')
    hub(c,*i2,67,'#136\nPDD','EXISTING ISSUE / OPEN')
    hub(c,*p2,69,'Positioning &\ndifferentiation','PROPOSAL / NOT CREATED')
    circle(c,*b,48,'#ffffff','#333333',3)
    circle(c,*b,42,'#dcdcdc','#333333',1)
    c.text(478,432,'App market\nresearch',12,True)
    c.box(403,380,198,30,'#ffffff','#aaaaaa')
    c.text(413,388,'Selected / unreviewed',12,True)
    circle(c,*b2,31,'#ffffff')
    c.text(458,617,'External validation',12)
    circle(c,*b3,30,'#ffffff')
    c.text(407,757,'Making an idea easier to explain',12)
    circle(c,*b4,24,'#ffffff')
    c.text(563,817,"Eightify differentiation",12)
    c.text(116,229,'4 matching bookmark bubbles / 148 total',12,color='#666666')
    c.text(116,486,'Selected bubble links to:\n1 topic + 1 existing issue\n+ 1 new proposal',13)
    c.text(116,576,'Position alone changes\nno membership or decision.',12,color='#666666')
    edge(c,109,858,151,858,'topic','#555555')
    c.text(162,850,'Topic',11)
    edge(c,234,858,276,858,'suggestion','#555555')
    c.text(287,850,'Suggested home',11)
    c.line(411,858,453,858,width=2,color='#555555')
    c.text(464,850,'Selected target (none yet)',11)
    c.button(704,838,226,'-   Zoom 80%   +   Fit')
    c.box(966,164,442,702)
    c.text(984,182,'Selected bookmark / saved',16,True)
    c.text(984,226,'App market and\ncompetitor research',21,True)
    c.button(984,289,406,'Open source')
    c.text(984,342,'TOPIC RELATIONSHIP / PROPOSED',11,True)
    c.text(984,368,'Customer discovery and demand validation',14)
    c.button(984,403,406,'Approve or revise topic')
    c.text(984,453,'DESTINATION RELATIONSHIPS / SUGGESTED',11,True)
    c.text(984,480,'Existing: #133 Lean Canvas / open\nProposal: Customer discovery and\ndemand validation / not created',14)
    c.button(984,554,406,'Compare rationale / select targets')
    c.button(984,603,406,'Disposition: undecided')
    c.text(984,659,'Chosen targets: 0\nCompletion: pending\nTopic and destination links are separate.',13)
    c.button(984,737,406,'Original notes / observations / history')
    c.button(984,809,195,'Previous')
    c.button(1191,809,199,'Next')
    c.save('force-directed-map')


def zoom():
    c=Drawing()
    c.text(24,23,'C / Semantic zoom: the same bookmark at three scales',25,True)
    c.text(24,66,'Zoom changes displayed detail. Identity, relationships and processing state stay the same.',15,color='#666666')
    for x,title in [(24,'Overview'),(496,'Middle zoom'),(968,'Close zoom')]:
        c.box(x,124,448,650,'#f5f5f5')
        c.text(x+20,147,title,21,True)
    # The same three connected hubs and one canonical bookmark in every panel.
    for x,r in [(24,10),(496,34),(968,70)]:
        bx,by=x+232,446
        centers=[(x+90,298),(x+345,307),(x+286,646)]
        for center,kind in zip(centers,['topic','suggestion','suggestion']):
            edge(c,bx,by,*center,kind,'#999999')
        for hx,hy in centers:
            circle(c,hx,hy,25,'#dedede','#555555',2)
        c.text(x+25,227,'TOPIC\nCustomer discovery',12,True)
        c.text(x+262,227,'EXISTING ISSUE\n#133 Lean Canvas',12,True)
        c.text(x+180,693,'PROPOSAL\nDemand validation',12,True)
        circle(c,bx,by,r+5,'#ffffff','#333333',2)
        circle(c,bx,by,r,'#e0e0e0','#555555')
    c.text(45,188,'Small bubbles; hub names stay readable.',12)
    c.text(521,188,'Short bookmark titles appear.',12)
    c.text(993,188,'Title, domain and review state appear.',12)
    c.text(100,478,'App market research',12,True)
    c.text(58,510,'Selected label remains visible\neven when other titles are hidden.',13)
    c.text(585,498,'App market research',14,True)
    c.text(1150,397,'App market\n& competitor\nresearch',14,True)
    c.text(1150,468,'substack.com\nUnreviewed',12)
    c.text(24,809,'At every scale: click or keyboard-select the bubble to open its full inspector.',17,True)
    c.text(24,852,'Bubble geometry stays stable as detail changes. Zoom never chooses a topic or destination.',14)
    c.text(24,901,'Illustrative scales / exact thresholds, label collision handling and bubble sizes remain open for review.',13,color='#666666')
    c.save('force-directed-zoom')


if __name__ == '__main__':
    graph()
    zoom()
