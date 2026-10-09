"""Editable low-fidelity drawings. Run with Python + Pillow; outputs PNG and SVG."""
from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
FONT = Path('/System/Library/Fonts/Supplemental')

class Drawing:
    def __init__(self):
        self.im = Image.new('RGB', (1440, 960), 'white')
        self.d = ImageDraw.Draw(self.im)
        self.svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="960" viewBox="0 0 1440 960">', '<rect width="1440" height="960" fill="white"/>']

    def box(self, x, y, w, h, fill='#ffffff', stroke='#b8b8b8', thick=1, dash=False):
        self.d.rectangle((x,y,x+w,y+h), fill=fill, outline=stroke, width=thick)
        dashed = ' stroke-dasharray="5 5"' if dash else ''
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{thick}"{dashed}/>')

    def text(self, x, y, value, size=14, bold=False, color='#333333'):
        font = ImageFont.truetype(str(FONT / ('Arial Bold.ttf' if bold else 'Arial.ttf')),size)
        for i, line in enumerate(value.split('\n')):
            yy = y+i*(size+6)
            self.d.text((x,yy),line,font=font,fill=color)
            self.svg.append(f'<text x="{x}" y="{yy+size}" font-family="Arial, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(line)}</text>')

    def line(self, x1,y1,x2,y2,dash=False,color='#888888',width=1):
        if dash:
            n = max(1,int(((x2-x1)**2+(y2-y1)**2)**.5/10))
            for i in range(0,n,2):
                a,b=i/n,min(i+1,n)/n
                self.d.line((x1+(x2-x1)*a,y1+(y2-y1)*a,x1+(x2-x1)*b,y1+(y2-y1)*b),fill=color,width=width)
        else:
            self.d.line((x1,y1,x2,y2),fill=color,width=width)
        dd=' stroke-dasharray="5 5"' if dash else ''
        self.svg.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"{dd}/>')

    def button(self,x,y,w,label,active=False):
        self.box(x,y,w,32,'#e4e4e4' if active else '#ffffff','#333333' if active else '#aaaaaa')
        self.text(x+10,y+8,label,12,bold=active)

    def card(self,x,y,w,title,meta,selected=False,h=86):
        self.box(x,y,w,h,'#e9e9e9' if selected else '#ffffff','#333333' if selected else '#aaaaaa',2 if selected else 1)
        self.text(x+12,y+12,title,14,True)
        self.text(x+12,y+h-23,meta,11,color='#666666')

    def save(self,name):
        self.im.save(ROOT / f'{name}.png')
        (ROOT / f'{name}.svg').write_text('\n'.join(self.svg+['</svg>']))

def shell(title,subtitle,footer):
    c=Drawing()
    c.text(24,18,title,26,True)
    c.text(24,57,subtitle,15,color='#666666')
    c.text(1165,25,'LOW FIDELITY / REVIEW ONLY',11,color='#777777')
    c.box(14,90,1412,800,'#f5f5f5','#444444')
    c.box(14,90,1412,56)
    c.text(34,108,'Bookmark Router',19,True)
    c.text(231,113,'148 bookmarks / 29 topics',12,color='#666666')
    c.button(615,102,355,'Search bookmarks, notes or issue #')
    c.text(992,113,'0 / 148 complete',12)
    c.button(1128,102,116,'Progress')
    c.button(1256,102,148,'Actions / boards')
    c.box(14,146,66,744,'#eeeeee')
    for i,label in enumerate(['Select','Pan','Filters','Group','Layout','Actions']):
        c.button(22,168+i*54,50,label,i==0)
    c.text(24,855,'Help',11)
    c.text(24,917,footer,14)
    return c

def map_controls(c,x,y):
    c.button(x,y,138,'-   80%   +   Fit')
    c.box(x+150,y-34,104,66,'#eeeeee')
    c.box(x+161,y-24,22,16,'#cccccc')
    c.box(x+188,y-16,22,16,'#cccccc')
    c.box(x+215,y-8,22,16,'#cccccc')
    c.text(x+162,y+15,'Overview',10)

