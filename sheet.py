import sys
from PIL import Image
names=sys.argv[2:]; out=sys.argv[1]
ims=[Image.open('shots/'+n).resize((640,360)) for n in names]
cols=2; rows=(len(ims)+1)//2
W=Image.new('RGB',(640*cols,360*rows))
for i,im in enumerate(ims): W.paste(im,((i%cols)*640,(i//cols)*360))
W.save('shots/'+out,quality=85)
