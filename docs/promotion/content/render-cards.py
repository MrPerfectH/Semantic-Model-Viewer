"""Caption authentic captures; never redraw UI. Run with Pillow installed.
Raw screenshots are preserved. Each card pairs context with a labelled detail crop.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap
ROOT=Path(__file__).parent
FONT='/usr/share/fonts/liberation/LiberationSans-Regular.ttf'
if not Path(FONT).exists(): FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
rows=[
('58-focused-relationships','01-broad','1 / 4   Start with the whole model','43 tables. Choose one question.',(0,0,480,190),'Before: the broad model view.'),
('58-focused-relationships','02-sales','2 / 4   Select Sales','Choose the fact table in the library.',(950,165,1280,460),'Sales has 12 columns and 8 relationships.'),
('58-focused-relationships','03-focused','3 / 4   Hide unrelated tables','Choose incoming paths; Arrange, then Fit.',(950,365,1280,755),'Visual focus keeps all model tables. Inactive paths remain labelled.'),
('58-focused-relationships','04-relationship','4 / 4   Inspect one relationship','Select the Sales–Product connection.',(380,515,715,755),'Product filters Sales. This reads metadata; it does not simulate DAX or RLS.'),
('59-power-query','01-table','1 / 5   Start with Sales','Select Sales, then Open Power Query.',(950,165,1280,355),'The table identifies StageSales as its query input.'),
('59-power-query','02-inputs','2 / 5   Follow resolved inputs','Select Sales in the Power Query library.',(550,310,995,565),'The input flow includes StageSales and its parameters.'),
('59-power-query','03-stage-sales','3 / 5   Inspect StageSales','Single-click StageSales in the graph.',(880,465,1275,710),'Keep uncertainty visible: two links could not be confirmed.'),
('59-power-query','04-parameter','4 / 5   Follow StartYear','Select StartYear in the highlighted M.',(70,145,300,200),'The parameter definition contains 2019. No query is executed.'),
('59-power-query','05-m-reference','5 / 5   Read the M evidence','Return to StageSales; Open full query.',(700,200,1080,275),'Line 4 references StartYear. Static analysis does not prove a live connection.'),
('119-matrix','01-matrix','1 / 3   Open Matrix','Look across fact tables in the full model.',(20,125,840,300),'Matrix omits five non-fact relationships here; it is independent of the canvas.'),
('119-matrix','02-shared-product','2 / 3   Spot a shared dimension','Read Product across Sales, Purchases, Returns.',(25,365,425,565),'Filled cells mark active relationships with Product.'),
('119-matrix','03-product-view','3 / 3   Open Product in Tables','Select Product; choose outgoing paths; Arrange.',(950,170,1280,355),'Product connects seven fact tables. Explore Matrix in the demo.'),
]
for package,name,title,action,box,note in rows:
 im=Image.open(ROOT/package/'assets'/f'{name}.png').convert('RGB')
 out=Image.new('RGB',(1080,1350),'#f5f7fb');d=ImageDraw.Draw(out)
 def text(y,s,size=34,color='#14243c'):
  font=ImageFont.truetype(FONT,size)
  for line in textwrap.wrap(s,width=52 if size<35 else 43):
   d.text((32,y),line,font=font,fill=color); y+=size+10
  return y
 text(30,title,38);text(92,action,28)
 context=im.resize((800,500));out.paste(context,(140,150))
 text(670,'DETAIL FROM THE SAME CAPTURE',23,'#52617b')
 crop=im.crop(box);crop.thumbnail((1016,440));
 # Enlarge detail up to the available width/height without distortion.
 scale=min(1016/crop.width,440/crop.height);crop=crop.resize((round(crop.width*scale),round(crop.height*scale)))
 out.paste(crop,(32,715))
 text(1170,note,30)
 text(1300,'Synthetic Contoso • v0.3.9 • Semantic Model Viewer',20,'#52617b')
 dest=ROOT/package/'assets'/'cards';dest.mkdir(exist_ok=True)
 out.save(dest/f'{name}.png')
print('Rendered',len(rows),'cards from original screenshots')