def legend(c,x,y):
    c.line(x,y+6,x+35,y+6,True)
    c.text(x+43,y,'Suggested',11)
    c.line(x+130,y+6,x+165,y+6,width=2)
    c.text(x+173,y,'Selected (placement shown separately)',11)

def variant1():
    c=shell('B1 / Overview + persistent queue','Keep the map broad; use a visible queue to navigate the full import.','Review choice: keep queues visible, or reclaim this space for a larger map?')
    c.box(80,146,218,744,'#ffffff')
    c.text(96,166,'Review queues',17,True)
    c.button(96,203,185,'Unreviewed       148',True)
    c.text(106,251,'Category corrections\nExisting suggestions\nNew-issue seeds\nLink follow-up\nDuplicates\nDeferred\nCompleted',14)
    c.line(96,413,282,413)
    c.text(96,431,'Topics',16,True)
    c.text(106,469,'v Validation\n   Customer discovery\n   Market research\n> Positioning\n> Marketing\n> Operations',14)
    c.button(96,639,185,'More filters...')
    c.text(96,695,'All 148 stay discoverable.\nGroups expand on demand.\nCounts = bookmarks.',12,color='#666666')
    c.button(316,165,222,'Group: proposed topic')
    c.text(559,175,'Unreviewed / 148 matches',12)
    c.text(320,224,'EXISTING ISSUES',11,True)
    c.text(544,224,'BOOKMARKS / TOPIC GROUPS',11,True)
    c.text(827,224,'NEW PROPOSALS',11,True)
    c.box(532,257,266,276,'#eeeeee',dash=True)
    c.text(544,273,'Validation / 2 shown',13,True)
    for yy in [352,457]:
        c.line(511,360,548,yy,True)
        c.line(778,yy,827,360,True)
    c.card(316,307,195,'#133 Lean Canvas','Open / suggestions')
    c.card(548,310,230,'App market and\ncompetitor research','substack.com / unreviewed',True)
    c.card(548,415,230,'External validation for\nscratching your own itch','threads.net / unreviewed')
    c.card(827,307,205,'Customer discovery\nand demand validation','6 seeds / not created')
    c.card(532,563,266,'> Positioning','Expand to reveal bookmarks',h=68)
    c.card(532,651,266,'> Other topics','Unreviewed, including no suggestions',h=68)
    c.text(316,754,'Collapsed groups are navigation containers; bookmark nodes appear when expanded.',11)
    legend(c,316,786)
    map_controls(c,774,839)
    c.box(1052,164,356,702)
    c.text(1070,180,'Selected bookmark',16,True)
    c.text(1070,219,'App market and\ncompetitor research',19,True)
    c.button(1070,288,320,'Open source')
    c.text(1070,337,'TOPIC / PROPOSED',11,color='#666666')
    c.text(1070,360,'Customer discovery and\ndemand validation',15)
    c.button(1070,415,320,'Approve or revise topic')
    c.text(1070,467,'Disposition: undecided',14,True)
    c.button(1070,498,320,'Choose disposition...')
    c.text(1070,553,'Suggested destinations',15,True)
    c.button(1070,590,320,'Compare existing + proposal')
    c.text(1070,644,'Chosen targets: 0\nOriginal notes / working notes\nLink observations / history',13)
    c.text(1070,767,'Saved / initial state: all unreviewed',12,color='#666666')
    c.button(1070,806,155,'Previous')
    c.button(1235,806,155,'Next')
    c.save('connection-map-b1-overview')

def small_map(c,right=950):
    c.button(98,165,252,'Filter: paired alternatives / 4')
    c.button(361,165,207,'Show selection links')
    c.text(107,226,'EXISTING ISSUES',11,True)
    c.text(350,226,'BOOKMARKS',11,True)
    c.text(646,226,'NEW PROPOSALS',11,True)
    c.box(337,257,273,304,'#eeeeee',dash=True)
    c.text(351,274,'Validation / 2 matches',13,True)
    for yy in [355,466]:
        c.line(306,355,351,yy,True)
        c.line(593,yy,646,355,True)
    c.card(99,310,207,'#133 Lean Canvas','Open / suggested')
    c.card(351,310,242,'App market and\ncompetitor research','substack.com / unreviewed',True)
    c.card(351,423,242,'External validation for\nscratching your own itch','threads.net / unreviewed')
    c.card(646,310,265,'Customer discovery\nand demand validation','6 seeds / not created')
    c.card(337,598,273,'> Positioning / 2 matches','Expand topic group',h=76)
    c.text(99,719,'One canonical card per bookmark. Dragging only arranges the map.',12)
    legend(c,99,765)
    map_controls(c,655,839)

