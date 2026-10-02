`TotalBlack-900.otf` is the static weight 900 instance of the existing
`TotalBlackVF.otf`. The profile image renderer uses it in browsers and on the
server because Skia selects the variable font's default weight 400.

Generated with FontTools 4.66.1:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont("TotalBlackVF.otf")
instantiateVariableFont(font, {"wght": 900}).save("TotalBlack-900.otf")
```