def variant2():
    c=shell('B2 / Map + destination comparison','A wider inspector compares candidate homes and their rationale side by side.','Review choice: is side-by-side comparison worth giving up some canvas width?')
    # Scale the map geometry to leave a wider inspector, preserving three columns.
    small_map(c)
    c.box(928,164,480,702)
    c.text(946,180,'App market and competitor research',19,True)
    c.button(946,217,207,'Open source')
    c.text(1170,227,'Unreviewed / saved',11,color='#666666')
    c.text(946,268,'Topic: Customer discovery and demand validation',13)
    c.button(946,296,220,'Approve / revise topic')
    c.button(1178,296,212,'Disposition: undecided')
    c.text(946,350,'Compare suggested homes',16,True)
    c.box(946,386,214,224,'#f4f4f4')
    c.box(1176,386,214,224,'#f4f4f4')
    c.text(958,398,'EXISTING / OPEN',11,True)
    c.text(1188,398,'PROPOSAL / NOT CREATED',10,True)
    c.text(958,428,'#133 Lean Canvas',15,True)
    c.text(1188,428,'Customer discovery\nand demand validation',14,True)
    c.text(958,481,'Canvas assumptions\nand competitor context.\n\nInspect rationale, caveats\nand provenance.',12)
    c.text(1188,481,'Dedicated discovery\nand validation scope.\n\nInspect scope, overlap\nand seed provenance.',12)
    c.button(958,566,190,'Select existing issue')
    c.button(1188,566,190,'Select proposal')
    c.text(946,634,'Chosen targets: 0',15,True)
    c.text(946,667,'Each target gets its own placement state.\nAn uncreated proposal stays pending.\nBrowse other issues / proposals...',13)
    c.button(946,747,444,'Original notes / link observations / history')
    c.button(946,807,215,'Previous')
    c.button(1175,807,215,'Next')
    c.save('connection-map-b2-comparison')

def variant3():
    c=shell('B3 / Map + guided review','A step-based inspector separates classification, routing and placement while preserving the map.','Review choice: guided steps for clarity, or one scrollable inspector for faster editing?')
    small_map(c)
    c.box(942,164,466,702)
    c.text(960,181,'Review bookmark / 1 of 4',17,True)
    c.text(960,221,'App market and\ncompetitor research',20,True)
    c.button(960,285,430,'Open source')
    for x,w,label,active in [(960,132,'1 Topic',True),(1101,137,'2 Destination',False),(1247,143,'3 Placement',False)]:
        c.button(x,335,w,label,active)
    c.text(960,397,'1 / Review classification',18,True)
    c.text(960,440,'Proposed primary topic',12,color='#666666')
    c.text(960,466,'Customer discovery and demand validation',15,True)
    c.text(960,502,'Correction reason and source context appear here.\nOriginal category remains read-only.',13)
    c.button(960,554,270,'Approve proposed topic')
    c.button(1242,554,148,'Choose another')
    c.button(960,606,430,'Original note / excerpt / source observations')
    c.text(960,665,'Destination: undecided / 0 selected\nPlacement: no confirmed targets\nCompletion: pending',13)
    c.text(960,744,'Steps can be revisited. Approval saves classification;\nchoosing targets and confirming placements are separate.',12,color='#666666')
    c.button(960,797,205,'Save topic + next step')
    c.button(1178,797,212,'Next bookmark')
    c.text(99,806,'Steps 2 and 3 retain the same map context and chosen-target list.',12)
    c.save('connection-map-b3-guided')

if __name__ == '__main__':
    variant1()
    variant2()
    variant3()
